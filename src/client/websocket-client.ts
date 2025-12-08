/**
 * WebSocket Client for Chat Widget (Socket.io)
 */
import io from 'socket.io-client';

export function createWebSocketClient(token: string) {
  const socket = io('/ws', {
    auth: { token },
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  });

  socket.on('connect', () => {
    console.log('WebSocket connected:', socket.id);
  });

  socket.on('connected', (data: any) => {
    console.log('Connected to tenant/session:', data);
  });

  socket.on('chat_response', (msg: any) => {
    console.log('Chat response:', msg);
  });

  socket.on('disconnect', (reason: any) => {
    console.log('WebSocket disconnected:', reason);
  });

  return socket;
}
