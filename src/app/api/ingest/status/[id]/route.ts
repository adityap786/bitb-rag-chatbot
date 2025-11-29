/**
 * BiTB Ingestion Status API Route
 * GET /api/ingest/status/:id
 * 
 * Returns the current status of an ingestion job.
 */

import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: any,
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

    // Fetch job status from Supabase
    const supabaseUrl = process.env.SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Query job by job_id
    const { data: job, error: dbError } = await supabase
      .from('ingestion_jobs')
      .select('*')
      .eq('job_id', id)
      .single();

    if (dbError || !job) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      );
    }

    // Return all relevant fields
    const response = {
      job_id: job.job_id,
      status: job.status,
      progress: job.progress,
      pages_processed: job.pages_processed,
      total_pages: job.total_pages,
      chunks_created: job.chunks_created,
      error: job.error,
      started_at: job.started_at,
      completed_at: job.completed_at,
      index_path: job.index_path
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
