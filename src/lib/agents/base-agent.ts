// BaseAgent - abstract agent interface
export interface AgentContext {
  sessionId: string;
  tenantId: string;
  userId?: string;
  [key: string]: any;
}

export interface AgentResult {
  answer: string;
  steps?: any[];
  context?: any;
}

export abstract class BaseAgent {
  abstract run(query: string, context: AgentContext): Promise<AgentResult>;
}
