/**
 * Conversation Flow Builder with Branching Logic
 * 
 * Visual-first conversation design for e-commerce/service businesses.
 * Enables non-technical teams to create guided conversations with:
 * - Conditional branching based on user responses
 * - Integration with product catalog and CRM
 * - Revenue attribution per flow
 * 
 * Business Value:
 * - Reduce support tickets through guided troubleshooting
 * - Increase conversions with product recommendation flows
 * - Enable non-engineers to create and update flows
 */

export interface ConversationFlow {
  id: string;
  name: string;
  description: string;
  trigger: FlowTrigger;
  nodes: FlowNode[];
  edges: FlowEdge[];
  variables: FlowVariable[];
  metadata: FlowMetadata;
  status: 'draft' | 'active' | 'paused' | 'archived';
  version: number;
  created_at: Date;
  updated_at: Date;
}

export interface FlowTrigger {
  type: 'keyword' | 'intent' | 'event' | 'api' | 'schedule';
  conditions: TriggerCondition[];
}

export interface TriggerCondition {
  field: string;
  operator: 'equals' | 'contains' | 'starts_with' | 'matches_regex' | 'greater_than' | 'less_than';
  value: string | number;
}

export type FlowNode = 
  | MessageNode
  | QuestionNode
  | ConditionNode
  | ActionNode
  | ApiNode
  | LLMNode
  | HandoffNode
  | DelayNode;

export interface BaseNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

export interface MessageNode extends BaseNode {
  type: 'message';
  data: {
    content: string;
    attachments?: { type: 'image' | 'video' | 'file'; url: string }[];
    typing_delay?: number;
  };
}

export interface QuestionNode extends BaseNode {
  type: 'question';
  data: {
    prompt: string;
    input_type: 'text' | 'buttons' | 'carousel' | 'dropdown' | 'date' | 'number' | 'email';
    options?: QuestionOption[];
    validation?: {
      required: boolean;
      pattern?: string;
      min?: number;
      max?: number;
      error_message?: string;
    };
    variable_name: string;
  };
}

export interface QuestionOption {
  id: string;
  label: string;
  value: string;
  icon?: string;
  description?: string;
}

export interface ConditionNode extends BaseNode {
  type: 'condition';
  data: {
    conditions: ConditionRule[];
    default_edge_id?: string;
  };
}

export interface ConditionRule {
  id: string;
  expression: string; // e.g., "{{order_value}} > 100"
  edge_id: string;
}

export interface ActionNode extends BaseNode {
  type: 'action';
  data: {
    action_type: 'set_variable' | 'send_email' | 'create_ticket' | 'add_tag' | 'track_event';
    action_config: Record<string, unknown>;
  };
}

export interface ApiNode extends BaseNode {
  type: 'api';
  data: {
    method: 'GET' | 'POST' | 'PUT' | 'DELETE';
    url: string;
    headers?: Record<string, string>;
    body?: string;
    response_variable: string;
    timeout_ms?: number;
    error_edge_id?: string;
  };
}

export interface LLMNode extends BaseNode {
  type: 'llm';
  data: {
    prompt_template: string;
    model?: string;
    temperature?: number;
    max_tokens?: number;
    response_variable: string;
    fallback_edge_id?: string;
  };
}

export interface HandoffNode extends BaseNode {
  type: 'handoff';
  data: {
    handoff_type: 'human_agent' | 'department' | 'external_url';
    target?: string;
    context_variables?: string[];
    message_to_agent?: string;
  };
}

export interface DelayNode extends BaseNode {
  type: 'delay';
  data: {
    delay_ms: number;
    show_typing?: boolean;
  };
}

export interface FlowEdge {
  id: string;
  source_node_id: string;
  target_node_id: string;
  label?: string;
  condition?: string;
}

export interface FlowVariable {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  default_value?: unknown;
  description?: string;
}

export interface FlowMetadata {
  category: 'sales' | 'support' | 'onboarding' | 'feedback' | 'custom';
  tags: string[];
  estimated_duration_seconds: number;
  target_outcome?: string;
  success_metric?: string;
}

export interface FlowExecutionContext {
  flow_id: string;
  session_id: string;
  current_node_id: string;
  variables: Record<string, unknown>;
  history: ExecutionStep[];
  started_at: Date;
  status: 'in_progress' | 'completed' | 'abandoned' | 'error';
}

