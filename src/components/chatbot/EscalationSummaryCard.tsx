/**
 * Escalation Summary Card Component
 * 
 * Visual card for human agents showing:
 * - User's goal
 * - Attempted solutions
 * - Frustration level
 * - Urgency indicators
 * - Key details already collected
 * 
 * Eliminates re-interrogation, improves handoff quality.
 * 
 * Date: 2025-11-19
 */

import React from 'react';
import {
  User,
  Target,
  MessageSquare,
  AlertTriangle,
  Clock,
  CheckCircle2,
  XCircle,
  TrendingUp,
  Info,
} from 'lucide-react';

export interface EscalationContext {
  /** User's primary goal/objective */
  userGoal: string;
  /** Solutions bot attempted (with outcomes) */
  attemptedSolutions: Array<{
    action: string;
    outcome: 'success' | 'partial' | 'failed';
    timestamp: string;
  }>;
  /** Frustration level (1-5, 5 = very frustrated) */
  frustrationLevel: 1 | 2 | 3 | 4 | 5;
  /** Urgency (low | medium | high | critical) */
  urgency: 'low' | 'medium' | 'high' | 'critical';
  /** Key details collected from conversation */
  collectedDetails: Record<string, string>;
  /** Full conversation history */
  conversationHistory: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
  }>;
  /** Session metadata */
  metadata: {
    sessionId: string;
    tenantId: string;
    startedAt: string;
    escalatedAt: string;
    totalMessages: number;
    averageResponseTime?: number;
  };
}

export interface EscalationSummaryCardProps {
  context: EscalationContext;
  /** Agent name handling the escalation */
  agentName?: string;
  /** Callback when agent acknowledges */
  onAcknowledge?: () => void;
  /** Show full conversation history */
  showFullHistory?: boolean;
}

