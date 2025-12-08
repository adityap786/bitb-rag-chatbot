// EntityMemory - tracks entities mentioned in conversation per session/tenant
import { MemoryBackend } from './memory-backend';
import { createEntityExtractor, ExtractedEntity } from '../rag/metadata-extractors/entity-extractor';

export class EntityMemory {
  private readonly backend: MemoryBackend;
  private readonly tenantId: string;
  private readonly entityExtractor = createEntityExtractor();

  constructor(options: { backend: MemoryBackend; tenantId: string }) {
    this.backend = options.backend;
    this.tenantId = options.tenantId;
  }

  private key(sessionId: string) {
    return `mem:${this.tenantId}:${sessionId}:entities`;
  }

  async extractAndStore(sessionId: string, message: string): Promise<void> {
    const entities = await this.entityExtractor.extract(message);
    await this.backend.set(this.key(sessionId), entities);
  }

  async getEntities(sessionId: string): Promise<ExtractedEntity[]> {
    return (await this.backend.get(this.key(sessionId))) as ExtractedEntity[] || [];
  }

  async getEntityContext(sessionId: string, entityName: string): Promise<ExtractedEntity | undefined> {
    const entities = await this.getEntities(sessionId);
    return entities.find(e => e.normalizedText === entityName.toLowerCase().replace(/\s+/g, '_'));
  }
}
