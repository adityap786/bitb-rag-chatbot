// EscalationAgent - Specialized for escalation/hand-off
import { BaseAgent, AgentContext, AgentResult } from './base-agent';

export interface EscalationAgentOptions {
  escalate: (query: string, context: AgentContext) => Promise<string>;
}

export class EscalationAgent extends BaseAgent {
  private readonly escalate: (query: string, context: AgentContext) => Promise<string>;

  constructor(options: EscalationAgentOptions) {
    super();
    this.escalate = options.escalate;
  }

  async run(query: string, context: AgentContext): Promise<AgentResult> {
    const answer = await this.escalate(query, context);
    return { answer };
  }
}