export interface ExecutionStep {
  node_id: string;
  node_type: string;
  input?: unknown;
  output?: unknown;
  timestamp: Date;
  duration_ms: number;
}

export interface FlowAnalytics {
  flow_id: string;
  period: string;
  total_starts: number;
  total_completions: number;
  completion_rate: number;
  avg_duration_seconds: number;
  drop_off_points: { node_id: string; drop_off_count: number; percentage: number }[];
  conversion_value: number;
  satisfaction_score: number;
  node_performance: NodePerformance[];
}

export interface NodePerformance {
  node_id: string;
  node_type: string;
  visits: number;
  avg_time_spent_ms: number;
  exit_rate: number;
}

interface StoredFlow {
  flow: ConversationFlow;
  analytics: FlowAnalytics;
}

interface ExecutionResult {
  success: boolean;
  response?: {
    type: 'message' | 'question' | 'handoff' | 'complete';
    content?: string;
    options?: QuestionOption[];
    data?: Record<string, unknown>;
  };
  next_node_id?: string;
  error?: string;
}

export class ConversationFlowBuilder {
  private flows: Map<string, StoredFlow> = new Map();
  private executions: Map<string, FlowExecutionContext> = new Map();

  /**
   * Create a new conversation flow
   */
  createFlow(config: {
    name: string;
    description: string;
    category: FlowMetadata['category'];
    trigger: FlowTrigger;
  }): ConversationFlow {
    const flow: ConversationFlow = {
      id: this.generateId(),
      name: config.name,
      description: config.description,
      trigger: config.trigger,
      nodes: [],
      edges: [],
      variables: [],
      metadata: {
        category: config.category,
        tags: [],
        estimated_duration_seconds: 60,
      },
      status: 'draft',
      version: 1,
      created_at: new Date(),
      updated_at: new Date(),
    };

    this.flows.set(flow.id, { 
      flow,
      analytics: this.initAnalytics(flow.id)
    });

    return flow;
  }

  /**
   * Add a node to the flow
   */
  addNode(flow_id: string, node: FlowNode): FlowNode {
    const stored = this.flows.get(flow_id);
    if (!stored) throw new Error(`Flow ${flow_id} not found`);

    node.id = node.id || this.generateId();
    stored.flow.nodes.push(node);
    stored.flow.updated_at = new Date();

    return node;
  }

  /**
   * Connect two nodes with an edge
   */
  addEdge(flow_id: string, source_id: string, target_id: string, options?: {
    label?: string;
    condition?: string;
  }): FlowEdge {
    const stored = this.flows.get(flow_id);
    if (!stored) throw new Error(`Flow ${flow_id} not found`);

    const edge: FlowEdge = {
      id: this.generateId(),
      source_node_id: source_id,
      target_node_id: target_id,
      label: options?.label,
      condition: options?.condition,
    };

    stored.flow.edges.push(edge);
    stored.flow.updated_at = new Date();

    return edge;
  }

  /**
   * Add a variable to the flow
   */
  addVariable(flow_id: string, variable: FlowVariable): void {
    const stored = this.flows.get(flow_id);
    if (!stored) throw new Error(`Flow ${flow_id} not found`);

    stored.flow.variables.push(variable);
    stored.flow.updated_at = new Date();
  }