export function EscalationSummaryCard({
  context,
  agentName = 'Agent',
  onAcknowledge,
  showFullHistory = false,
}: EscalationSummaryCardProps) {
  const [historyExpanded, setHistoryExpanded] = React.useState(false);

  const getFrustrationColor = (level: number) => {
    if (level >= 4) return 'bg-red-100 text-red-800 border-red-300';
    if (level >= 3) return 'bg-orange-100 text-orange-800 border-orange-300';
    return 'bg-yellow-100 text-yellow-800 border-yellow-300';
  };

  const getUrgencyColor = (urgency: string) => {
    if (urgency === 'critical') return 'bg-red-100 text-red-800 border-red-300';
    if (urgency === 'high') return 'bg-orange-100 text-orange-800 border-orange-300';
    if (urgency === 'medium') return 'bg-yellow-100 text-yellow-800 border-yellow-300';
    return 'bg-blue-100 text-blue-800 border-blue-300';
  };

  const formatTimestamp = (ts: string) => {
    const date = new Date(ts);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="w-full max-w-4xl bg-white border-2 border-blue-500 rounded-xl shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
              <User className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Escalation Summary</h2>
              <p className="text-blue-100 text-sm">
                {agentName} is reviewing — no need to repeat anything
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div
              className={`px-3 py-1 rounded-full border text-sm font-medium ${getUrgencyColor(
                context.urgency
              )}`}
            >
              {context.urgency.toUpperCase()}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-6 space-y-6">
        {/* User Goal */}
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
            <Target className="w-5 h-5 text-blue-600" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-gray-900 mb-1">User's Goal</h3>
            <p className="text-gray-700 text-sm leading-relaxed">{context.userGoal}</p>
          </div>
        </div>

        {/* Frustration Level */}
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-orange-50 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-5 h-5 text-orange-600" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-gray-900 mb-2">Frustration Level</h3>
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5].map((level) => (
                <div
                  key={level}
                  className={`w-8 h-8 rounded ${
                    level <= context.frustrationLevel
                      ? 'bg-orange-500'
                      : 'bg-gray-200'
                  }`}
                />
              ))}
              <span
                className={`ml-2 px-3 py-1 rounded-full border text-sm font-medium ${getFrustrationColor(
                  context.frustrationLevel
                )}`}
              >
                {context.frustrationLevel >= 4
                  ? 'High'
                  : context.frustrationLevel >= 3
                  ? 'Moderate'
                  : 'Low'}
              </span>
            </div>
          </div>
        </div>

        {/* Attempted Solutions */}
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center flex-shrink-0">
            <MessageSquare className="w-5 h-5 text-purple-600" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-gray-900 mb-2">Attempted Solutions</h3>
            <div className="space-y-2">
              {context.attemptedSolutions.map((solution, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-2 p-3 bg-gray-50 rounded-lg border border-gray-200"
                >
                  {solution.outcome === 'success' && (
                    <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  )}
                  {solution.outcome === 'partial' && (
                    <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                  )}
                  {solution.outcome === 'failed' && (
                    <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <p className="text-sm text-gray-800">{solution.action}</p>
                    <p className="text-xs text-gray-500">
                      {formatTimestamp(solution.timestamp)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Collected Details */}
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center flex-shrink-0">
            <Info className="w-5 h-5 text-green-600" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-gray-900 mb-2">Key Details Collected</h3>
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(context.collectedDetails).map(([key, value]) => (
                <div key={key} className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="text-xs font-medium text-gray-600 uppercase mb-1">
                    {key.replace(/_/g, ' ')}
                  </div>
                  <div className="text-sm text-gray-900 font-medium">{value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Session Metadata */}
        <div className="grid grid-cols-3 gap-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <div>
            <div className="text-xs text-blue-700 font-medium mb-1">Session Duration</div>
            <div className="text-sm text-blue-900 font-bold">
              {Math.round(
                (new Date(context.metadata.escalatedAt).getTime() -
                  new Date(context.metadata.startedAt).getTime()) /
                  60000
              )}{' '}
              min
            </div>
          </div>
          <div>
            <div className="text-xs text-blue-700 font-medium mb-1">Total Messages</div>
            <div className="text-sm text-blue-900 font-bold">
              {context.metadata.totalMessages}
            </div>
          </div>
          <div>
            <div className="text-xs text-blue-700 font-medium mb-1">Avg Response Time</div>
            <div className="text-sm text-blue-900 font-bold">
              {context.metadata.averageResponseTime
                ? `${context.metadata.averageResponseTime}s`
                : 'N/A'}
            </div>
          </div>
        </div>

        {/* Conversation History (Collapsible) */}
        {showFullHistory && (
          <div className="border-t pt-4">
            <button
              onClick={() => setHistoryExpanded(!historyExpanded)}
              className="flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              <MessageSquare className="w-4 h-4" />
              {historyExpanded ? 'Hide' : 'Show'} Full Conversation History (
              {context.conversationHistory.length} messages)
            </button>
            {historyExpanded && (
              <div className="mt-3 space-y-2 max-h-96 overflow-y-auto">
                {context.conversationHistory.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded-lg ${
                      msg.role === 'user'
                        ? 'bg-blue-50 border border-blue-200'
                        : 'bg-gray-50 border border-gray-200'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-gray-600">
                        {msg.role === 'user' ? 'User' : 'Assistant'}
                      </span>
                      <span className="text-xs text-gray-500">
                        {formatTimestamp(msg.timestamp)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-800">{msg.content}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer Actions */}
      {onAcknowledge && (
        <div className="border-t bg-gray-50 px-6 py-4">
          <button
            onClick={onAcknowledge}
            className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
          >
            Acknowledge & Start Conversation
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Usage Example:
 * 
 * const escalationContext: EscalationContext = {
 *   userGoal: 'Need help integrating the chatbot widget into my React app',
 *   attemptedSolutions: [
 *     { action: 'Provided embed code snippet', outcome: 'partial', timestamp: '2025-11-19T10:15:00Z' },
 *     { action: 'Troubleshot CORS errors', outcome: 'failed', timestamp: '2025-11-19T10:18:00Z' },
 *   ],
 *   frustrationLevel: 4,
 *   urgency: 'high',
 *   collectedDetails: {
 *     framework: 'React 18',
 *     error_message: 'CORS policy blocked',
 *     tried_solutions: 'Added proxy config, still failing',
 *   },
 *   conversationHistory: [...],
 *   metadata: {
 *     sessionId: 'sess_abc123',
 *     tenantId: 'tn_def456',
 *     startedAt: '2025-11-19T10:10:00Z',
 *     escalatedAt: '2025-11-19T10:20:00Z',
 *     totalMessages: 12,
 *     averageResponseTime: 2.5,
 *   },
 * };
 * 
 * <EscalationSummaryCard
 *   context={escalationContext}
 *   agentName="Sarah"
 *   onAcknowledge={() => console.log('Agent acknowledged')}
 *   showFullHistory={true}
 * />
 */
