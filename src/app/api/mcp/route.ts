/**
 * MCP API Route
 * POST /api/mcp
 * 
 * Central endpoint for all MCP tool requests.
 * Routes to appropriate handlers based on tool name.
 */

import { NextRequest } from 'next/server';
import { routeMCPRequest, registerToolHandler } from '@/lib/mcp/router';
import {
  handleRagQuery,
  handleIngestDocuments,
  handleGetTrialStatus,
  handleUpdateSettings,
} from '@/lib/mcp/handlers';

// Register tool handlers
registerToolHandler('rag_query', handleRagQuery);
registerToolHandler('ingest_documents', handleIngestDocuments);
registerToolHandler('get_trial_status', handleGetTrialStatus);
registerToolHandler('update_settings', handleUpdateSettings);

export const runtime = 'nodejs';

export async function POST(request: any, context: { params: Promise<{}> }) {
  return routeMCPRequest(request);
}
