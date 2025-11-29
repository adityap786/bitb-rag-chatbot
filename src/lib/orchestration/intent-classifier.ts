// IntentClassifier - LLM+rules multi-label intent classification
import { createLlm, LLMAdapter } from '../rag/llm-factory';
import { ExtractedEntity } from '../rag/metadata-extractors/entity-extractor';
import { INTENT_CLASSIFICATION_PROMPT, formatPrompt } from '../prompts';

export type IntentCategory =
  | 'question_answering'
  | 'task_execution'
  | 'clarification'
  | 'greeting'
  | 'feedback'
  | 'escalation'
  | 'out_of_scope';

export interface ClassifiedIntent {
  primary: IntentCategory;
  secondary?: IntentCategory;
  confidence: number;
  entities: ExtractedEntity[];
  suggestedAction: string;
}

export interface IntentClassifierOptions {
  model?: string;
  batchSize?: number;
}

export class IntentClassifier {
  private llm: LLMAdapter | null = null;
  private initializing?: Promise<void> | null = null;
  private readonly batchSize: number;

  constructor(options: IntentClassifierOptions = {}) {
    this.batchSize = options.batchSize ?? 8;
  }

  private async ensureLlm(): Promise<LLMAdapter> {
    if (this.llm) return this.llm;
    if (this.initializing) {
      await this.initializing;
      if (!this.llm) throw new Error('Failed to initialize LLM');
      return this.llm;
    }
    this.initializing = (async () => {
      const adapter = await createLlm();
      if (!adapter) throw new Error('LLM adapter not available');
      this.llm = adapter;
    })();
    await this.initializing;
    this.initializing = null;
    return this.llm!;
  }

  async classify(query: string, context?: any): Promise<ClassifiedIntent> {
    const llm = await this.ensureLlm();
    const contextStr = context ? JSON.stringify(context) : 'None';
    const prompt = formatPrompt(INTENT_CLASSIFICATION_PROMPT, { query, context: contextStr });
    const resp = await llm.invoke(prompt);
    try {
      const parsed = JSON.parse(resp);
      return {
        primary: parsed.primary,
        secondary: parsed.secondary,
        confidence: parsed.confidence ?? 1,
        entities: [], // Entity extraction can be added
        suggestedAction: parsed.suggestedAction || '',
      };
    } catch {
      // Fallback: treat as question_answering
      return {
        primary: 'question_answering',
        confidence: 0.5,
        entities: [],
        suggestedAction: '',
      };
    }
  }

  async classifyBatch(queries: string[]): Promise<ClassifiedIntent[]> {
    const results: ClassifiedIntent[] = [];
    for (let i = 0; i < queries.length; i += this.batchSize) {
      const batch = queries.slice(i, i + this.batchSize);
      const batchResults = await Promise.all(batch.map(q => this.classify(q)));
      results.push(...batchResults);
    }
    return results;
  }
}
