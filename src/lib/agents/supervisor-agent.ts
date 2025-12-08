// SupervisorAgent - Orchestrates agent selection and delegation
import { BaseAgent, AgentContext, AgentResult } from './base-agent';
import { ReActAgent } from './react-agent';
import { KnowledgeBaseAgent } from './kb-agent';
import { ResearchAgent } from './research-agent';
import { SupportAgent } from './support-agent';
import { EscalationAgent } from './escalation-agent';

export interface SupervisorAgentOptions {
  agents: Record<string, BaseAgent>;
  router: (query: string, context: AgentContext) => Promise<string>; // returns agent key
}

export class SupervisorAgent extends BaseAgent {
  private readonly agents: Record<string, BaseAgent>;
  private readonly router: (query: string, context: AgentContext) => Promise<string>;

  constructor(options: SupervisorAgentOptions) {
    super();
    this.agents = options.agents;
    this.router = options.router;
  }

  async run(query: string, context: AgentContext): Promise<AgentResult> {
    const agentKey = await this.router(query, context);
    const agent = this.agents[agentKey];
    if (!agent) throw new Error(`No agent found for key: ${agentKey}`);
    return agent.run(query, context);
  }
}
