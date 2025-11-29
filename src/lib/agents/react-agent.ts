// ReActAgent - Reasoning + Acting agent with tool use
import { BaseAgent, AgentContext, AgentResult } from './base-agent';

export interface Tool {
  name: string;
  description: string;
  run(input: Record<string, any>, context: AgentContext): Promise<string>;
}

export interface ReActAgentOptions {
  tools: Tool[];
  maxIterations?: number;
  verbose?: boolean;
}

export interface ReActStep {
  thought: string;
  action: { tool: string; input: Record<string, any> } | null;
  observation: string | null;
}

export class ReActAgent extends BaseAgent {
  private readonly tools: Map<string, Tool>;
  private readonly maxIterations: number;
  private readonly verbose: boolean;

  constructor(options: ReActAgentOptions) {
    super();
    this.tools = new Map(options.tools.map(t => [t.name, t]));
    this.maxIterations = options.maxIterations ?? 5;
    this.verbose = options.verbose ?? false;
  }

  async run(query: string, context: AgentContext): Promise<AgentResult> {
    const steps: ReActStep[] = [];
    let currentQuery = query;
    for (let i = 0; i < this.maxIterations; i++) {
      const step = await this.think(currentQuery, steps, context);
      steps.push(step);
      if (step.action) {
        const tool = this.tools.get(step.action.tool);
        if (!tool) throw new Error(`Unknown tool: ${step.action.tool}`);
        const observation = await tool.run(step.action.input, context);
        step.observation = observation;
        currentQuery = observation;
      } else if (step.observation) {
        return { answer: step.observation, steps };
      } else {
        break;
      }
    }
    return { answer: steps[steps.length - 1]?.observation || '', steps };
  }

  private async think(query: string, history: ReActStep[], context: AgentContext): Promise<ReActStep> {
    // TODO: Integrate with LLM for thought/action generation
    // For now, mock a final answer
    return { thought: 'Final answer', action: null, observation: query };
  }
}
