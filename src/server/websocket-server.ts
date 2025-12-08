/**
 * WebSocket Server (Socket.io) for Multi-Tenant Chatbot
 * - Multi-tenant isolation
 * - JWT authentication
 * - Real-time streaming for chat responses
 */

import { Server } from 'socket.io';
import type { Server as HttpServer } from 'http';
import { verifyJWT } from '../lib/jwt.js';
import { getPlanDetector } from '../lib/plan-detector.js';

interface TenantSocketData {
  tenantId: string;
  sessionId: string;
  planType: string;
}

let io: Server | null = null;

export function initWebSocketServer(server: HttpServer) {
  if (io) return io;
  io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
    path: '/ws',
  });

  io.use(async (socket: any, next: any) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Missing auth token'));
    const payload = await verifyJWT(token);
    if (!payload || !payload.tenantId || !payload.sessionId) {
      return next(new Error('Invalid token'));
    }
    // Attach tenant/session info
    (socket.data as TenantSocketData).tenantId = payload.tenantId;
    (socket.data as TenantSocketData).sessionId = payload.sessionId;
    // Detect plan type
    const planDetector = getPlanDetector();
    const config = await planDetector.getTenantPlan(payload.tenantId);
    (socket.data as TenantSocketData).planType = config?.plan_type || 'service';
    next();
  });

  io.on('connection', (socket: any) => {
    const { tenantId, sessionId, planType } = socket.data as TenantSocketData;
    // Join tenant-specific room for isolation
    socket.join(`tenant:${tenantId}`);
    // Join session-specific room
    socket.join(`session:${sessionId}`);
    // Emit connection confirmation
    socket.emit('connected', { tenantId, sessionId, planType });

    // Listen for chat messages
    socket.on('chat_message', async (msg: any) => {
      // TODO: Integrate RAG pipeline and plan-specific features
      // For now, echo message
      io?.to(`session:${sessionId}`).emit('chat_response', {
        reply: `Echo: ${msg}`,
        timestamp: new Date().toISOString(),
      });
    });

    // Handle disconnect
    socket.on('disconnect', (reason: any) => {
      // Optionally log disconnects
    });
  });

  return io;
}
