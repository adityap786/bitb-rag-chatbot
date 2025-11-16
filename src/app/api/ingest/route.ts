/**
 * BiTB Ingestion API Route
 * POST /api/ingest
 * 
 * Starts an ingestion job for crawling a website or processing uploaded files.
 * Returns a job ID that can be used to check ingestion status.
 */

import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { trial_token, data_source } = body;

    // Validate required fields
    if (!trial_token || !data_source) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Validate data source
    if (!data_source.type || !['url', 'files'].includes(data_source.type)) {
      return NextResponse.json(
        { error: 'Invalid data source type' },
        { status: 400 }
      );
    }

    // Validate URL if type is 'url'
    if (data_source.type === 'url' && !data_source.url) {
      return NextResponse.json(
        { error: 'URL is required for url data source' },
        { status: 400 }
      );
    }

    // Validate files if type is 'files'
    if (data_source.type === 'files' && (!data_source.files || data_source.files.length === 0)) {
      return NextResponse.json(
        { error: 'Files are required for files data source' },
        { status: 400 }
      );
    }

    // Generate job ID
    const job_id = 'job_' + randomBytes(16).toString('hex');

    // TODO: Queue ingestion job for Python worker
    // await queueIngestionJob({
    //   job_id,
    //   trial_token,
    //   data_source
    // });

    // TODO: Save job to database
    // await db.ingestionJob.create({
    //   data: {
    //     jobId: job_id,
    //     trialToken: trial_token,
    //     status: 'queued',
    //     dataSource: data_source,
    //     startedAt: new Date()
    //   }
    // });

    // Estimate time based on data source
    let estimated_time_minutes = 3;
    if (data_source.type === 'url') {
      const depth = data_source.crawl_depth || 2;
      estimated_time_minutes = depth * 2; // Rough estimate
    } else if (data_source.type === 'files') {
      estimated_time_minutes = Math.ceil(data_source.files.length / 2);
    }

    const response = {
      job_id,
      status: 'queued',
      estimated_time_minutes,
      message: 'Ingestion job queued successfully'
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('Ingestion Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Production Implementation with Job Queue:
 * 
 * import { queueIngestionJob } from '@/lib/queue';
 * import { db } from '@/lib/db';
 * 
 * // Queue job for Python worker
 * await queueIngestionJob({
 *   job_id,
 *   trial_token,
 *   data_source,
 *   priority: 'normal'
 * });
 * 
 * // Save job record
 * await db.ingestionJob.create({
 *   data: {
 *     jobId: job_id,
 *     trialToken: trial_token,
 *     status: 'queued',
 *     dataSource: data_source,
 *     startedAt: new Date(),
 *     progress: 0
 *   }
 * });
 * 
 * // Python worker will:
 * // 1. Fetch the job from queue
 * // 2. Process the data source (crawl or extract files)
 * // 3. Chunk the text
 * // 4. Generate embeddings
 * // 5. Store in FAISS
 * // 6. Update job status in database
 */
