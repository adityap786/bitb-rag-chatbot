// ConversationBufferMemory - stores last N messages per session/tenant
import { MemoryBackend } from './memory-backend';

export interface Message {
  id: string;
  sender: string;
  content: string;
  timestamp: number;
}

export class ConversationBufferMemory {
  private readonly backend: MemoryBackend;
  private readonly maxMessages: number;
  private readonly tenantId: string;

  constructor(options: { maxMessages?: number; backend: MemoryBackend; tenantId: string }) {
    this.backend = options.backend;
    this.maxMessages = options.maxMessages ?? 50;
    this.tenantId = options.tenantId;
  }

  private key(sessionId: string) {
    return `mem:${this.tenantId}:${sessionId}:buffer`;
  }

  async addMessage(sessionId: string, message: Message): Promise<void> {
    await this.backend.lpush(this.key(sessionId), message);
    await this.backend.ltrim(this.key(sessionId), 0, this.maxMessages - 1);
  }

  async getHistory(sessionId: string, limit?: number): Promise<Message[]> {
    return (await this.backend.lrange(this.key(sessionId), 0, (limit ?? this.maxMessages) - 1)) as Message[];
  }

  async clear(sessionId: string): Promise<void> {
    await this.backend.del(this.key(sessionId));
  }
}
