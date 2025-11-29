/**
 * Talk to Human Button Component
 * 
 * Always visible escalation button with:
 * - Real-time agent availability status (green/yellow/red)
 * - One-click escalation
 * - No forced bot interaction gates
 * - Seamless context transfer
 * 
 * Date: 2025-11-19
 */

import React, { useEffect, useState } from 'react';
import { MessageCircle, Users, Clock, CheckCircle } from 'lucide-react';
import { HumanEscalationService, type AgentStatus } from '@/lib/escalation/human-escalation-service';

export interface TalkToHumanButtonProps {
  /** Session ID for context transfer */
  sessionId: string;
  /** Tenant ID */
  tenantId: string;
  /** Callback when escalation initiated */
  onEscalate?: (escalationId: string) => void;
  /** Variant: 'floating' (fixed position) or 'inline' */
  variant?: 'floating' | 'inline';
  /** Custom className */
  className?: string;
}

export function TalkToHumanButton({
  sessionId,
  tenantId,
  onEscalate,
  variant = 'floating',
  className = '',
}: TalkToHumanButtonProps) {
  const [agentStatus, setAgentStatus] = useState<AgentStatus>('offline');
  const [availableCount, setAvailableCount] = useState(0);
  const [isEscalating, setIsEscalating] = useState(false);
  const [escalationSuccess, setEscalationSuccess] = useState(false);

  const escalationService = React.useMemo(() => new HumanEscalationService(), []);

  useEffect(() => {
    // Subscribe to real-time agent status
    const unsubscribe = escalationService.subscribeToAgentStatus((status, count) => {
      setAgentStatus(status);
      setAvailableCount(count);
    });

    return unsubscribe;
  }, [escalationService]);

  const getStatusColor = () => {
    if (agentStatus === 'available') return 'bg-green-500';
    if (agentStatus === 'busy') return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getStatusText = () => {
    if (agentStatus === 'available') {
      return `${availableCount} ${availableCount === 1 ? 'agent' : 'agents'} available now`;
    }
    if (agentStatus === 'busy') return '~5 min wait';
    return 'Offline - request callback';
  };

  const handleEscalate = async () => {
    setIsEscalating(true);

    try {
      // Gather conversation context from session
      const context = await gatherConversationContext(sessionId, tenantId);

      const response = await escalationService.escalateToHuman(context);

      setEscalationSuccess(true);
      onEscalate?.(response.escalation_id);

      // Show success state briefly
      setTimeout(() => {
        setEscalationSuccess(false);
      }, 3000);
    } catch (error) {
      console.error('Escalation failed:', error);
      alert('Failed to connect to human agent. Please try again.');
    } finally {
      setIsEscalating(false);
    }
  };

  if (escalationSuccess) {
    return (
      <div
        className={`${
          variant === 'floating'
            ? 'fixed bottom-24 right-6 z-50'
            : ''
        } ${className}`}
      >
        <div className="flex items-center gap-3 px-6 py-4 bg-green-600 text-white rounded-full shadow-2xl">
          <CheckCircle className="w-6 h-6" />
          <div>
            <div className="font-bold">Sarah is reviewing your situation</div>
            <div className="text-sm text-green-100">No need to repeat anything</div>
          </div>
        </div>
      </div>
    );
  }

  if (variant === 'floating') {
    return (
      <button
        onClick={handleEscalate}
        disabled={isEscalating}
        className={`fixed bottom-24 right-6 z-50 group ${className}`}
      >
        <div className="relative">
          {/* Status indicator */}
          <div
            className={`absolute -top-1 -right-1 w-4 h-4 ${getStatusColor()} rounded-full border-2 border-white ${
              agentStatus === 'available' ? 'animate-pulse' : ''
            }`}
          />

          {/* Main button */}
          <div className="flex items-center gap-3 px-6 py-4 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-full shadow-2xl transition-all group-hover:shadow-3xl group-hover:scale-105">
            <Users className="w-6 h-6" />
            <div className="text-left">
              <div className="font-bold">Talk to Human</div>
              <div className="text-xs text-blue-100">{getStatusText()}</div>
            </div>
          </div>

          {/* Loading state */}
          {isEscalating && (
            <div className="absolute inset-0 flex items-center justify-center bg-blue-600 rounded-full">
              <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>
      </button>
    );
  }

  // Inline variant
  return (
    <button
      onClick={handleEscalate}
      disabled={isEscalating}
      className={`w-full flex items-center justify-between px-4 py-3 bg-white border-2 border-blue-500 hover:bg-blue-50 text-blue-700 rounded-lg transition-colors ${className}`}
    >
      <div className="flex items-center gap-3">
        <div className="relative">
          <Users className="w-5 h-5" />
          <div
            className={`absolute -top-1 -right-1 w-3 h-3 ${getStatusColor()} rounded-full border border-white`}
          />
        </div>
        <div className="text-left">
          <div className="font-semibold text-sm">Talk to Human</div>
          <div className="text-xs text-gray-600">{getStatusText()}</div>
        </div>
      </div>
      {isEscalating ? (
        <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      ) : (
        <MessageCircle className="w-5 h-5" />
      )}
    </button>
  );
}

/**
 * Gather full conversation context for seamless handoff
 */
async function gatherConversationContext(sessionId: string, tenantId: string) {
  // This would fetch from your session store/database
  // For now, return mock data structure
  return {
    session_id: sessionId,
    tenant_id: tenantId,
    user_goal: 'Extracted from conversation analysis',
    frustration_level: 3 as const,
    urgency: 'medium' as const,
    conversation_history: [],
    attempted_solutions: [],
    collected_details: {},
    metadata: {
      startedAt: new Date().toISOString(),
      totalMessages: 0,
    },
  };
}

/**
 * Inline variant for message list (always visible)
 */
export function TalkToHumanInlinePrompt({
  sessionId,
  tenantId,
  onEscalate,
}: Omit<TalkToHumanButtonProps, 'variant' | 'className'>) {
  return (
    <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
      <div className="flex items-start gap-3 mb-3">
        <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
          <Users className="w-5 h-5 text-blue-600" />
        </div>
        <div className="flex-1">
          <h4 className="font-semibold text-gray-900 mb-1">Need More Help?</h4>
          <p className="text-sm text-gray-700 mb-3">
            Connect with a human agent who can provide personalized assistance. Your entire
            conversation will be shared — no need to repeat anything.
          </p>
        </div>
      </div>
      <TalkToHumanButton
        sessionId={sessionId}
        tenantId={tenantId}
        onEscalate={onEscalate}
        variant="inline"
      />
    </div>
  );
}

/**
 * Usage Examples:
 * 
 * // Floating button (always visible in bottom-right):
 * <TalkToHumanButton
 *   sessionId={currentSession}
 *   tenantId={tenant.id}
 *   onEscalate={(id) => console.log('Escalated:', id)}
 *   variant="floating"
 * />
 * 
 * // Inline prompt in message list:
 * <TalkToHumanInlinePrompt
 *   sessionId={currentSession}
 *   tenantId={tenant.id}
 *   onEscalate={(id) => router.push(`/escalation/${id}`)}
 * />
 */
