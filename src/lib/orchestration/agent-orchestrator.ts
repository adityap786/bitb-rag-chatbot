// Agent Orchestrator: Multi-agent system integration for RAG pipeline
import {
  ReActAgent,
  KnowledgeBaseAgent,
  ResearchAgent,
  SupportAgent,
  EscalationAgent,
  SupervisorAgent,
  AgentContext,
  AgentResult,
} from '../agents';
import { Tool } from '../agents/react-agent';
import { IntentClassifier, ClassifiedIntent } from './intent-classifier';

// Tool registry for ReActAgent (add real tools as needed)
const tools: Tool[] = [
  // Example: { name: 'search', description: 'Web search', run: async (input, ctx) => '...' }
];

// Instantiate agents
const kbAgent = new KnowledgeBaseAgent({
  retriever: async (query, context) => {
    // TODO: Integrate with RAG retriever
    return 'Knowledge base answer (mock)';
  },
});

const researchAgent = new ResearchAgent({
  search: async (query, context) => {
    // TODO: Integrate with web search
    return 'Research answer (mock)';
  },
});

const supportAgent = new SupportAgent({
  handler: async (query, context) => {
    // TODO: Integrate with support workflow
    return 'Support answer (mock)';
  },
});

const escalationAgent = new EscalationAgent({
  escalate: async (query, context) => {
    // TODO: Integrate with escalation workflow
    return 'Escalation answer (mock)';
  },
});

const reactAgent = new ReActAgent({
  tools,
  maxIterations: 5,
  verbose: false,
});

// Intent-to-agent mapping
const intentToAgentKey: Record<string, string> = {
  question_answering: 'kb',
  task_execution: 'react',
  clarification: 'support',
  greeting: 'support',
  feedback: 'support',
  escalation: 'escalation',
  out_of_scope: 'research',
};

const agents = {
  kb: kbAgent,
  react: reactAgent,
  research: researchAgent,
  support: supportAgent,
  escalation: escalationAgent,
};

const supervisor = new SupervisorAgent({
  agents,
  router: async (query, context) => {
    // Use intent classifier to pick agent
    const classifier = new IntentClassifier();
    const intent: ClassifiedIntent = await classifier.classify(query, context);
    return intentToAgentKey[intent.primary] || 'kb';
  },
});

export async function orchestrateAgentQuery(query: string, context: AgentContext): Promise<AgentResult> {
  return supervisor.run(query, context);
}
