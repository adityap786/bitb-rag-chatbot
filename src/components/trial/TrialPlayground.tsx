'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Loader2, Send, RefreshCw, Sparkles, Copy, Check, ThumbsUp, ThumbsDown, Zap, MessageSquare, BookOpen } from 'lucide-react';

// Suggested questions for user to try
const SUGGESTED_QUESTIONS = [
  "What services do you offer?",
  "How does your pricing work?",
  "What makes you different?",
  "How can I get started?",
];

// Message type for chat history
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  sources?: any[];
  confidence?: number;
  latencyMs?: number;
  feedback?: 'up' | 'down' | null;
}

type StoredChatMessage = Omit<ChatMessage, 'timestamp'> & { timestamp: string };

function serializeMessages(messages: ChatMessage[]): StoredChatMessage[] {
  return messages.map((m) => ({
    ...m,
    timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : new Date(m.timestamp).toISOString(),
  }));
}

function deserializeMessages(messages: StoredChatMessage[]): ChatMessage[] {
  return messages.map((m) => ({
    ...m,
    timestamp: new Date(m.timestamp),
  }));
}

function normalizeHexColor(input?: string): string | null {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();
  const short = /^#([0-9a-f]{3})$/i;
  const full = /^#([0-9a-f]{6})$/i;

  const shortMatch = trimmed.match(short);
  if (shortMatch) {
    const [r, g, b] = shortMatch[1].split('');
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  const fullMatch = trimmed.match(full);
  if (fullMatch) return `#${fullMatch[1]}`.toLowerCase();
  return null;
}

function hexToRgba(input: string | null, alpha: number): string | null {
  if (!input) return null;
  const hex = normalizeHexColor(input);
  if (!hex) return null;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const a = Math.max(0, Math.min(1, alpha));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function isLightHex(input: string | null): boolean {
  const hex = normalizeHexColor(input || undefined);
  if (!hex) return false;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  // Relative luminance (simple)
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) > 160;
}

export default function TrialPlayground({
  formData,
  trialToken,
  tenantId,
}: {
  formData: { primaryColor: string; secondaryColor?: string; chatName: string };
  trialToken: string;
  tenantId?: string;
}) {
  const primary = normalizeHexColor(formData.primaryColor) || '#6366f1';
  const secondary = normalizeHexColor(formData.secondaryColor) || '#ffffff';
  const primaryText = isLightHex(primary) ? '#1a1a1a' : '#ffffff';
  const secondaryBgSoft = hexToRgba(secondary, 0.08) || 'rgba(255,255,255,0.08)';
  const borderColor = hexToRgba(secondary, 0.2) || 'rgba(255,255,255,0.2)';

  // CSS Variables for container-level theming
  const themeStyles = {
    '--chatbot-bg': primary,
    '--chatbot-text': secondary,
    '--chatbot-text-primary': primaryText,
    '--chatbot-border': borderColor,
    '--chatbot-accent': hexToRgba(secondary, 0.15) || 'rgba(255,255,255,0.15)',
    '--chatbot-input-bg': hexToRgba(primary, 0.6) || 'rgba(0,0,0,0.6)',
    '--chatbot-msg-user': secondaryBgSoft,
    '--chatbot-msg-assistant': hexToRgba(primary, 0.8) || 'rgba(0,0,0,0.8)',
  } as React.CSSProperties;

  const [inputValue, setInputValue] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [llmInfo, setLlmInfo] = useState<{ provider?: string; model?: string } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [totalQueries, setTotalQueries] = useState(0);
  const [avgLatency, setAvgLatency] = useState(0);
  const [pipelineReady, setPipelineReady] = useState<boolean | null>(null);
  const [readinessError, setReadinessError] = useState<string | null>(null);
  const [serverHint, setServerHint] = useState<string | null>(null);
  const [lastCorrelationId, setLastCorrelationId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const readyTimerRef = useRef<NodeJS.Timeout | null>(null);
  const retryTimerRef = useRef<NodeJS.Timeout | null>(null);
  const didHydrateRef = useRef(false);
  const shouldScrollRef = useRef(false); // Only scroll when user sends a message

  // Rehydrate playground state after reload (session-scoped).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const effectiveTenantId = tenantId || process.env.NEXT_PUBLIC_DEMO_TENANT_ID;
    if (!effectiveTenantId || !trialToken) return;
    if (didHydrateRef.current) return;

    didHydrateRef.current = true;
    const storageKey = `trial_playground_session_v1:${effectiveTenantId}`;
    try {
      const raw = window.sessionStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed?.tenantId !== effectiveTenantId) return;

      if (Array.isArray(parsed?.messages) && parsed.messages.length > 0) {
        setMessages((prev) => (prev.length > 0 ? prev : deserializeMessages(parsed.messages)));
      }
      if (typeof parsed?.pipelineReady === 'boolean' || parsed?.pipelineReady === null) {
        setPipelineReady(parsed.pipelineReady);
      }
      if (typeof parsed?.totalQueries === 'number') setTotalQueries(parsed.totalQueries);
      if (typeof parsed?.avgLatency === 'number') setAvgLatency(parsed.avgLatency);
      if (typeof parsed?.llmInfo === 'object') setLlmInfo(parsed.llmInfo);
    } catch {
      // Ignore malformed session data
    }
  }, [tenantId, trialToken]);

  // Persist playground state (session-scoped) so refresh keeps chat history.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const effectiveTenantId = tenantId || process.env.NEXT_PUBLIC_DEMO_TENANT_ID;
    if (!effectiveTenantId || !trialToken) return;

    const storageKey = `trial_playground_session_v1:${effectiveTenantId}`;
    try {
      const payload = {
        tenantId: effectiveTenantId,
        messages: serializeMessages(messages),
        pipelineReady,
        totalQueries,
        avgLatency,
        llmInfo,
      };
      window.sessionStorage.setItem(storageKey, JSON.stringify(payload));
    } catch {
      // Ignore storage quota/unavailable
    }
  }, [tenantId, trialToken, messages, pipelineReady, totalQueries, avgLatency, llmInfo]);

  // Check pipeline readiness on mount and periodically
  useEffect(() => {
    const effectiveTenantId = tenantId || process.env.NEXT_PUBLIC_DEMO_TENANT_ID;
    if (!effectiveTenantId || !trialToken) return;

    console.log('[TrialPlayground] Checking readiness for tenant:', effectiveTenantId);

    let cancelled = false;
    let retryCount = 0;
    const maxRetries = 20; // Stop after ~30 seconds
    let hasTriedPipelineRetry = false; // Prevent infinite retry loops

    const triggerPipelineRetry = async () => {
      if (hasTriedPipelineRetry) return false;
      hasTriedPipelineRetry = true;

      console.log('[TrialPlayground] Triggering pipeline retry due to canRetry=true');
      try {
        const res = await fetch(`/api/tenants/${effectiveTenantId}/ingest`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${trialToken}`,
          },
          body: JSON.stringify({
            source: 'retry',
            metadata: { reason: 'playground_auto_retry' },
          }),
        });

        if (res.ok || res.status === 409) {
          console.log('[TrialPlayground] Pipeline retry triggered successfully');
          // Reset retry count to give the new job time to complete
          retryCount = 0;
          return true;
        } else {
          console.warn('[TrialPlayground] Pipeline retry failed:', res.status);
          return false;
        }
      } catch (err) {
        console.error('[TrialPlayground] Pipeline retry error:', err);
        return false;
      }
    };

    const checkReadiness = async () => {
      if (cancelled || retryCount >= maxRetries) {
        if (retryCount >= maxRetries) {
          console.error('[TrialPlayground] Max retries reached');
          setReadinessError('Pipeline is taking longer than expected. Please try restarting from Step 2.');
        }
        return;
      }

      try {
        console.log(`[TrialPlayground] Readiness check ${retryCount + 1}/${maxRetries}`);
        const res = await fetch(`/api/tenants/${effectiveTenantId}/pipeline-ready`, {
          headers: { Authorization: `Bearer ${trialToken}` },
        });
        if (!res.ok) {
          if (res.status === 401 || res.status === 403) {
            console.error('[TrialPlayground] Session expired');
            setReadinessError('Session expired. Please refresh.');
            return;
          }
          throw new Error('Failed to check readiness');
        }
        const data = await res.json();
        console.log('[TrialPlayground] Readiness response:', data);
        if (!cancelled) {
          if (data.ready) {
            // Small debounce to avoid race with embeddings write
            if (readyTimerRef.current) clearTimeout(readyTimerRef.current);
            readyTimerRef.current = setTimeout(() => setPipelineReady(true), 800);
          } else {
            setPipelineReady(false);

            // Check if we should trigger a pipeline retry
            // canRetry=true means job completed with 0 vectors but KB has content
            if (data.canRetry && !hasTriedPipelineRetry) {
              console.log('[TrialPlayground] canRetry=true detected, triggering pipeline retry');
              const triggered = await triggerPipelineRetry();
              if (triggered) {
                // Immediately recheck after triggering retry
                if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
                retryTimerRef.current = setTimeout(checkReadiness, 2000);
                return;
              }
            }
          }
          if (!data.ready) {
            retryCount++;
            // Exponential backoff: 1s, 1.5s, 2s, 2.5s... capped at 5s
            const delay = Math.min(1000 + (retryCount * 500), 5000);
            console.log(`[TrialPlayground] Not ready, retrying in ${delay}ms`);
            if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
            retryTimerRef.current = setTimeout(checkReadiness, delay);
          } else {
            console.log('[TrialPlayground] Pipeline ready!');
          }
        }
      } catch (err: any) {
        console.error('[TrialPlayground] Readiness check error:', err);
        if (!cancelled) {
          retryCount++;
          // Retry on error with longer delay
          if (retryCount < maxRetries) {
            if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
            retryTimerRef.current = setTimeout(checkReadiness, 2000);
          } else {
            setReadinessError(err.message || 'Readiness check failed');
          }
        }
      }
    };

    // Start immediately
    checkReadiness();
    return () => {
      cancelled = true;
      if (readyTimerRef.current) clearTimeout(readyTimerRef.current);
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, [tenantId, trialToken]);




  // Auto-scroll disabled - user controls scrolling manually
  // useEffect(() => {
  //   if (shouldScrollRef.current) {
  //     messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  //     shouldScrollRef.current = false;
  //   }
  // }, [messages]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, [messages, pipelineReady]);

  const generateId = () => `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const handleSendMessage = useCallback(async (query?: string) => {
    const messageText = query || inputValue.trim();
    if (!messageText || isLoading) return;
    if (!pipelineReady) {
      setServerHint('Pipeline is still preparing. Please wait a moment and try again.');
      return;
    }

    const userMessage: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: messageText,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);
    shouldScrollRef.current = true; // Trigger scroll when user sends message

    const startTime = Date.now();

    try {
      const effectiveTenantId = tenantId || process.env.NEXT_PUBLIC_DEMO_TENANT_ID;
      if (!effectiveTenantId) {
        setServerHint('Missing tenant id. Please restart the onboarding flow and try again.');
        throw new Error('Missing tenant_id');
      }
      const payload = {
        tenant_id: effectiveTenantId,
        trial_token: trialToken,
        query: messageText,
      };

      const response = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json();
      const latencyMs = Date.now() - startTime;

      if (!response.ok) {
        const reason = data.message || data.error || 'RAG query failed';
        const cid = data.correlationId || data.correlation_id || null;
        setLastCorrelationId(cid);
        setServerHint(reason);
        throw new Error(cid ? `${reason} (id: ${cid})` : reason);
      }

      // Extract LLM info
      if (data.llmProvider || data.llmModel || data.llm_provider || data.llm_model) {
        setLlmInfo({
          provider: data.llmProvider || data.llm_provider,
          model: data.llmModel || data.llm_model,
        });
      }

      const assistantMessage: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: data.answer,
        timestamp: new Date(),
        sources: data.sources || [],
        confidence: typeof data.confidence === 'number' ? data.confidence : null,
        latencyMs,
        feedback: null,
      };

      setMessages(prev => [...prev, assistantMessage]);
      setTotalQueries(prev => prev + 1);
      setAvgLatency(prev => prev === 0 ? latencyMs : Math.round((prev + latencyMs) / 2));
      setServerHint(null);
      setLastCorrelationId(null);

    } catch (err: any) {
      const errorMessage: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: `Sorry, I encountered an error: ${err?.message || 'Unknown error'}. Please try again.`,
        timestamp: new Date(),
        confidence: 0,
      };
      setMessages(prev => [...prev, errorMessage]);
    }

    setIsLoading(false);
    inputRef.current?.focus();
  }, [inputValue, isLoading, pipelineReady, tenantId, trialToken]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleCopyMessage = async (messageId: string, content: string) => {
    await navigator.clipboard.writeText(content);
    setCopiedId(messageId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleFeedback = (messageId: string, feedback: 'up' | 'down') => {
    setMessages(prev =>
      prev.map(msg =>
        msg.id === messageId ? { ...msg, feedback: msg.feedback === feedback ? null : feedback } : msg
      )
    );
    // In production, send feedback to backend
  };

  const handleClearChat = () => {
    setMessages([]);
    setTotalQueries(0);
    setAvgLatency(0);
    inputRef.current?.focus();
  };

  const handleSuggestedQuestion = (question: string) => {
    handleSendMessage(question);
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-emerald-500';
    if (confidence >= 0.5) return 'text-amber-500';
    return 'text-red-400';
  };

  const getConfidenceLabel = (confidence: number) => {
    if (confidence >= 0.8) return 'High confidence';
    if (confidence >= 0.5) return 'Medium confidence';
    return 'Low confidence';
  };

  // Show loading state while checking pipeline readiness
  if (pipelineReady === null && !readinessError) {
    return (
      <div className="relative space-y-4 min-h-[600px] flex flex-col items-center justify-center rounded-2xl" style={{ ...themeStyles, backgroundColor: 'var(--chatbot-bg)', color: 'var(--chatbot-text)' }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--chatbot-text)' }} />
        <p className="text-sm opacity-70">Checking pipeline readiness...</p>
      </div>
    );
  }

  // Show error state
  if (readinessError) {
    return (
      <div className="relative space-y-4 min-h-[600px] flex flex-col items-center justify-center rounded-2xl" style={{ ...themeStyles, backgroundColor: 'var(--chatbot-bg)', color: 'var(--chatbot-text)' }}>
        <div className="text-rose-400 text-center">
          <p className="font-semibold">Unable to check readiness</p>
          <p className="text-sm opacity-60 mt-1">{readinessError}</p>
        </div>
      </div>
    );
  }

  // Show not-ready state with polling indicator
  if (pipelineReady === false) {
    return (
      <div className="relative space-y-4 min-h-[600px] flex flex-col items-center justify-center rounded-2xl" style={{ ...themeStyles, backgroundColor: 'var(--chatbot-bg)', color: 'var(--chatbot-text)' }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--chatbot-text)' }} />
        <div className="text-center">
          <p className="font-semibold text-amber-300">Your knowledge base is still processing</p>
          <p className="text-sm opacity-60 mt-1">The Playground will activate automatically once ready...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative space-y-4 min-h-[600px] rounded-2xl"
      style={{
        ...themeStyles,
        backgroundColor: 'var(--chatbot-bg)',
        color: 'var(--chatbot-text)'
      }}
    >
      {/* Header with stats */}
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5" />
          <label className="text-sm font-semibold">AI Playground</label>
        </div>
        <div className="flex items-center gap-3 text-xs opacity-60">
          {totalQueries > 0 && (
            <>
              <span className="flex items-center gap-1">
                <MessageSquare className="w-3 h-3" />
                {totalQueries} {totalQueries === 1 ? 'query' : 'queries'}
              </span>
              <span className="flex items-center gap-1">
                <Zap className="w-3 h-3" />
                {avgLatency}ms avg
              </span>
            </>
          )}
          {llmInfo && (
            <span className="px-2 py-0.5 rounded text-[10px] font-medium" style={{ backgroundColor: 'var(--chatbot-accent)' }}>
              {llmInfo.provider || 'AI'} {llmInfo.model ? `• ${llmInfo.model.split('-').slice(0, 2).join('-')}` : ''}
            </span>
          )}
        </div>
      </div>

      {/* Chat Container */}
      <div className="relative rounded-2xl overflow-hidden shadow-2xl mx-4" style={{ border: '1px solid var(--chatbot-border)' }}>
        <div className="w-full max-w-full">
          <div className="w-full rounded-t-2xl overflow-hidden" style={{ borderBottom: '1px solid var(--chatbot-border)' }}>
            {/* Widget Header */}
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-xl shadow-inner" style={{ backgroundColor: 'var(--chatbot-accent)' }}>
                  💬
                </div>
                <div>
                  <span className="font-bold text-base">{formData.chatName || 'Support Assistant'}</span>
                  <div className="flex items-center gap-1.5 text-xs opacity-80">
                    <div
                      className="w-2 h-2 rounded-full animate-pulse shadow-lg"
                      style={{ backgroundColor: 'var(--chatbot-text)', boxShadow: '0 0 12px var(--chatbot-accent)' }}
                    />
                    <span>Online • Powered by RAG</span>
                  </div>
                </div>
              </div>
              <button
                onClick={handleClearChat}
                className="p-2 rounded-full hover:opacity-70 transition-colors"
                title="Clear chat"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>

            {/* Chat Messages Area - Hidden scrollbar on desktop, visible on mobile/tablet */}
            <div
              className="h-[380px] overflow-y-auto"
              style={{
                // Hide scrollbar on desktop (webkit browsers)
                scrollbarWidth: 'none', // Firefox
                msOverflowStyle: 'none', // IE/Edge
              }}
            >
              <style>{`
                @media (min-width: 1024px) {
                  .chat-messages-area::-webkit-scrollbar {
                    display: none;
                  }
                }
              `}</style>
              <div className="p-4 space-y-4 chat-messages-area" style={{ scrollbarWidth: 'none' }}>
                {/* Welcome message */}
                <div className="flex gap-3">
                  <div
                    className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-sm font-bold shadow-md opacity-80"
                    style={{ backgroundColor: 'var(--chatbot-accent)' }}
                  >
                    AI
                  </div>
                  <div className="flex-1">
                    <div className="rounded-2xl p-4 shadow-sm text-sm" style={{ backgroundColor: 'var(--chatbot-msg-assistant)', border: '1px solid var(--chatbot-border)', borderRadius: '0 1rem 1rem 1rem' }}>
                      <p className="mb-3">
                        👋 Hi! I'm <strong>{formData.chatName || 'Support Assistant'}</strong>. I've been trained on your knowledge base and I'm ready to help!
                      </p>
                      <p className="text-xs mb-3 opacity-60">Try one of these questions or ask your own:</p>
                      <div className="flex flex-wrap gap-2">
                        {SUGGESTED_QUESTIONS.map((q, i) => (
                          <button
                            key={i}
                            onClick={() => handleSuggestedQuestion(q)}
                            disabled={isLoading}
                            className="text-xs px-3 py-1.5 rounded-full hover:opacity-80 transition-all disabled:opacity-50"
                            style={{ border: '1px solid var(--chatbot-border)', backgroundColor: 'var(--chatbot-accent)' }}
                          >
                            {q}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Chat messages */}
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}
                  >
                    {msg.role === 'assistant' && (
                      <div
                        className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-sm font-bold shadow-md opacity-80"
                        style={{ backgroundColor: 'var(--chatbot-accent)' }}
                      >
                        AI
                      </div>
                    )}
                    <div className={`flex-1 ${msg.role === 'user' ? 'flex justify-end' : ''}`}>
                      <div
                        className="relative group max-w-[85%] rounded-2xl p-4 shadow-sm text-sm"
                        style={{
                          backgroundColor: msg.role === 'user' ? 'var(--chatbot-msg-user)' : 'var(--chatbot-msg-assistant)',
                          borderRadius: msg.role === 'user' ? '1rem 0 1rem 1rem' : '0 1rem 1rem 1rem',
                          border: '1px solid var(--chatbot-border)',
                        }}
                      >
                        <div className="whitespace-pre-wrap">{msg.content}</div>

                        {/* Assistant message footer */}
                        {msg.role === 'assistant' && (
                          <div className="mt-3 pt-2 border-t border-white/20">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2 text-xs text-gray-400">
                                {msg.confidence !== undefined && msg.confidence !== null && (
                                  <span className={`flex items-center gap-1 text-white/80`}>
                                    <Sparkles className="w-3 h-3 text-white/80" />
                                    {getConfidenceLabel(msg.confidence)}
                                  </span>
                                )}
                                {msg.latencyMs && (
                                  <span className="flex items-center gap-1">
                                    <Zap className="w-3 h-3" />
                                    {msg.latencyMs}ms
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={() => handleCopyMessage(msg.id, msg.content)}
                                  className="p-1.5 rounded hover:bg-white/10 transition-colors"
                                  title="Copy"
                                >
                                  {copiedId === msg.id ? (
                                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                                  ) : (
                                    <Copy className="w-3.5 h-3.5 text-gray-400" />
                                  )}
                                </button>
                                <button
                                  onClick={() => handleFeedback(msg.id, 'up')}
                                  className={`p-1.5 rounded hover:bg-white/10 transition-colors ${msg.feedback === 'up' ? 'bg-emerald-500/10' : ''
                                    }`}
                                  title="Good response"
                                >
                                  <ThumbsUp className={`w-3.5 h-3.5 ${msg.feedback === 'up' ? 'text-emerald-500' : 'text-gray-400'}`} />
                                </button>
                                <button
                                  onClick={() => handleFeedback(msg.id, 'down')}
                                  className={`p-1.5 rounded hover:bg-white/10 transition-colors ${msg.feedback === 'down' ? 'bg-red-500/10' : ''
                                    }`}
                                  title="Poor response"
                                >
                                  <ThumbsDown className={`w-3.5 h-3.5 ${msg.feedback === 'down' ? 'text-red-500' : 'text-gray-400'}`} />
                                </button>
                              </div>
                            </div>

                            {/* Sources */}
                            {msg.sources && msg.sources.length > 0 && (
                              <details className="mt-2">
                                <summary className="text-xs text-white/60 cursor-pointer hover:text-white flex items-center gap-1">
                                  <BookOpen className="w-3 h-3 text-white/60" />
                                  {msg.sources.length} source{msg.sources.length > 1 ? 's' : ''} used
                                </summary>
                                <div className="mt-2 space-y-1.5">
                                  {msg.sources.slice(0, 3).map((src: any, i: number) => (
                                    <div
                                      key={i}
                                      className="text-xs bg-black rounded p-2 border-l-2 border-white/30"
                                    >
                                      <div className="font-medium text-white/80">
                                        {src.metadata?.title || `Source ${i + 1}`}
                                      </div>
                                      <div className="text-white/60 mt-0.5 line-clamp-2">
                                        {src.content?.slice(0, 120)}...
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </details>
                            )}
                          </div>
                        )}
                      </div>
                      {msg.role === 'user' && (
                        <div className="text-[10px] text-gray-400 mt-1 text-right">
                          {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {/* Loading indicator */}
                {isLoading && (
                  <div className="flex gap-3">
                    <div
                      className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-sm font-bold shadow-md animate-pulse opacity-80"
                      style={{ backgroundColor: 'var(--chatbot-accent)' }}
                    >
                      AI
                    </div>
                    <div className="rounded-2xl p-4 shadow-sm" style={{ backgroundColor: 'var(--chatbot-msg-assistant)', border: '1px solid var(--chatbot-border)', borderRadius: '0 1rem 1rem 1rem' }}>
                      <div className="flex items-center gap-2 text-sm opacity-60">
                        <div className="flex gap-1">
                          <span className="w-2 h-2 rounded-full animate-bounce" style={{ animationDelay: '0ms', backgroundColor: 'var(--chatbot-text)' }} />
                          <span className="w-2 h-2 rounded-full animate-bounce" style={{ animationDelay: '150ms', backgroundColor: 'var(--chatbot-text)' }} />
                          <span className="w-2 h-2 rounded-full animate-bounce" style={{ animationDelay: '300ms', backgroundColor: 'var(--chatbot-text)' }} />
                        </div>
                        <span className="text-xs">Searching knowledge base...</span>
                      </div>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* Chat Input */}
            <div className="p-4" style={{ backgroundColor: 'var(--chatbot-input-bg)', borderTop: '1px solid var(--chatbot-border)' }}>
              <div className="flex gap-2">
                <label htmlFor="chat-query" className="sr-only">Ask anything about your content</label>
                <input
                  id="chat-query"
                  name="chat-query"
                  aria-label="Ask anything about your content"
                  ref={inputRef}
                  type="text"
                  placeholder="Ask anything about your content..."
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="flex-1 px-4 py-3 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-opacity-50 placeholder-current/40 transition-all"
                  style={{
                    border: '1px solid var(--chatbot-border)',
                    backgroundColor: 'var(--chatbot-msg-assistant)',
                    color: 'inherit'
                  }}
                  disabled={isLoading || !pipelineReady}
                />
                <button
                  onClick={() => handleSendMessage()}
                  disabled={isLoading || !inputValue.trim() || !pipelineReady}
                  className="px-5 py-3 rounded-xl font-medium text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 active:scale-95 flex items-center gap-2 shadow-lg"
                  style={{ backgroundColor: 'var(--chatbot-accent)', color: 'inherit' }}
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  <span className="hidden sm:inline">{isLoading ? 'Thinking...' : 'Send'}</span>
                </button>
              </div>
              <div className="mt-2 text-center">
                <span className="text-[10px] opacity-40">
                  Powered by hybrid RAG • Responses are AI-generated
                </span>
                {serverHint && (
                  <div className="text-[10px] text-amber-300 mt-1">{serverHint}{lastCorrelationId ? ` (id: ${lastCorrelationId})` : ''}</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom tips */}
      <div className="text-center space-y-1">
        <p className="text-xs text-white/40">
          💡 Tip: Ask specific questions for better answers. The AI uses your ingested content to respond.
        </p>
      </div>
    </div>
  );
}
