// ResearchAgent - Specialized for web/research queries
import { BaseAgent, AgentContext, AgentResult } from './base-agent';

export interface ResearchAgentOptions {
  search: (query: string, context: AgentContext) => Promise<string>;
}

export class ResearchAgent extends BaseAgent {
  private readonly search: (query: string, context: AgentContext) => Promise<string>;

  constructor(options: ResearchAgentOptions) {
    super();
    this.search = options.search;
  }

  async run(query: string, context: AgentContext): Promise<AgentResult> {
    const answer = await this.search(query, context);
    return { answer };
  }
}
