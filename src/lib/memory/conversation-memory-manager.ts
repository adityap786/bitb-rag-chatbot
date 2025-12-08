// ConversationMemoryManager - orchestrates buffer, summary, and entity memory for context
import { ConversationBufferMemory, Message } from './buffer-memory';
import { ConversationSummaryMemory } from './summary-memory';
import { EntityMemory } from './entity-memory';
import { MemoryBackend, InMemoryBackend } from './memory-backend';

export interface ConversationMemoryOptions {
  backend?: MemoryBackend;
  tenantId?: string;
  maxMessages?: number;
  summaryThreshold?: number;
}

export class ConversationMemoryManager {
  private readonly buffer: ConversationBufferMemory;
  private readonly summary: ConversationSummaryMemory;
  private readonly entity: EntityMemory;
  private readonly tenantId: string;

  constructor(options: ConversationMemoryOptions = {}) {
    const backend = options.backend ?? new InMemoryBackend();
    this.tenantId = options.tenantId ?? 'default';
    
    this.buffer = new ConversationBufferMemory({ 
      backend, 
      tenantId: this.tenantId,
      maxMessages: options.maxMessages,
    });
    this.summary = new ConversationSummaryMemory({ 
      backend,
      summarizeAfter: options.summaryThreshold,
    });
    this.entity = new EntityMemory({ 
      backend, 
      tenantId: this.tenantId,
    });
  }

  async addMessage(sessionId: string, message: Message): Promise<void> {
    await this.buffer.addMessage(sessionId, message);
    await this.summary.addMessage(sessionId, message.content);
    await this.entity.extractAndStore(sessionId, message.content);
  }

  async getHistory(sessionId: string): Promise<Message[]> {
    return this.buffer.getHistory(sessionId);
  }

  async buildContext(sessionId: string, query: string): Promise<any> {
    const history = await this.buffer.getHistory(sessionId);
    const summary = await this.summary.getSummary(sessionId);
    const entities = await this.entity.getEntities(sessionId);
    return { history, summary, entities, query };
  }

  async clear(sessionId: string): Promise<void> {
    await this.buffer.clear(sessionId);
    // Summary and entity memory clear handled by buffer clear
  }
}
