/**
 * Human Escalation Service
 * 
 * Manages escalation flow:
 * - Real-time agent availability status
 * - Context transfer to human agent
 * - Seamless handoff without re-interrogation
 * 
 * Date: 2025-11-19
 */

import { createClient, RealtimeChannel } from '@supabase/supabase-js';
import { logger } from '../observability/logger';
import { logAuditEvent } from '../security/audit-logging.js';

export type AgentStatus = 'available' | 'busy' | 'offline';
export type EscalationPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface Agent {
  agent_id: string;
  name: string;
  email: string;
  status: AgentStatus;
  current_chats: number;
  max_concurrent_chats: number;
  specialties: string[];
  last_active: string;
}

export interface EscalationRequest {
  session_id: string;
  tenant_id: string;
  user_goal: string;
  frustration_level: 1 | 2 | 3 | 4 | 5;
  urgency: EscalationPriority;
  conversation_history: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
  }>;
  attempted_solutions: Array<{
    action: string;
    outcome: 'success' | 'partial' | 'failed';
    timestamp: string;
  }>;
  collected_details: Record<string, string>;
  metadata: {
    startedAt: string;
    totalMessages: number;
    averageResponseTime?: number;
  };
}

export interface EscalationResponse {
  escalation_id: string;
  assigned_agent: Agent;
  estimated_wait_time_seconds: number;
  status: 'pending' | 'assigned' | 'active' | 'resolved';
}

export class HumanEscalationService {
  private supabase: ReturnType<typeof createClient>;
  private agentStatusChannel?: RealtimeChannel;