  /**
   * Validate flow completeness and correctness
   */
  validateFlow(flow_id: string): { 
    valid: boolean; 
    errors: string[]; 
    warnings: string[] 
  } {
    const stored = this.flows.get(flow_id);
    if (!stored) return { valid: false, errors: ['Flow not found'], warnings: [] };

    const { flow } = stored;
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check for start node
    const hasStartNode = flow.nodes.length > 0;
    if (!hasStartNode) {
      errors.push('Flow must have at least one node');
    }

    // Check for orphan nodes (not connected to anything)
    const connectedNodes = new Set<string>();
    for (const edge of flow.edges) {
      connectedNodes.add(edge.source_node_id);
      connectedNodes.add(edge.target_node_id);
    }

    if (flow.nodes.length > 1) {
      for (const node of flow.nodes) {
        if (!connectedNodes.has(node.id)) {
          warnings.push(`Node "${node.id}" is not connected to the flow`);
        }
      }
    }

    // Check for dead ends (nodes with no outgoing edges except terminal nodes)
    const terminalTypes = ['handoff'];
    for (const node of flow.nodes) {
      if (terminalTypes.includes(node.type)) continue;

      const hasOutgoing = flow.edges.some(e => e.source_node_id === node.id);
      if (!hasOutgoing && flow.nodes.length > 1) {
        warnings.push(`Node "${node.id}" has no outgoing connections`);
      }
    }

    // Validate condition nodes have all paths defined
    for (const node of flow.nodes) {
      if (node.type === 'condition') {
        const condNode = node as ConditionNode;
        const rules = condNode.data.conditions;
        
        if (rules.length === 0) {
          errors.push(`Condition node "${node.id}" has no rules defined`);
        }

        if (!condNode.data.default_edge_id) {
          warnings.push(`Condition node "${node.id}" has no default path`);
        }
      }
    }

    // Validate question nodes have variable names
    for (const node of flow.nodes) {
      if (node.type === 'question') {
        const qNode = node as QuestionNode;
        if (!qNode.data.variable_name) {
          errors.push(`Question node "${node.id}" must have a variable name`);
        }
      }
    }

    // Check trigger conditions
    if (flow.trigger.conditions.length === 0) {
      warnings.push('Flow has no trigger conditions - it may never activate');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Activate a flow for production use
   */
  activateFlow(flow_id: string): { success: boolean; message: string } {
    const stored = this.flows.get(flow_id);
    if (!stored) return { success: false, message: 'Flow not found' };

    const validation = this.validateFlow(flow_id);
    if (!validation.valid) {
      return { 
        success: false, 
        message: `Cannot activate: ${validation.errors.join(', ')}` 
      };
    }

    stored.flow.status = 'active';
    stored.flow.updated_at = new Date();

    return { success: true, message: 'Flow activated successfully' };
  }

  /**
   * Start a flow execution for a session
   */
  startExecution(flow_id: string, session_id: string, initial_variables?: Record<string, unknown>): ExecutionResult {
    const stored = this.flows.get(flow_id);
    if (!stored) return { success: false, error: 'Flow not found' };
    if (stored.flow.status !== 'active') {
      return { success: false, error: 'Flow is not active' };
    }

    const { flow } = stored;

    // Find start node (first node without incoming edges)
    const nodesWithIncoming = new Set(flow.edges.map(e => e.target_node_id));
    const startNode = flow.nodes.find(n => !nodesWithIncoming.has(n.id));

    if (!startNode) {
      return { success: false, error: 'No start node found' };
    }

    // Initialize execution context
    const context: FlowExecutionContext = {
      flow_id,
      session_id,
      current_node_id: startNode.id,
      variables: {
        ...this.getDefaultVariables(flow),
        ...initial_variables,
      },
      history: [],
      started_at: new Date(),
      status: 'in_progress',
    };

    this.executions.set(session_id, context);
    stored.analytics.total_starts++;

    // Execute start node
    return this.executeCurrentNode(session_id);
  }

  /**
   * Continue execution with user input
   */
  continueExecution(session_id: string, user_input: unknown): ExecutionResult {
    const context = this.executions.get(session_id);
    if (!context) return { success: false, error: 'Session not found' };

    const stored = this.flows.get(context.flow_id);
    if (!stored) return { success: false, error: 'Flow not found' };

    const currentNode = stored.flow.nodes.find(n => n.id === context.current_node_id);
    if (!currentNode) return { success: false, error: 'Current node not found' };

    // Handle input based on current node type
    if (currentNode.type === 'question') {
      const qNode = currentNode as QuestionNode;
      
      // Validate input
      const validation = this.validateInput(qNode, user_input);
      if (!validation.valid) {
        return {
          success: true,
          response: {
            type: 'message',
            content: validation.error || 'Invalid input',
          },
        };
      }

      // Store variable
      context.variables[qNode.data.variable_name] = user_input;
    }

    // Move to next node
    return this.moveToNextNode(session_id, currentNode, user_input);
  }

  /**
   * Execute current node and return response
   */
  private executeCurrentNode(session_id: string): ExecutionResult {
    const context = this.executions.get(session_id);
    if (!context) return { success: false, error: 'Session not found' };

    const stored = this.flows.get(context.flow_id);
    if (!stored) return { success: false, error: 'Flow not found' };

    const node = stored.flow.nodes.find(n => n.id === context.current_node_id);
    if (!node) return { success: false, error: 'Node not found' };

    const startTime = Date.now();

    // Record step
    const step: ExecutionStep = {
      node_id: node.id,
      node_type: node.type,
      timestamp: new Date(),
      duration_ms: 0,
    };

    switch (node.type) {
      case 'message': {
        const msgNode = node as MessageNode;
        const content = this.interpolateVariables(msgNode.data.content, context.variables);
        step.output = content;
        step.duration_ms = Date.now() - startTime;
        context.history.push(step);
        
        // Auto-advance to next node
        const nextResult = this.moveToNextNode(session_id, node);
        if (!nextResult.success) return nextResult;

        // If next node is also a message, combine them
        return {
          success: true,
          response: {
            type: 'message',
            content,
          },
          next_node_id: context.current_node_id,
        };
      }

      case 'question': {
        const qNode = node as QuestionNode;
        const prompt = this.interpolateVariables(qNode.data.prompt, context.variables);
        step.output = prompt;
        step.duration_ms = Date.now() - startTime;
        context.history.push(step);

        return {
          success: true,
          response: {
            type: 'question',
            content: prompt,
            options: qNode.data.options,
            data: {
              input_type: qNode.data.input_type,
              validation: qNode.data.validation,
            },
          },
        };
      }

      case 'condition': {
        const condNode = node as ConditionNode;
        
        // Evaluate conditions
        let nextEdgeId: string | undefined;
        for (const rule of condNode.data.conditions) {
          if (this.evaluateCondition(rule.expression, context.variables)) {
            nextEdgeId = rule.edge_id;
            break;
          }
        }

        if (!nextEdgeId) {
          nextEdgeId = condNode.data.default_edge_id;
        }

        if (!nextEdgeId) {
          return { success: false, error: 'No matching condition and no default' };
        }

        const edge = stored.flow.edges.find(e => e.id === nextEdgeId);
        if (!edge) return { success: false, error: 'Edge not found' };

        context.current_node_id = edge.target_node_id;
        step.duration_ms = Date.now() - startTime;
        context.history.push(step);

        return this.executeCurrentNode(session_id);
      }

      case 'action': {
        const actNode = node as ActionNode;
        this.executeAction(actNode, context);
        step.duration_ms = Date.now() - startTime;
        context.history.push(step);

        return this.moveToNextNode(session_id, node);
      }

      case 'delay': {
        // In real implementation, would use setTimeout or queue
        step.duration_ms = Date.now() - startTime;
        context.history.push(step);
        return this.moveToNextNode(session_id, node);
      }

      case 'handoff': {
        const handoffNode = node as HandoffNode;
        context.status = 'completed';
        step.duration_ms = Date.now() - startTime;
        context.history.push(step);

        stored.analytics.total_completions++;

        return {
          success: true,
          response: {
            type: 'handoff',
            content: handoffNode.data.message_to_agent,
            data: {
              handoff_type: handoffNode.data.handoff_type,
              target: handoffNode.data.target,
              context: this.extractContextForHandoff(context, handoffNode.data.context_variables),
            },
          },
        };
      }

      case 'llm': {
        // In real implementation, would call LLM
        const llmNode = node as LLMNode;
        const prompt = this.interpolateVariables(llmNode.data.prompt_template, context.variables);
        context.variables[llmNode.data.response_variable] = `[LLM Response for: ${prompt}]`;
        step.duration_ms = Date.now() - startTime;
        context.history.push(step);

        return this.moveToNextNode(session_id, node);
      }

      case 'api': {
        // In real implementation, would make HTTP call
        const apiNode = node as ApiNode;
        context.variables[apiNode.data.response_variable] = { success: true };
        step.duration_ms = Date.now() - startTime;
        context.history.push(step);

        return this.moveToNextNode(session_id, node);
      }

      default: {
        // Exhaustive check - this should never happen
        const _exhaustiveCheck: never = node;
        return { success: false, error: `Unknown node type: ${(_exhaustiveCheck as FlowNode).type}` };
      }
    }
  }

  /**
   * Move to next node based on edges
   */
  private moveToNextNode(session_id: string, currentNode: FlowNode, _input?: unknown): ExecutionResult {
    const context = this.executions.get(session_id);
    if (!context) return { success: false, error: 'Session not found' };

    const stored = this.flows.get(context.flow_id);
    if (!stored) return { success: false, error: 'Flow not found' };

    // Find outgoing edge
    const outgoingEdges = stored.flow.edges.filter(e => e.source_node_id === currentNode.id);

    if (outgoingEdges.length === 0) {
      // End of flow
      context.status = 'completed';
      stored.analytics.total_completions++;
      return {
        success: true,
        response: { type: 'complete' },
      };
    }

    // For single edge, just follow it
    // For multiple edges (from question), evaluate conditions
    let nextEdge = outgoingEdges[0];
    if (outgoingEdges.length > 1) {
      for (const edge of outgoingEdges) {
        if (edge.condition && this.evaluateCondition(edge.condition, context.variables)) {
          nextEdge = edge;
          break;
        }
      }
    }

    context.current_node_id = nextEdge.target_node_id;
    return this.executeCurrentNode(session_id);
  }

  /**
   * Interpolate variables in template string
   */
  private interpolateVariables(template: string, variables: Record<string, unknown>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      return String(variables[key] ?? '');
    });
  }

