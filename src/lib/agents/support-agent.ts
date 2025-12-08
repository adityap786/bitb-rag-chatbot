// SupportAgent - Specialized for support/escalation queries
import { BaseAgent, AgentContext, AgentResult } from './base-agent';

export interface SupportAgentOptions {
  handler: (query: string, context: AgentContext) => Promise<string>;
}

export class SupportAgent extends BaseAgent {
  private readonly handler: (query: string, context: AgentContext) => Promise<string>;

  constructor(options: SupportAgentOptions) {
    super();
    this.handler = options.handler;
  }

  async run(query: string, context: AgentContext): Promise<AgentResult> {
    const answer = await this.handler(query, context);
    return { answer };
  }
}
