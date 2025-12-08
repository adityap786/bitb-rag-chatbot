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

export default function TrialPlayground({
  formData,
  trialToken
}: {
  formData: { primaryColor: string; chatName: string };
  trialToken: string;
}) {
  const [inputValue, setInputValue] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [llmInfo, setLlmInfo] = useState<{ provider?: string; model?: string } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [totalQueries, setTotalQueries] = useState(0);
  const [avgLatency, setAvgLatency] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const generateId = () => `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const handleSendMessage = useCallback(async (query?: string) => {
    const messageText = query || inputValue.trim();
    if (!messageText || isLoading) return;

    const userMessage: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: messageText,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    const startTime = Date.now();

    try {
      const response = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: trialToken,
          trial_token: trialToken,
          query: messageText,
        }),
      });

      const data = await response.json();
      const latencyMs = Date.now() - startTime;

      if (!response.ok) throw new Error(data.error || 'RAG query failed');

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
  }, [inputValue, isLoading, trialToken]);

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

  return (
    <div className="space-y-4 bg-black min-h-[600px] text-white">
      {/* Header with stats */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-white" />
          <label className="text-sm font-semibold text-white">AI Playground</label>
        </div>
        <div className="flex items-center gap-3 text-xs text-white/60">
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
            <span className="bg-blue-600/30 text-blue-300 px-2 py-0.5 rounded text-[10px] font-medium">
              {llmInfo.provider || 'AI'} {llmInfo.model ? `• ${llmInfo.model.split('-').slice(0, 2).join('-')}` : ''}
            </span>
          )}
        </div>
      </div>

      {/* Chat Container */}
      <div className="relative rounded-2xl border border-white/10 bg-black overflow-hidden shadow-2xl">
        <div className="w-full max-w-full">
          <div className="w-full rounded-t-2xl overflow-hidden border-b border-white/10 bg-black">
            {/* Widget Header */}
            <div
              className="flex items-center justify-between px-4 py-3 text-white bg-black"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-xl shadow-inner text-white">
                  💬
                </div>
                <div>
                  <span className="font-bold text-base">{formData.chatName || 'Support Assistant'}</span>
                  <div className="flex items-center gap-1.5 text-xs text-white/80">
                    <div className="w-2 h-2 rounded-full bg-white animate-pulse shadow-lg shadow-white/50"></div>
                    <span>Online • Powered by RAG</span>
                  </div>
                </div>
              </div>
              <button
                onClick={handleClearChat}
                className="p-2 rounded-full hover:bg-white/20 transition-colors"
                title="Clear chat"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>

            {/* Chat Messages Area */}
            <div className="h-[380px] bg-black overflow-y-auto">
              <div className="p-4 space-y-4">
                {/* Welcome message */}
                <div className="flex gap-3">
                  <div 
                    className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-sm font-bold shadow-md"
                    style={{ backgroundColor: 'white', color: 'black' }}
                  >
                    AI
                  </div>
                  <div className="flex-1">
                    <div className="bg-black border border-white/20 rounded-2xl rounded-tl-none p-4 shadow-sm text-sm text-white">
                      <p className="mb-3">
                        👋 Hi! I'm <strong>{formData.chatName || 'Support Assistant'}</strong>. I've been trained on your knowledge base and I'm ready to help!
                      </p>
                      <p className="text-gray-600 text-xs mb-3">Try one of these questions or ask your own:</p>
                      <div className="flex flex-wrap gap-2">
                        {SUGGESTED_QUESTIONS.map((q, i) => (
                          <button
                            key={i}
                            onClick={() => handleSuggestedQuestion(q)}
                            disabled={isLoading}
                            className="text-xs px-3 py-1.5 rounded-full border border-white/20 bg-black hover:bg-white/10 hover:border-white/30 transition-all text-white disabled:opacity-50"
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
                        className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-sm font-bold shadow-md"
                        style={{ backgroundColor: formData.primaryColor, color: 'white' }}
                      >
                        AI
                      </div>
                    )}
                    <div className={`flex-1 ${msg.role === 'user' ? 'flex justify-end' : ''}`}>
                      <div
                        className={`relative group max-w-[85%] rounded-2xl p-4 shadow-sm text-sm ${
                          msg.role === 'user'
                            ? 'bg-white/20 text-white rounded-tr-none'
                            : 'bg-black border border-white/20 text-white rounded-tl-none'
                        }`}
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
                                  className="p-1.5 rounded hover:bg-gray-100 transition-colors"
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
                                  className={`p-1.5 rounded hover:bg-gray-100 transition-colors ${
                                    msg.feedback === 'up' ? 'bg-emerald-50' : ''
                                  }`}
                                  title="Good response"
                                >
                                  <ThumbsUp className={`w-3.5 h-3.5 ${msg.feedback === 'up' ? 'text-emerald-500' : 'text-gray-400'}`} />
                                </button>
                                <button
                                  onClick={() => handleFeedback(msg.id, 'down')}
                                  className={`p-1.5 rounded hover:bg-gray-100 transition-colors ${
                                    msg.feedback === 'down' ? 'bg-red-50' : ''
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
                      className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-sm font-bold shadow-md animate-pulse"
                      style={{ backgroundColor: 'white', color: 'black' }}
                    >
                      AI
                    </div>
                    <div className="bg-black rounded-2xl rounded-tl-none p-4 shadow-sm border border-white/20">
                      <div className="flex items-center gap-2 text-sm text-white/60">
                        <div className="flex gap-1">
                          <span className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                          <span className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                          <span className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
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
            <div className="p-4 bg-black border-t border-white/20">
              <div className="flex gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Ask anything about your content..."
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="flex-1 px-4 py-3 border border-white/20 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-opacity-50 text-white placeholder-white/40 bg-black transition-all"
                  style={{ '--tw-ring-color': 'white' } as any}
                  disabled={isLoading}
                />
                <button
                  onClick={() => handleSendMessage()}
                  disabled={isLoading || !inputValue.trim()}
                  className="px-5 py-3 rounded-xl text-white font-medium text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 active:scale-95 flex items-center gap-2 shadow-lg bg-white/20"
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
                <span className="text-[10px] text-white/40">
                  Powered by hybrid RAG • Responses are AI-generated
                </span>
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