  /**
   * Evaluate a condition expression
   */
  private evaluateCondition(expression: string, variables: Record<string, unknown>): boolean {
    // Simple expression evaluator
    // In production, use a proper expression parser
    const interpolated = this.interpolateVariables(expression, variables);
    
    try {
      // Basic comparisons
      if (interpolated.includes('===')) {
        const [left, right] = interpolated.split('===').map(s => s.trim());
        return left === right;
      }
      if (interpolated.includes('==')) {
        const [left, right] = interpolated.split('==').map(s => s.trim());
        return left == right;  // eslint-disable-line eqeqeq
      }
      if (interpolated.includes('>')) {
        const [left, right] = interpolated.split('>').map(s => parseFloat(s.trim()));
        return left > right;
      }
      if (interpolated.includes('<')) {
        const [left, right] = interpolated.split('<').map(s => parseFloat(s.trim()));
        return left < right;
      }
      
      // Boolean
      return interpolated.toLowerCase() === 'true';
    } catch {
      return false;
    }
  }

  /**
   * Validate user input against question node rules
   */
  private validateInput(node: QuestionNode, input: unknown): { valid: boolean; error?: string } {
    const { validation, input_type } = node.data;

    if (validation?.required && (input === null || input === undefined || input === '')) {
      return { valid: false, error: validation.error_message || 'This field is required' };
    }

    if (input_type === 'email' && typeof input === 'string') {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(input)) {
        return { valid: false, error: 'Please enter a valid email address' };
      }
    }

