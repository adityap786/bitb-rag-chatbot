/**
 * BiTB Ingestion Status API Route
 * GET /api/ingest/status/:id
 * 
 * Returns the current status of an ingestion job.
 */

import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Validate job ID format
    if (!id || !id.startsWith('job_')) {
      return NextResponse.json(
        { error: 'Invalid job ID' },
        { status: 400 }
      );
    }

    // TODO: Fetch job status from database
    // const job = await db.ingestionJob.findUnique({
    //   where: { jobId: id }
    // });
    //
    // if (!job) {
    //   return NextResponse.json(
    //     { error: 'Job not found' },
    //     { status: 404 }
    //   );
    // }

    // Mock response for now
    const mockStatuses = ['queued', 'processing', 'completed', 'failed'];
    const mockStatus = mockStatuses[Math.floor(Math.random() * mockStatuses.length)];

    const response = {
      job_id: id,
      status: mockStatus,
      progress: mockStatus === 'completed' ? 100 : mockStatus === 'processing' ? 65 : 0,
      pages_processed: mockStatus === 'completed' ? 20 : mockStatus === 'processing' ? 13 : 0,
      total_pages: 20,
      chunks_created: mockStatus === 'completed' ? 245 : mockStatus === 'processing' ? 156 : 0,
      error: mockStatus === 'failed' ? 'Failed to crawl website: Connection timeout' : null,
      started_at: new Date(Date.now() - 2 * 60 * 1000).toISOString(), // 2 minutes ago
      completed_at: mockStatus === 'completed' ? new Date().toISOString() : null
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('Ingestion Status Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Production Implementation with Database:
 * 
 * import { db } from '@/lib/db';
 * 
 * const job = await db.ingestionJob.findUnique({
 *   where: { jobId: id },
 *   include: {
 *     trial: true
 *   }
 * });
 * 
 * if (!job) {
 *   return NextResponse.json(
 *     { error: 'Job not found' },
 *     { status: 404 }
 *   );
 * }
 * 
 * return NextResponse.json({
 *   job_id: job.jobId,
 *   status: job.status,
 *   progress: job.progress,
 *   pages_processed: job.pagesProcessed,
 *   total_pages: job.totalPages,
 *   chunks_created: job.chunksCreated,
 *   error: job.error,
 *   started_at: job.startedAt.toISOString(),
 *   completed_at: job.completedAt?.toISOString()
 * });
 */