  constructor() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey =
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase credentials not configured for escalation service');
    }

    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  /**
   * Get real-time agent availability status
   * Returns: 'available' (green), 'busy' (yellow), 'offline' (red)
   */
  async getAgentAvailability(): Promise<{
    status: AgentStatus;
    available_agents: number;
    estimated_wait_time_seconds: number;
  }> {
    try {
      const { data, error } = await this.supabase
        .from('agents')
        .select('*')
        .eq('status', 'available')
        .lt('current_chats', this.supabase.rpc('max_concurrent_chats'));

      if (error) throw error;

      const availableAgents = data?.length || 0;

      if (availableAgents > 0) {
        return {
          status: 'available',
          available_agents: availableAgents,
          estimated_wait_time_seconds: 0,
        };
      }

      // Check if any agents are online but busy
      const { data: busyAgents } = await this.supabase
        .from('agents')
        .select('*')
        .eq('status', 'available')
        .gte('current_chats', 1);

      if (busyAgents && busyAgents.length > 0) {
        return {
          status: 'busy',
          available_agents: 0,
          estimated_wait_time_seconds: 300, // 5 min estimate
        };
      }

      return {
        status: 'offline',
        available_agents: 0,
        estimated_wait_time_seconds: -1, // Callback required
      };
    } catch (error) {
      logger.error('Failed to get agent availability', { error });
      return {
        status: 'offline',
        available_agents: 0,
        estimated_wait_time_seconds: -1,
      };
    }
  }

  /**
   * Escalate conversation to human agent
   * Transfers full context without requiring user to repeat information
   */
  async escalateToHuman(request: EscalationRequest): Promise<EscalationResponse> {
    const startTime = Date.now();

    try {
      const conversationHistory = request.conversation_history ?? [];
      const attemptedSolutions = request.attempted_solutions ?? [];
      const collectedDetails = request.collected_details ?? {};
      const metadata = request.metadata ?? {};
      const frustrationLevel = request.frustration_level ?? 0;

      if (
        !request.session_id ||
        !request.tenant_id ||
        !request.user_goal ||
        !request.urgency ||
        frustrationLevel < 1
      ) {
        throw new Error('Invalid escalation request data');
      }

      // Audit log escalation request
      await logAuditEvent({
        tenant_id: request.tenant_id,
        event_type: 'escalation_requested' as any,
        event_data: {
          session_id: request.session_id,
          frustration_level: frustrationLevel,
          urgency: request.urgency,
          message_count: conversationHistory.length,
        },
        metadata: {
          execution_time_ms: 0,
        },
      } as any);

      // Find best available agent
      const agent = await this.findBestAgent(request);

      if (!agent) {
      // Create pending escalation
        const { data: pendingEscalation, error } = await this.supabase
          .from('escalations')
          .insert([{
            session_id: request.session_id,
            tenant_id: request.tenant_id,
            status: 'pending',
            priority: request.urgency,
            user_goal: request.user_goal,
            frustration_level: frustrationLevel,
            conversation_history: conversationHistory,
            attempted_solutions: attemptedSolutions,
            collected_details: collectedDetails,
            metadata,
            created_at: new Date().toISOString(),
          }] as any)
          .select()
          .single() as any;

        if (error) throw error;

        return {
          escalation_id: pendingEscalation.id,
          assigned_agent: {
            agent_id: 'pending',
            name: 'Next Available Agent',
            email: '',
            status: 'offline',
            current_chats: 0,
            max_concurrent_chats: 0,
            specialties: [],
            last_active: new Date().toISOString(),
          },
          estimated_wait_time_seconds: 300,
          status: 'pending',
        };
      }

      // Assign to agent
      const { data: escalation, error } = await this.supabase
        .from('escalations')
        .insert([{
          session_id: request.session_id,
          tenant_id: request.tenant_id,
          assigned_agent_id: agent.agent_id,
          status: 'assigned',
          priority: request.urgency,
          user_goal: request.user_goal,
          frustration_level: frustrationLevel,
          conversation_history: conversationHistory,
          attempted_solutions: attemptedSolutions,
          collected_details: collectedDetails,
          metadata,
          created_at: new Date().toISOString(),
          assigned_at: new Date().toISOString(),
        }] as any)
        .select()
        .single() as any;

      if (error) throw error;

      // Update agent's current chat count
      await (this.supabase.rpc as any)('increment_agent_chats', { agent_id: agent.agent_id });

      // Notify agent via realtime channel
      await this.notifyAgent(agent.agent_id, escalation.id);

      const latency = Date.now() - startTime;

      logger.info('Escalation successful', {
        escalation_id: escalation.id,
        agent_id: agent.agent_id,
        latency_ms: latency,
      });

      await logAuditEvent({
        tenant_id: request.tenant_id,
        event_type: 'escalation_assigned' as any,
        event_data: {
          escalation_id: (escalation.id as any),
          agent_id: agent.agent_id,
          agent_name: agent.name,
        },
        metadata: {
          execution_time_ms: latency,
        },
      } as any);

      return {
        escalation_id: escalation.id,
        assigned_agent: agent,
        estimated_wait_time_seconds: 0,
        status: 'assigned',
      };
    } catch (error) {
      logger.error('Escalation failed', { error, request });

      await logAuditEvent({
        tenant_id: request.tenant_id,
        event_type: 'escalation_failed' as any,
        event_data: {
          session_id: request.session_id,
          error: error instanceof Error ? error.message : String(error),
        },
      } as any);

      throw new Error('Failed to escalate to human agent');
    }
  }

  /**
   * Subscribe to agent status updates (for real-time UI)
   */
  subscribeToAgentStatus(
    callback: (status: AgentStatus, availableCount: number) => void
  ): () => void {
    this.agentStatusChannel = this.supabase
      .channel('agent-status')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agents' }, () => {
        this.getAgentAvailability().then((result) => {
          callback(result.status, result.available_agents);
        });
      })
      .subscribe();

    // Initial fetch
    this.getAgentAvailability().then((result) => {
      callback(result.status, result.available_agents);
    });

    // Return cleanup function
    return () => {
      this.agentStatusChannel?.unsubscribe();
    };
  }

  /**
   * Get escalation status
   */
  async getEscalationStatus(escalation_id: string): Promise<{
    status: 'pending' | 'assigned' | 'active' | 'resolved';
    agent_name?: string;
    message_from_agent?: string;
  }> {
    const { data, error } = await this.supabase
      .from('escalations')
      .select('*, agents(*)')
      .eq('id', escalation_id)
      .single() as any;

    if (error || !data) {
      throw new Error('Escalation not found');
    }

    return {
      status: (data.status as 'pending' | 'assigned' | 'active' | 'resolved'),
      agent_name: (data.agents as any)?.name,
      message_from_agent: (data.agent_message as any),
    };
  }

  /**
   * Find best available agent based on workload and specialties
   */
  private async findBestAgent(request: EscalationRequest): Promise<Agent | null> {
    try {
      const { data, error } = await this.supabase
        .from('agents')
        .select('*')
        .eq('status', 'available')
        .lt('current_chats', this.supabase.rpc('max_concurrent_chats'))
        .order('current_chats', { ascending: true })
        .limit(1)
        .single();

      if (error || !data) return null;

      return data as Agent;
    } catch {
      return null;
    }
  }

  /**
   * Notify agent of new escalation via realtime
   */
  private async notifyAgent(agent_id: string, escalation_id: string): Promise<void> {
    try {
      const channel = this.supabase.channel(`agent-${agent_id}`);
      await channel.send({
        type: 'broadcast',
        event: 'new-escalation',
        payload: { escalation_id },
      });
    } catch (error) {
      logger.warn('Failed to notify agent', { agent_id, error });
    }
  }
}