    if (input_type === 'number' && typeof input === 'number') {
      if (validation?.min !== undefined && input < validation.min) {
        return { valid: false, error: `Value must be at least ${validation.min}` };
      }
      if (validation?.max !== undefined && input > validation.max) {
        return { valid: false, error: `Value must be at most ${validation.max}` };
      }
    }

    if (validation?.pattern && typeof input === 'string') {
      const regex = new RegExp(validation.pattern);
      if (!regex.test(input)) {
        return { valid: false, error: validation.error_message || 'Invalid format' };
      }
    }

    return { valid: true };
  }

  /**
   * Execute an action node
   */
  private executeAction(node: ActionNode, context: FlowExecutionContext): void {
    const { action_type, action_config } = node.data;

    switch (action_type) {
      case 'set_variable':
        if (action_config.name && action_config.value !== undefined) {
          context.variables[action_config.name as string] = action_config.value;
        }
        break;

      case 'track_event':
        // In production, would send to analytics
        console.log('Track event:', action_config);
        break;

      // Other actions would be implemented here
    }
  }

  /**
   * Extract context variables for handoff
   */
  private extractContextForHandoff(
    context: FlowExecutionContext, 
    variableNames?: string[]
  ): Record<string, unknown> {
    if (!variableNames) return context.variables;

    const extracted: Record<string, unknown> = {};
    for (const name of variableNames) {
      if (name in context.variables) {
        extracted[name] = context.variables[name];
      }
    }
    return extracted;
  }

  /**
   * Get default variable values for a flow
   */
  private getDefaultVariables(flow: ConversationFlow): Record<string, unknown> {
    const defaults: Record<string, unknown> = {};
    for (const variable of flow.variables) {
      if (variable.default_value !== undefined) {
        defaults[variable.name] = variable.default_value;
      }
    }
    return defaults;
  }

  /**
   * Get analytics for a flow
   */
  getFlowAnalytics(flow_id: string): FlowAnalytics | null {
    const stored = this.flows.get(flow_id);
    if (!stored) return null;

    // Update calculated fields
    const analytics = stored.analytics;
    analytics.completion_rate = analytics.total_starts > 0
      ? analytics.total_completions / analytics.total_starts
      : 0;

    return analytics;
  }

  /**
   * Get flow for editing
   */
  getFlow(flow_id: string): ConversationFlow | null {
    const stored = this.flows.get(flow_id);
    return stored?.flow || null;
  }

  /**
   * List all flows
   */
  listFlows(filter?: { status?: ConversationFlow['status']; category?: FlowMetadata['category'] }): ConversationFlow[] {
    const flows: ConversationFlow[] = [];
    
    for (const stored of this.flows.values()) {
      if (filter?.status && stored.flow.status !== filter.status) continue;
      if (filter?.category && stored.flow.metadata.category !== filter.category) continue;
      flows.push(stored.flow);
    }

    return flows;
  }

  /**
   * Export flow as JSON for backup/sharing
   */
  exportFlow(flow_id: string): string | null {
    const flow = this.getFlow(flow_id);
    if (!flow) return null;
    return JSON.stringify(flow, null, 2);
  }

  /**
   * Import flow from JSON
   */
  importFlow(json: string): ConversationFlow | null {
    try {
      const imported = JSON.parse(json) as ConversationFlow;
      imported.id = this.generateId();
      imported.status = 'draft';
      imported.created_at = new Date();
      imported.updated_at = new Date();
      imported.version = 1;

      this.flows.set(imported.id, {
        flow: imported,
        analytics: this.initAnalytics(imported.id),
      });

      return imported;
    } catch {
      return null;
    }
  }

  /**
   * Create common flow templates
   */
  createFromTemplate(template: 'product_recommendation' | 'support_triage' | 'lead_qualification' | 'feedback_collection'): ConversationFlow {
    switch (template) {
      case 'product_recommendation':
        return this.createProductRecommendationFlow();
      case 'support_triage':
        return this.createSupportTriageFlow();
      case 'lead_qualification':
        return this.createLeadQualificationFlow();
      case 'feedback_collection':
        return this.createFeedbackFlow();
      default:
        throw new Error(`Unknown template: ${template}`);
    }
  }

  private createProductRecommendationFlow(): ConversationFlow {
    const flow = this.createFlow({
      name: 'Product Recommendation',
      description: 'Guide customers to find the right product',
      category: 'sales',
      trigger: {
        type: 'intent',
        conditions: [{ field: 'intent', operator: 'equals', value: 'product_search' }],
      },
    });

    const welcomeNode = this.addNode(flow.id, {
      id: 'welcome',
      type: 'message',
      position: { x: 100, y: 100 },
      data: { content: "Hi! I'd love to help you find the perfect product. Let me ask a few questions." },
    } as MessageNode);

    const categoryQuestion = this.addNode(flow.id, {
      id: 'category',
      type: 'question',
      position: { x: 100, y: 200 },
      data: {
        prompt: 'What category are you interested in?',
        input_type: 'buttons',
        options: [
          { id: '1', label: 'Electronics', value: 'electronics' },
          { id: '2', label: 'Clothing', value: 'clothing' },
          { id: '3', label: 'Home & Garden', value: 'home' },
        ],
        variable_name: 'selected_category',
      },
    } as QuestionNode);

    const budgetQuestion = this.addNode(flow.id, {
      id: 'budget',
      type: 'question',
      position: { x: 100, y: 300 },
      data: {
        prompt: 'What\'s your budget range?',
        input_type: 'buttons',
        options: [
          { id: '1', label: 'Under $50', value: 'low' },
          { id: '2', label: '$50-$200', value: 'medium' },
          { id: '3', label: 'Over $200', value: 'high' },
        ],
        variable_name: 'budget',
      },
    } as QuestionNode);

    const recommendNode = this.addNode(flow.id, {
      id: 'recommend',
      type: 'llm',
      position: { x: 100, y: 400 },
      data: {
        prompt_template: 'Recommend products in {{selected_category}} for budget {{budget}}',
        response_variable: 'recommendations',
      },
    } as LLMNode);

    const resultNode = this.addNode(flow.id, {
      id: 'result',
      type: 'message',
      position: { x: 100, y: 500 },
      data: { content: 'Based on your preferences, here are my top recommendations:\n\n{{recommendations}}' },
    } as MessageNode);

    this.addEdge(flow.id, welcomeNode.id, categoryQuestion.id);
    this.addEdge(flow.id, categoryQuestion.id, budgetQuestion.id);
    this.addEdge(flow.id, budgetQuestion.id, recommendNode.id);
    this.addEdge(flow.id, recommendNode.id, resultNode.id);

    return this.getFlow(flow.id)!;
  }

  private createSupportTriageFlow(): ConversationFlow {
    const flow = this.createFlow({
      name: 'Support Triage',
      description: 'Route support requests to the right team',
      category: 'support',
      trigger: {
        type: 'intent',
        conditions: [{ field: 'intent', operator: 'equals', value: 'support' }],
      },
    });

    const issueTypeNode = this.addNode(flow.id, {
      id: 'issue_type',
      type: 'question',
      position: { x: 100, y: 100 },
      data: {
        prompt: 'What type of issue are you experiencing?',
        input_type: 'buttons',
        options: [
          { id: '1', label: 'Order Issue', value: 'order' },
          { id: '2', label: 'Technical Problem', value: 'technical' },
          { id: '3', label: 'Billing Question', value: 'billing' },
          { id: '4', label: 'Other', value: 'other' },
        ],
        variable_name: 'issue_type',
      },
    } as QuestionNode);

    const urgencyNode = this.addNode(flow.id, {
      id: 'urgency',
      type: 'question',
      position: { x: 100, y: 200 },
      data: {
        prompt: 'How urgent is this issue?',
        input_type: 'buttons',
        options: [
          { id: '1', label: 'Urgent - Need help now', value: 'urgent' },
          { id: '2', label: 'Normal - Can wait a bit', value: 'normal' },
        ],
        variable_name: 'urgency',
      },
    } as QuestionNode);

    const handoffNode = this.addNode(flow.id, {
      id: 'handoff',
      type: 'handoff',
      position: { x: 100, y: 300 },
      data: {
        handoff_type: 'department',
        target: '{{issue_type}}_team',
        context_variables: ['issue_type', 'urgency'],
        message_to_agent: 'Customer needs help with {{issue_type}} issue ({{urgency}} priority)',
      },
    } as HandoffNode);

    this.addEdge(flow.id, issueTypeNode.id, urgencyNode.id);
    this.addEdge(flow.id, urgencyNode.id, handoffNode.id);

    return this.getFlow(flow.id)!;
  }

  private createLeadQualificationFlow(): ConversationFlow {
    const flow = this.createFlow({
      name: 'Lead Qualification',
      description: 'Qualify sales leads with key questions',
      category: 'sales',
      trigger: {
        type: 'keyword',
        conditions: [{ field: 'message', operator: 'contains', value: 'pricing' }],
      },
    });

    // Add nodes for lead qualification
    this.addNode(flow.id, {
      id: 'greeting',
      type: 'message',
      position: { x: 100, y: 100 },
      data: { content: "Thanks for your interest! I'd love to help you find the right plan." },
    } as MessageNode);

    return this.getFlow(flow.id)!;
  }

  private createFeedbackFlow(): ConversationFlow {
    const flow = this.createFlow({
      name: 'Feedback Collection',
      description: 'Collect customer feedback after interaction',
      category: 'feedback',
      trigger: {
        type: 'event',
        conditions: [{ field: 'event', operator: 'equals', value: 'conversation_end' }],
      },
    });

    this.addNode(flow.id, {
      id: 'rating',
      type: 'question',
      position: { x: 100, y: 100 },
      data: {
        prompt: 'How would you rate your experience today?',
        input_type: 'buttons',
        options: [
          { id: '1', label: '⭐', value: '1' },
          { id: '2', label: '⭐⭐', value: '2' },
          { id: '3', label: '⭐⭐⭐', value: '3' },
          { id: '4', label: '⭐⭐⭐⭐', value: '4' },
          { id: '5', label: '⭐⭐⭐⭐⭐', value: '5' },
        ],
        variable_name: 'rating',
      },
    } as QuestionNode);

    return this.getFlow(flow.id)!;
  }

  private initAnalytics(flow_id: string): FlowAnalytics {
    return {
      flow_id,
      period: 'all_time',
      total_starts: 0,
      total_completions: 0,
      completion_rate: 0,
      avg_duration_seconds: 0,
      drop_off_points: [],
      conversion_value: 0,
      satisfaction_score: 0,
      node_performance: [],
    };
  }

  private generateId(): string {
    return `flow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Singleton export
export const conversationFlowBuilder = new ConversationFlowBuilder();
