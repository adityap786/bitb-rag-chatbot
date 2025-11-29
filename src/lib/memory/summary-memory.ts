// ConversationSummaryMemory - summarizes old messages for context compression
import { MemoryBackend } from './memory-backend';
import { createLlm, LLMAdapter } from '../rag/llm-factory';
import { CONVERSATION_SUMMARY_PROMPT, formatPrompt } from '../prompts';

export class ConversationSummaryMemory {
  private readonly backend: MemoryBackend;
  private readonly summarizeAfter: number;
  private llm: LLMAdapter | null = null;

  constructor(options: { backend: MemoryBackend; summarizeAfter?: number }) {
    this.backend = options.backend;
    this.summarizeAfter = options.summarizeAfter ?? 20;
  }

  private key(sessionId: string) {
    return `mem:${sessionId}:summary`;
  }

  async addMessage(sessionId: string, message: string): Promise<void> {
    // Append message, then summarize if needed
    const history = ((await this.backend.get(this.key(sessionId))) as string[]) || [];
    history.push(message);
    if (history.length >= this.summarizeAfter) {
      const summary = await this.summarize(history.join('\n'));
      await this.backend.set(this.key(sessionId), [summary]);
    } else {
      await this.backend.set(this.key(sessionId), history);
    }
  }

  async getSummary(sessionId: string): Promise<string> {
    const arr = (await this.backend.get(this.key(sessionId))) as string[];
    return arr && arr.length ? arr[arr.length - 1] : '';
  }

  private async summarize(text: string): Promise<string> {
    if (!this.llm) this.llm = await createLlm();
    if (!this.llm) throw new Error('LLM not available');
    const prompt = formatPrompt(CONVERSATION_SUMMARY_PROMPT, { conversation: text });
    return String(await this.llm.invoke(prompt));
  }
}
