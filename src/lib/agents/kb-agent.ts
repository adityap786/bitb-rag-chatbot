// KnowledgeBaseAgent - Specialized for knowledge base retrieval
import { BaseAgent, AgentContext, AgentResult } from './base-agent';

export interface KnowledgeBaseAgentOptions {
  retriever: (query: string, context: AgentContext) => Promise<string>;
}

export class KnowledgeBaseAgent extends BaseAgent {
  private readonly retriever: (query: string, context: AgentContext) => Promise<string>;

  constructor(options: KnowledgeBaseAgentOptions) {
    super();
    this.retriever = options.retriever;
  }

  async run(query: string, context: AgentContext): Promise<AgentResult> {
    const answer = await this.retriever(query, context);
    return { answer };
  }
}
