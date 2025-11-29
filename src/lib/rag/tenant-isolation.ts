import crypto from 'crypto';
import {
  isLangChainDoc,
  isLlamaIndexDoc,
  langchainToLlama,
  llamaToLangchainShape,
  LlamaIndexDoc,
  LangChainDocShape,
} from './llamaindex-adapters';
import { logger } from '../observability/logger';

const TENANT_METADATA_KEYS = ['tenant_id', 'tenantId', 'tenant', 'owner_tenant_id'];

export interface TenantIsolationContext {
  operation: string;
  query?: string;
  documentIds?: string[];
}

export class TenantIsolationViolationError extends Error {
  constructor(message: string, public readonly context?: TenantIsolationContext) {
    super(message);
    this.name = 'TenantIsolationViolationError';
  }
}

export class TenantIsolationGuard {
  private readonly hashedTenantId: string;

  constructor(private readonly tenantId: string) {
    this.hashedTenantId = crypto.createHash('sha256').update(tenantId).digest('hex');
  }

  /**
   * Accepts an array of LangChain or LlamaIndex documents and returns the same type,
   * with tenant_id enforced in metadata. Type is preserved.
   */
  enforceWriteIsolation<T extends LangChainDocShape | LlamaIndexDoc>(documents: T[]): T[] {
    return documents.map((doc) => {
      let metadata = { ...(doc.metadata || {}), tenant_id: this.tenantId };
      if (isLangChainDoc(doc)) {
        // Return a LangChain-shaped plain object (avoid hard runtime dependency on LangChain)
        // Cast via `unknown` first to satisfy TypeScript when `T` may vary.
        return { pageContent: doc.pageContent ?? doc.content ?? '', metadata } as unknown as T;
      } else if (isLlamaIndexDoc(doc)) {
        // Return a new LlamaIndexDoc shape
        return { ...doc, metadata } as T;
      } else {
        // Fallback: just add metadata
        return { ...doc, metadata } as T;
      }
    });
  }

  /**
   * Accepts an array of LangChain or LlamaIndex documents and validates tenant isolation.
   * Throws on any violation. Type is preserved.
   */
  validateRetrievedDocuments<T extends LangChainDocShape | LlamaIndexDoc>(documents: T[], context: TenantIsolationContext): void {
    documents.forEach((doc, index) => {
      let docTenantId: string | undefined;
      if (isLangChainDoc(doc) || isLlamaIndexDoc(doc)) {
        docTenantId = this.extractTenantId(doc);
      } else {
        docTenantId = undefined;
      }
      if (!docTenantId) {
        this.handleViolation(`Document ${index} missing tenant identifier`, context, doc);
      }
      if (docTenantId !== this.tenantId) {
        this.handleViolation(
          `Document ${index} belongs to tenant ${docTenantId}, expected ${this.tenantId}`,
          context,
          doc
        );
      }
    });
    logger.debug('Tenant isolation verified', {
      tenantIdHash: this.hashedTenantId,
      documentCount: documents.length,
      operation: context.operation,
    });
  }

  assertPayloadTenant(payloadTenantId: string | undefined, context: TenantIsolationContext): void {
    if (!payloadTenantId) {
      this.handleViolation('Missing tenant_id on payload', context);
    }
    if (payloadTenantId !== this.tenantId) {
      this.handleViolation(
        `Payload tenant_id mismatch. Got ${payloadTenantId}, expected ${this.tenantId}`,
        context
      );
    }
  }

  /**
   * Extracts tenant_id from either LangChain or LlamaIndex document shapes.
   */
  private extractTenantId(doc: any): string | undefined {
    const metadata = doc.metadata || {};
    for (const key of TENANT_METADATA_KEYS) {
      const value = metadata[key];
      if (typeof value === 'string' && value.length > 0) {
        return value;
      }
    }
    return undefined;
  }

  private handleViolation(message: string, context: TenantIsolationContext, doc?: any): never {
    logger.error('Tenant isolation violation detected', {
      tenantIdHash: this.hashedTenantId,
      message,
      context,
      offendingMetadata: doc?.metadata,
    });
    throw new TenantIsolationViolationError(message, context);
  }
}
