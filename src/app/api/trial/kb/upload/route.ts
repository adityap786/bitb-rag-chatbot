import { NextRequest, NextResponse } from 'next/server';
import { verify } from 'jsonwebtoken';
import { createHash } from 'crypto';
import type { KBUploadResponse } from '@/types/trial';
import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import {
  validateFileParams,
  validateFile,
  sanitizeText,
} from '@/lib/trial/validation';
import {
  AuthenticationError,
  ValidationError,
  NotFoundError,
  InternalError,
} from '@/lib/trial/errors';
import { verifyBearerToken } from '@/lib/trial/auth';
import TrialLogger from '@/lib/trial/logger';
import { createLazyServiceClient } from '@/lib/supabase-client';

const supabase = createLazyServiceClient();

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_FILES = 10;
const MAX_TOTAL_SIZE = 50 * 1024 * 1024;
const ALLOWED_TYPES = ['.pdf', '.txt', '.md', '.docx', '.doc'];

/**
 * Extract text from file based on type
 */
async function extractTextFromFile(file: File, buffer: Buffer): Promise<string> {
  const ext = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));

  try {
    if (ext === '.txt' || ext === '.md') {
      return buffer.toString('utf-8');
    }

    if (ext === '.pdf') {
      const parser = new PDFParse({ data: buffer });
      const result = await parser.getText();
      await parser.destroy();
      return result.text;
    }

    if (ext === '.docx' || ext === '.doc') {
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    }
  } catch (error) {
    console.error(`Failed to parse ${file.name}:`, error);
    return `[Error parsing ${file.name}]`;
  }

  return `[Unsupported format ${ext}]`;
}

export async function POST(req: any, context: { params: Promise<{}> }) {
  const startTime = Date.now();
  const requestId = crypto.randomUUID();

  try {
    // Verify authentication
    let token;
    try {
      token = verifyBearerToken(req);
    } catch (err: any) {
      TrialLogger.logAuth('failure', undefined, { requestId, error: err.message });
      TrialLogger.logRequest('POST', '/api/trial/kb/upload', err.statusCode || 401, Date.now() - startTime, {
        requestId,
      });
      return NextResponse.json(
        { error: err.message },
        { status: err.statusCode || 401 }
      );
    }

    const { tenantId } = token;

    // Check tenant exists and is active
    const { data: tenant, error: tenantError } = await supabase
      .from('trial_tenants')
      .select('status')
      .eq('tenant_id', tenantId)
      .single();

    if (tenantError || !tenant) {
      throw new NotFoundError('Tenant');
    }

    if (tenant.status !== 'active') {
      TrialLogger.warn('Attempting to upload KB to inactive trial', { requestId, tenantId });
      throw new ValidationError('Trial is not active');
    }

    // Parse multipart form data
    const formData = await req.formData();
    const files = formData.getAll('files') as File[];

    if (files.length === 0) {
      throw new ValidationError('No files provided');
    }

    // Calculate total size
    let totalSize = 0;
    for (const file of files) {
      totalSize += file.size;
    }

    // Validate file parameters
    try {
      validateFileParams(files.length, totalSize, MAX_FILES, MAX_FILE_SIZE, MAX_TOTAL_SIZE);
    } catch (err: any) {
      if (err instanceof ValidationError) {
        TrialLogger.logRequest('POST', '/api/trial/kb/upload', 400, Date.now() - startTime, {
          requestId,
          tenantId,
        });
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      throw err;
    }

    const uploadedFiles: KBUploadResponse['uploadedFiles'] = [];

    // Process and store files
    for (const file of files) {
      try {
        // Validate individual file
        validateFile(file.name, file.size, ALLOWED_TYPES, MAX_FILE_SIZE);

        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Extract text content
        const rawText = await extractTextFromFile(file, buffer);

        if (!rawText || rawText.trim().length === 0) {
          TrialLogger.warn('Empty file content', {
            requestId,
            tenantId,
            filename: file.name,
          });
          uploadedFiles.push({
            filename: file.name,
            kbId: '',
            status: 'failed',
            error: 'File appears to be empty or unreadable',
          } as any);
          continue;
        }

        // Compute content hash for deduplication
        const contentHash = createHash('sha256').update(rawText).digest('hex');

        // Check if already exists
        const { data: existing, error: checkError } = await supabase
          .from('knowledge_base')
          .select('kb_id')
          .eq('tenant_id', tenantId)
          .eq('content_hash', contentHash)
          .single();

        if (checkError && checkError.code !== 'PGRST116') {
          throw new InternalError('Failed to check knowledge base', new Error(checkError.message));
        }

        if (existing) {
          uploadedFiles.push({
            filename: file.name,
            kbId: existing.kb_id,
            status: 'completed',
          });
          continue;
        }

        // Insert into knowledge base
        const { data: kb, error: insertError } = await supabase
          .from('knowledge_base')
          .insert({
            tenant_id: tenantId,
            source_type: 'upload',
            content_hash: contentHash,
            raw_text: sanitizeText(rawText),
            metadata: {
              filename: file.name,
              size: file.size,
              type: file.type,
            },
            processed_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (insertError || !kb) {
          TrialLogger.error('Failed to insert KB', new Error(insertError?.message || 'Unknown'), {
            requestId,
            tenantId,
            filename: file.name,
          });
          uploadedFiles.push({
            filename: file.name,
            kbId: '',
            status: 'failed',
            error: 'Failed to process file',
          } as any);
          continue;
        }

        uploadedFiles.push({
          filename: file.name,
          kbId: kb.kb_id,
          status: 'completed',
        });

        TrialLogger.logModification('knowledge_base', 'create', kb.kb_id, tenantId, {
          requestId,
          sourceType: 'upload',
          filename: file.name,
        });
      } catch (err) {
        TrialLogger.error('Error processing file', err as Error, {
          requestId,
          tenantId,
          filename: file.name,
        });
        uploadedFiles.push({
          filename: file.name,
          kbId: '',
          status: 'failed',
          error: 'Error processing file',
        } as any);
      }
    }

    TrialLogger.logRequest('POST', '/api/trial/kb/upload', 200, Date.now() - startTime, {
      requestId,
      tenantId,
      fileCount: uploadedFiles.length,
    });

    return NextResponse.json({
      uploadedFiles,
      processingEstimate: 5,
    });
  } catch (error) {
    const duration = Date.now() - startTime;

    if (error instanceof AuthenticationError) {
      TrialLogger.logRequest('POST', '/api/trial/kb/upload', error.statusCode, duration, { requestId });
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

    if (error instanceof ValidationError) {
      TrialLogger.logRequest('POST', '/api/trial/kb/upload', error.statusCode, duration, { requestId });
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

    if (error instanceof NotFoundError) {
      TrialLogger.logRequest('POST', '/api/trial/kb/upload', 404, duration, { requestId });
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    if (error instanceof InternalError) {
      TrialLogger.error(error.message, error, { requestId });
      TrialLogger.logRequest('POST', '/api/trial/kb/upload', 500, duration, { requestId });
      return NextResponse.json(
        { error: 'Failed to upload files' },
        { status: 500 }
      );
    }

    TrialLogger.error('Unexpected error in KB upload', error as Error, { requestId });
    TrialLogger.logRequest('POST', '/api/trial/kb/upload', 500, duration, { requestId });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
