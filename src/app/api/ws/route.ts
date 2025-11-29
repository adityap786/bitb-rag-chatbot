/**
 * API Route to initialize WebSocket server (for Vercel/Next.js custom server)
 */
import { NextRequest } from 'next/server';
import { initWebSocketServer } from '@/server/websocket-server';

export async function GET(req: any, context: { params: Promise<{}> }) {
  // This route is a placeholder for custom server integration
  // Actual WebSocket server should be started in server entrypoint
  return new Response('WebSocket server endpoint', { status: 200 });
}
