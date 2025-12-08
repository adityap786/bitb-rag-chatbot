"use client";

import { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { format } from "date-fns";
import { Brain, X, Send, Download, Share2, Minimize2, Maximize2, Volume2, VolumeX, RefreshCw, ArrowDownCircle, List, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ChatMessage, ChatbotConfig } from "@/types/chatbot";
import { searchPlaybook } from "@/lib/previewPlaybook";
import { sendVoiceEvent } from "@/lib/telemetry/greetingTelemetry";
import { BatchQueryInput } from "@/components/chatbot/BatchQueryInput";
import { BatchResults, BatchProgress } from "@/components/chatbot/BatchResults";
import CitationCard from "@/components/chatbot/CitationCard";
import { HealthcareWidgetExtensions } from "@/components/chatbot/healthcare/HealthcareWidgetExtensions";
import { LegalWidgetExtensions } from "@/components/chatbot/legal/LegalWidgetExtensions";
import { FinancialWidgetExtensions } from "@/components/chatbot/financial/FinancialWidgetExtensions";
import { RealEstateWidgetExtensions } from "@/components/chatbot/realestate/RealEstateWidgetExtensions";
import { EcommerceWidgetExtensions } from "@/components/chatbot/ecommerce/EcommerceWidgetExtensions";
import { BookingWidgetExtensions } from "@/components/chatbot/booking/BookingWidgetExtensions";

const STORAGE_KEYS = {
  CONFIG: "bitb-config",
  MESSAGES: "bitb-messages",
  VOICE_MUTED: "bitb_voice_muted",
} as const;

const DEFAULT_CONFIG: Partial<ChatbotConfig> = {
  assistantName: "BiTB Assistant",
  enableTranscriptExport: true,
  enableSuggestedReplies: true,
  fontFamily: "inherit",
  position: "bottom-right",
  layout: "expanded",
  language: "auto",
  brandColor: "#000000",
  theme: "dark",
  tone: "professional",
  fallbackMessage: "I'm here to help!",
  enableSiteSearch: false,
  enableFeedback: false,
  enableHumanHandover: false,
  indexedUrls: [],
  uploadedDocuments: [],
};

// Import the MP3 file (placed in `public/greeting-audio.mp3`)
const GREETING_AUDIO_URL = "/greeting-audio.mp3";

function useAudioGreeting() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEYS.VOICE_MUTED) === "true";
    } catch (e) {
      return false;
    }
  });
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Telemetry is centralized in `src/lib/telemetry/greetingTelemetry.ts`.
  // We call `sendVoiceEvent(name, payload)` below to emit diagnostics and
  // optional dataLayer / CustomEvent / server-side events.

  const FALLBACK_GREETING_TEXT = "Hello, I am the BiTB assistant. How can I help you today?";

  const trySpeechSynthesisFallback = (): boolean => {
    if (typeof window === "undefined") return false;
    const synth = (window as any).speechSynthesis;
    if (!synth) return false;

    try {
      const utter = new SpeechSynthesisUtterance(FALLBACK_GREETING_TEXT);
      utter.lang = "en-US";
      utter.onend = () => {
        setIsPlaying(false);
        sendVoiceEvent("fallback_tts_ended", { source: "speechSynthesis" });
      };
      utter.onerror = (err) => {
        setIsPlaying(false);
        sendVoiceEvent("fallback_tts_error", { error: String(err) });
      };
      // Stop any in-progress synths and speak
      try { synth.cancel(); } catch {}
      synth.speak(utter);
      setIsPlaying(true);
      sendVoiceEvent("fallback_tts", { source: "speechSynthesis" });
      return true;
    } catch (e) {
      sendVoiceEvent("fallback_tts_error", { error: String(e) });
      return false;
    }
  };

  useEffect(() => {
    if (!audioRef.current) {
      const audio = new Audio(GREETING_AUDIO_URL);
      audio.onended = () => {
        setIsPlaying(false);
        sendVoiceEvent("play_ended", { source: "mp3" });
      };
      audio.onerror = (e) => {
        console.error("Audio playback failed.", e);
        sendVoiceEvent("play_failed", { source: "mp3", error: String(e) });
        // Try a lightweight browser TTS fallback (no network, no cost)
        trySpeechSynthesisFallback();
      };
      audio.volume = isMuted ? 0 : 1;
      audioRef.current = audio;
    }

    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
        audioRef.current = null;
      }
    };
  }, [isMuted]);

  const playGreeting = (opts?: { trigger?: "open" | "replay" | "programmatic" }) => {
    const trigger = opts?.trigger ?? "programmatic";
    if (isMuted) {
      sendVoiceEvent("play_skipped_muted", { trigger });
      return;
    }

    sendVoiceEvent("play_attempt", { trigger, source: "mp3", muted: isMuted });
    setIsPlaying(true);

    try {
      // Lazily create the audio element if it wasn't created yet
      if (!audioRef.current) {
        const a = new Audio(GREETING_AUDIO_URL);
        a.onended = () => {
          setIsPlaying(false);
          sendVoiceEvent("play_ended", { trigger, source: "mp3" });
        };
        a.onerror = (e) => {
          console.error("Audio playback failed.", e);
          sendVoiceEvent("play_failed", { trigger, source: "mp3", error: String(e) });
          trySpeechSynthesisFallback();
          setIsPlaying(false);
        };
        a.volume = isMuted ? 0 : 1;
        audioRef.current = a;
      } else {
        // ensure volume is in sync with mute state
        audioRef.current.volume = isMuted ? 0 : 1;
      }

      audioRef.current.currentTime = 0;
      const playPromise = audioRef.current.play();
      if (playPromise && typeof playPromise.then === "function") {
        playPromise
          .then(() => {
            sendVoiceEvent("play_success", { trigger, source: "mp3" });
          })
          .catch((err) => {
            sendVoiceEvent("play_failed", { trigger, source: "mp3", error: String(err) });
            trySpeechSynthesisFallback();
            setIsPlaying(false);
          });
      } else {
        // If play() didn't return a promise, assume success
        sendVoiceEvent("play_success", { trigger, source: "mp3" });
      }
    } catch (err) {
      console.error("playGreeting error:", err);
      sendVoiceEvent("play_failed", { trigger, source: "mp3", error: String(err) });
      trySpeechSynthesisFallback();
      setIsPlaying(false);
    }
  };

  const mute = () => {
    setIsMuted(true);
    try {
      localStorage.setItem(STORAGE_KEYS.VOICE_MUTED, "true");
    } catch (e) {}
    if (audioRef.current) audioRef.current.volume = 0;
  };

  const unmute = () => {
    setIsMuted(false);
    try {
      localStorage.removeItem(STORAGE_KEYS.VOICE_MUTED);
    } catch (e) {}
    if (audioRef.current) audioRef.current.volume = 1;
  };

  return { isPlaying, isMuted, playGreeting, mute, unmute };
}

const GREETED_KEY = "bitb_greeted";

// NOTE: The browser-based TTS hook (`useBrowserTTSGreeting`) was removed intentionally
// in favor of a static, branded MP3 playback (see `useAudioGreeting` above). Server-side
// proxy `/api/tts` (Google TTS) is considered legacy for this build and will be removed
// from the codebase to avoid paid API usage and simplify maintenance.

export const ChatbotWidget = ({ previewMode = false }: { previewMode?: boolean }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [config, setConfig] = useState<Partial<ChatbotConfig>>(DEFAULT_CONFIG);
  const [activeLanguage, setActiveLanguage] = useState<"en" | "hi" | "hinglish">("en");
  // Remove duplicate greeting/mute state, handled by useGoogleTTSGreeting
  const [shouldStickToBottom, setShouldStickToBottom] = useState(true);
  
  // Batch mode state
  const [chatMode, setChatMode] = useState<'single' | 'batch'>('single');
  const [batchResults, setBatchResults] = useState<any>(null);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number; query?: string } | null>(null);

  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatWidgetRef = useRef<HTMLDivElement>(null);

  // Find or generate sessionId for API calls
  const sessionId = useRef<string>(`session_${Date.now()}`).current;

  // Click outside to close (production-level)
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (isOpen && chatWidgetRef.current && !chatWidgetRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setMessages([]); // Clear client UI state
      }
    }
    if (isOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  // Smooth auto-scroll to bottom
  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    setShouldStickToBottom(true);
    requestAnimationFrame(() => {
      setTimeout(() => {
        const scrollElement = scrollAreaRef.current?.querySelector<HTMLElement>("[data-radix-scroll-area-viewport]");
        if (scrollElement) {
          scrollElement.scrollTo({
            top: scrollElement.scrollHeight,
            behavior,
          });
        }
        messagesEndRef.current?.scrollIntoView({ behavior });
      }, 40);
    });
  };

  // Auto-scroll on new messages
  useEffect(() => {
    if (isOpen && !isMinimized && shouldStickToBottom) {
      scrollToBottom();
    }
  }, [messages, isOpen, isMinimized, shouldStickToBottom]);

  // Scroll behavior
  useEffect(() => {
    if (!isOpen || isMinimized) return;

    const scrollElement = scrollAreaRef.current?.querySelector<HTMLElement>("[data-radix-scroll-area-viewport]");
    if (!scrollElement) return;

    let animationFrame: number | null = null;

    const updateScrollMarkers = () => {
      animationFrame = null;
      const { scrollTop, scrollHeight, clientHeight } = scrollElement;
      const hasBottomShadow = scrollHeight - (scrollTop + clientHeight) > 24;

      if (hasBottomShadow) {
        setShouldStickToBottom((prev) => (prev ? false : prev));
      } else {
        setShouldStickToBottom((prev) => (prev ? prev : true));
      }
    };

    const handleScroll = () => {
      if (animationFrame === null) {
        animationFrame = window.requestAnimationFrame(updateScrollMarkers);
      }
    };

    scrollElement.addEventListener("scroll", handleScroll, { passive: true });
    updateScrollMarkers();

    return () => {
      scrollElement.removeEventListener("scroll", handleScroll);
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame);
      }
    };
  }, [isOpen, isMinimized, messages.length]);

  // On page refresh, do not restore previous chat; always start new session
  useEffect(() => {
    setMessages([]); // Clear messages on mount (refresh)
  }, []);
  // Initialize with welcome message when user opens the widget
  useEffect(() => {
    if (messages.length === 0 && isOpen) {
      const welcomeMessages: Record<"en" | "hi" | "hinglish", string> = {
        en: `👋 Welcome! I am ${config.assistantName} from Bits and Bytes Pvt Ltd. Ask about Service Desk, Commerce Assist, or Enterprise Command and I will guide you.`,
        hi: `नमस्ते! मैं ${config.assistantName} हूं, Bits और Bytes Pvt Ltd की सहायक। Service Desk, Commerce Assist या Enterprise Command योजनाओं के बारे में पूछिए।`,
        hinglish: `Namaste! Main ${config.assistantName} hoon. Service Desk, Commerce Assist aur Enterprise Command ke baare mein poochhiye.`,
      };
      const languageKey = config.language === "auto" ? "en" : (config.language as "en" | "hi" | "hinglish");
      setMessages([
        {
          id: "welcome",
          content: welcomeMessages[languageKey],
          role: "assistant",
          timestamp: new Date(),
          language: activeLanguage,
          suggested_replies: previewMode 
            ? ["Tell me about Service Desk", "What does Commerce Assist cover?", "Explain Enterprise Command"] 
            : ["Service plan features", "E-commerce automations", "Enterprise security"],
        }
      ]);
    }
  }, [messages.length, isOpen, config.assistantName, config.language, activeLanguage, previewMode]);

  const searchKnowledge = (query: string) => {
    try {
      const [topResult] = searchPlaybook(query, 1);
      if (topResult && topResult.score > 0.1) {
        const { entry, chunk, score } = topResult;
        const cleanSource = entry.source.replace(/^https?:\/\//, "");
        const response = `**${entry.title}**\n\n${chunk}\n\n_Source: ${cleanSource}_`;
        return {
          response,
          source: entry.source,
          score,
        };
      }
    } catch (err) {
      console.error("Hybrid search failed", err);
    }
    return null;
  };

  const handleSendMessage = async (text?: string) => {
    const messageText = typeof text === 'string' ? text : inputValue;
    if (!messageText.trim() || isLoading) return;
    setShouldStickToBottom(true);
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      content: messageText,
      role: "user",
      timestamp: new Date(),
      language: activeLanguage,
    };
    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setIsLoading(true);
    await new Promise(resolve => setTimeout(resolve, 500));
    try {
      let botResponse: ChatMessage;
      if (previewMode) {
        // ...existing code...
      } else {
        // Support batch and single message
        const isBatch = false; // TODO: set true if batch input UI is present
        if (isBatch) {
          // Example batch request
          const batchMessages = [{ query: messageText }];
          const response = await fetch('/api/widget/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, messages: batchMessages }),
          });
          const data = await response.json();
          if (data.batch && Array.isArray(data.batch)) {
            data.batch.forEach((entry: any) => {
              setMessages((prev) => [
                ...prev,
                {
                  id: Date.now().toString(),
                  content: entry.reply,
                  role: 'assistant',
                  timestamp: entry.timestamp,
                  sources: entry.sources,
                  error: entry.error,
                  characterLimitApplied: entry.characterLimitApplied,
                  originalLength: entry.originalLength,
                  audit: entry.audit,
                  status: entry.status,
                  language: activeLanguage,
                },
              ]);
            });
            // Optionally surface batch summary, audits, etc.
          }
        } else {
          // Streaming mode (single message)
          let partial = "";
          const response = await fetch(`/api/widget/chat?stream=true`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId, message: messageText }),
          });
          if (response.body) {
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let done = false;
            while (!done) {
              const { value, done: readerDone } = await reader.read();
              done = readerDone;
              if (value) {
                const chunk = decoder.decode(value);
                chunk.split("\n").forEach(line => {
                  if (line.startsWith("data: ")) {
                    try {
                      const { token, partial: newPartial, metadata } = JSON.parse(line.slice(6));
                      partial = newPartial;
                      setMessages((prev) => {
                        const last = prev[prev.length - 1];
                        if (last && last.role === "assistant") {
                          const mergedMetadata = metadata || last.metadata;
                          return [...prev.slice(0, -1), { ...last, content: partial, metadata: mergedMetadata }];
                        } else {
                          return [...prev, { id: Date.now().toString(), content: partial, role: "assistant", timestamp: new Date(), language: activeLanguage, metadata }];
                        }
                      });
                    } catch {}
                  }
                });
              }
            }
          } else {
            // Fallback: non-streaming
            const data = await response.json();
            botResponse = {
              id: (Date.now() + 1).toString(),
              content: data.reply,
              role: "assistant",
              timestamp: new Date(),
              language: activeLanguage,
              metadata: data.metadata,
              sources: data.sources,
            };
            setMessages((prev) => [...prev, botResponse]);
          }
        }
      }
    } catch (error) {
      console.error("Error generating response:", error);
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        content: "Sorry, I encountered an error. Please try again.",
        role: "assistant",
        timestamp: new Date(),
        language: activeLanguage,
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const generateResponse = (input: string): string => {
    return "This preview build runs without the full RAG pipeline. In production I answer using your indexed content about Service Desk, Commerce Assist, Enterprise Command, and any custom playbooks you upload.";
  };

  const generateSuggestedReplies = (input: string, isPreview: boolean): string[] => {
    if (!config.enableSuggestedReplies) return [];
    
    if (!isPreview) {
      return ["Service plan features", "E-commerce automations", "Enterprise security"];
    }

    const lowerInput = input.toLowerCase();
    
    if (lowerInput.includes("service") || lowerInput.includes("agency") || lowerInput.includes("consult")) {
      return ["What is in Service Desk?", "How fast is onboarding?", "Show me use cases"];
    }

    if (lowerInput.includes("commerce") || lowerInput.includes("shop") || lowerInput.includes("product")) {
      return ["Commerce Assist features", "Catalog ingestion", "Conversion analytics"];
    }

    if (lowerInput.includes("enterprise") || lowerInput.includes("compliance") || lowerInput.includes("security")) {
      return ["Enterprise Command security", "SLA details", "Custom integrations"];
    }

    if (lowerInput.includes("trial") || lowerInput.includes("demo")) {
      return ["Start trial", "Ingestion limits", "Embed instructions"];
    }
    
    return ["Service Desk overview", "Commerce Assist details", "Enterprise Command"];
  };

  const handleBatchSubmit = async (queries: Array<{ id: string; query: string }>) => {
    if (queries.length === 0 || isLoading) return;

    setIsLoading(true);
    setBatchResults(null);
    setBatchProgress({ current: 0, total: queries.length });

    try {
      const response = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          batch: true,
          queries: queries.map(q => ({ query: q.query })),
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      // Check if SSE streaming
      if (response.headers.get('content-type')?.includes('text/event-stream')) {
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.progress) {
                  setBatchProgress({
                    current: data.progress.current,
                    total: data.progress.total,
                    query: data.progress.query,
                  });
                } else if (data.results) {
                  setBatchResults(data);
                  setBatchProgress(null);
                }
              } catch (e) {
                console.error('Failed to parse SSE:', e);
              }
            }
          }
        }
      } else {
        // Regular JSON response
        const data = await response.json();
        setBatchResults(data);
        setBatchProgress(null);
      }
    } catch (error) {
      console.error('Batch query error:', error);
      setBatchResults({
        results: queries.map(q => ({
          query: q.query,
          answer: 'Error processing this query. Please try again.',
          sources: [],
          usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          latencyMs: 0,
          cached: false,
        })),
        totalTokens: 0,
        totalLatencyMs: 0,
        aggregated: false,
      });
      setBatchProgress(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleScrollToLatest = () => {
    scrollToBottom();
  };

  const handleExportTranscript = () => {
    const transcript = messages
      .map((msg) => `[${format(msg.timestamp, "yyyy-MM-dd HH:mm:ss")}] ${msg.role === "user" ? "You" : config.assistantName}: ${msg.content}`)
      .join("\n\n");

    const blob = new Blob([transcript], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chat-transcript-${format(new Date(), "yyyy-MM-dd-HHmmss")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleShareTranscript = async () => {
    const transcript = messages
      .map((msg) => `${msg.role === "user" ? "You" : config.assistantName}: ${msg.content}`)
      .join("\n\n");

    if (navigator.share) {
      try {
        await navigator.share({
          title: "Chat Transcript",
          text: transcript,
        });
      } catch (err) {
        console.error("Share failed", err);
      }
    } else {
      navigator.clipboard.writeText(transcript);
    }
  };

  const handleSuggestedReply = (reply: string) => {
    setInputValue(reply);
  };

  const getPositionClasses = () => {
    const positions = {
      "bottom-right": "bottom-4 right-4 sm:bottom-4 sm:right-4",
      "bottom-left": "bottom-4 left-4 sm:bottom-4 sm:left-4",
      "top-right": "top-4 right-4 sm:top-4 sm:right-4",
      "top-left": "top-4 left-4 sm:top-4 sm:left-4",
    };
    return positions[config.position as keyof typeof positions] || positions["bottom-right"];
  };

  // Remove old hover greeting and mute logic

  const greeting = useAudioGreeting();

  return (
    <TooltipProvider>
      <div
        ref={chatWidgetRef}
        className={`fixed ${getPositionClasses()} z-50`}
        style={{ fontFamily: config.fontFamily }}
      >
        {isOpen && (
          <div
            className={`mb-4 flex flex-col bg-black rounded-2xl shadow-2xl border border-zinc-800 overflow-hidden transition-all duration-300 ease-out ${
              isMinimized 
                ? "h-16 w-80 sm:w-96" 
                : config.layout === "compact" 
                  ? "h-[min(400px,80vh)] w-80 sm:w-96 max-w-[calc(100vw-2rem)]" 
                  : config.layout === "expanded" 
                    ? "h-[min(600px,90vh)] w-[90vw] sm:w-[500px] max-w-[calc(100vw-2rem)]" 
                    : "h-[min(500px,85vh)] w-[90vw] sm:w-96 max-w-[calc(100vw-2rem)]"
            }`}
            style={{
              transformOrigin: "bottom right",
              animation: "slideIn 0.28s cubic-bezier(0.2, 0.9, 0.2, 1)"
            }}
          >
            {/* Sticky Header */}
            <div className="flex items-center justify-between p-3 sm:p-4 border-b border-zinc-800 bg-black shrink-0">
                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <div style={{ position: 'relative', zIndex: 10 }}>
                  <img 
                    src="/bitb-logo.webp" 
                    alt="Bits & Bytes Logo" 
                    className="h-7 w-7 sm:h-8 sm:w-8 rounded-full bg-white object-contain shrink-0 border border-white" 
                    onError={(e) => { 
                      e.currentTarget.src='/bitb-logo-temp.png'; 
                      e.currentTarget.alt='Logo not found'; 
                    }}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                  <h3 className="font-semibold text-white text-sm sm:text-base truncate">{config.assistantName}</h3>
                  {greeting.isPlaying && (
                    <span className="ml-2 flex items-center" aria-live="polite" aria-atomic="true">
                      <span className="sr-only">Assistant is speaking</span>
                      <span className="speaking-bars" aria-hidden="true">
                        <span className="bar" />
                        <span className="bar" />
                        <span className="bar" />
                      </span>
                    </span>
                  )}
                </div>
                {previewMode && (
                  <Badge variant="outline" className="text-xs text-white border-zinc-600 bg-zinc-900 hidden sm:inline-flex">
                    Preview
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-white hover:bg-white/10"
                        onClick={() => greeting.isMuted ? greeting.unmute() : greeting.mute()}
                      aria-pressed={greeting.isMuted}
                      aria-label={greeting.isMuted ? "Unmute voice" : "Mute voice"}
                    >
                      {greeting.isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="bg-black text-white border-zinc-800">
                    {greeting.isMuted ? "Unmute voice" : "Mute voice"}
                  </TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-white hover:bg-white/10"
                      onClick={() => greeting.playGreeting({ trigger: 'replay' })}
                      disabled={greeting.isPlaying}
                      aria-label="Replay greeting"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="bg-black text-white border-zinc-800">Replay greeting</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-white hover:bg-white/10"
                      onClick={() => setIsMinimized(!isMinimized)}
                    >
                      {isMinimized ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="bg-black text-white border-zinc-800">{isMinimized ? "Expand" : "Minimize"}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-white hover:bg-white/10"
                      onClick={() => setIsOpen(false)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="bg-black text-white border-zinc-800">Close</TooltipContent>
                </Tooltip>
              </div>
            </div>

            {!isMinimized && (
              <>
                {/* Sticky Action Bar */}
                {config.enableTranscriptExport && messages.length > 1 && (
                  <div className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-black border-b border-zinc-800 shrink-0">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="sm" onClick={handleExportTranscript} className="h-8 text-xs text-white hover:bg-white/10">
                          <Download className="h-3 w-3 mr-1" />
                          Export
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent className="bg-black text-white border-zinc-800">Download transcript</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="sm" onClick={handleShareTranscript} className="h-8 text-xs text-white hover:bg-white/10">
                          <Share2 className="h-3 w-3 mr-1" />
                          Share
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent className="bg-black text-white border-zinc-800">Share transcript</TooltipContent>
                    </Tooltip>
                    <Badge variant="outline" className="ml-auto text-xs text-white border-zinc-800">
                      {messages.length} messages
                    </Badge>
                  </div>
                )}

                <div className="relative flex-1 bg-black overflow-hidden">
                  {/* Custom scrollbar, only visible on overflow */}
                  <ScrollArea
                    ref={scrollAreaRef}
                    className="h-full px-3 sm:px-4 pb-4 pt-4 custom-scrollbar"
                    style={{
                      overflowY: messages.length > 3 ? 'auto' : 'hidden',
                      scrollbarWidth: messages.length > 3 ? 'thin' : 'none',
                    }}
                    tabIndex={0}
                    aria-label="Chat messages"
                    role="log"
                  >
                    <div className="space-y-4 pr-1" aria-live="polite" aria-atomic="false">
                      {messages.map((msg, index) => (
                        <div
                          key={msg.id}
                          style={{
                            animation: index === messages.length - 1 ? "messageSlideIn 0.18s ease-out" : "none"
                          }}
                        >
                          <div className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                            <div
                              className={`max-w-[85%] rounded-2xl px-4 py-2 transition-transform duration-200 will-change-transform ${
                                msg.role === "user"
                                  ? "bg-zinc-800 text-white"
                                  : "bg-zinc-900 text-white"
                              }`}
                            >
                              <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={{
                                  p: ({ children }) => <p className="text-sm text-white">{children}</p>,
                                  ul: ({ children }) => <ul className="text-sm list-disc ml-4 text-white">{children}</ul>,
                                  ol: ({ children }) => <ol className="text-sm list-decimal ml-4 text-white">{children}</ol>,
                                  li: ({ children }) => <li className="text-sm text-white">{children}</li>,
                                  strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
                                  em: ({ children }) => <em className="italic text-white">{children}</em>,
                                  code: ({ children }) => <code className="text-sm bg-zinc-800 text-white px-1 rounded">{children}</code>,
                                  a: ({ children, href }) => <a href={href} className="text-sm underline text-zinc-400 hover:text-white" target="_blank" rel="noopener noreferrer">{children}</a>,
                                }}
                              >
                                {msg.content}
                              </ReactMarkdown>
                              {/* Batch metadata UI for assistant messages */}
                              {msg.role === "assistant" && (
                                <div className="mt-2 space-y-1">
                                  {msg.status && (
                                    <span className={`text-xs px-2 py-1 rounded ${msg.status === 'error' ? 'bg-red-900 text-red-300' : 'bg-green-900 text-green-300'}`}>{msg.status}</span>
                                  )}
                                  {msg.error && (
                                    <div className="text-xs text-red-400">Error: {msg.error}</div>
                                  )}
                                  {msg.characterLimitApplied !== undefined && (
                                    <div className="text-xs text-white/60">Character limit: {msg.characterLimitApplied}</div>
                                  )}
                                  {msg.originalLength !== undefined && (
                                    <div className="text-xs text-white/60">Original length: {msg.originalLength}</div>
                                  )}
                                  {msg.audit && (
                                    <details className="text-xs text-white/40"><summary>Audit log</summary><pre>{JSON.stringify(msg.audit, null, 2)}</pre></details>
                                  )}
                                </div>
                              )}
                              {msg.sources && msg.sources.length > 0 && (
                                <div className="mt-2 pt-2 border-t border-zinc-700">
                                  <p className="text-xs text-white/60 mb-1">Sources:</p>
                                  {msg.sources.map((source, idx) => (
                                    <CitationCard
                                      key={idx}
                                      source={source}
                                      conversationId={(msg as any).conversation_id}
                                      messageId={msg.id}
                                    />
                                  ))}
                                </div>
                              )}
                              <p className="text-xs text-white/60 mt-1">
                                {format(msg.timestamp, "HH:mm")}
                              </p>
                            </div>
                          </div>

                          {msg.suggested_replies && msg.suggested_replies.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-2 ml-2">
                              {msg.suggested_replies.map((reply, idx) => (
                                <Button
                                  key={idx}
                                  variant="outline"
                                  size="sm"
                                  className="h-7 text-xs rounded-full bg-zinc-900 text-white border-zinc-800 hover:bg-zinc-800"
                                  onClick={() => handleSuggestedReply(reply)}
                                >
                                  {reply}
                                </Button>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}

                      {isLoading && (
                        <div className="flex justify-start">
                          <div className="bg-zinc-900 rounded-2xl px-4 py-3">
                            <div className="flex gap-1">
                              <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                              <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                              <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                            </div>
                          </div>
                        </div>
                      )}
                      <div ref={messagesEndRef} />
                    </div>
                  </ScrollArea>
                  {/* Vertical extensions: tenant-specific quick actions (rendered between messages and input) */}
                  <div className="px-3 sm:px-4">
                    {config.industry === 'healthcare' && (
                      <HealthcareWidgetExtensions onSendMessage={handleSendMessage} tenantId={sessionId} />
                    )}
                    {config.industry === 'legal' && (
                      <LegalWidgetExtensions onSendMessage={handleSendMessage} tenantId={sessionId} />
                    )}
                    {config.industry === 'financial' && (
                      <FinancialWidgetExtensions onSendMessage={handleSendMessage} tenantId={sessionId} />
                    )}
                    {config.industry === 'real_estate' && (
                      <RealEstateWidgetExtensions 
                        onSendMessage={handleSendMessage} 
                        tenantId={sessionId} 
                        lastMessageMetadata={messages[messages.length - 1]?.metadata}
                      />
                    )}
                    {config.industry === 'ecommerce' && (
                      <EcommerceWidgetExtensions 
                        onSendMessage={handleSendMessage} 
                        tenantId={sessionId} 
                        lastMessageMetadata={messages[messages.length - 1]?.metadata}
                      />
                    )}
                    {config.enableBooking && (
                      <BookingWidgetExtensions 
                        onSendMessage={handleSendMessage} 
                        tenantId={sessionId} 
                        lastMessageMetadata={messages[messages.length - 1]?.metadata}
                      />
                    )}
                  </div>
                  {!shouldStickToBottom && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleScrollToLatest}
                      className="absolute left-1/2 bottom-6 -translate-x-1/2 rounded-full bg-white/85 px-4 py-2 text-xs font-medium text-black shadow-lg shadow-black/30 backdrop-blur-md transition-transform hover:-translate-y-0.5 hover:bg-white animate-scroll-hint"
                      aria-label="Jump to latest messages"
                    >
                      <ArrowDownCircle className="h-4 w-4" />
                      Jump to latest
                    </Button>
                  )}
                </div>

                {/* Sticky Input Area with Tabs */}
                <div className="border-t border-zinc-800 bg-black shrink-0">
                  <Tabs value={chatMode} onValueChange={(v) => setChatMode(v as 'single' | 'batch')} className="w-full">
                    <TabsList className="w-full justify-start border-b border-zinc-800 bg-black rounded-none h-auto p-0">
                      <TabsTrigger 
                        value="single" 
                        className="flex-1 rounded-none data-[state=active]:bg-zinc-900 data-[state=active]:border-b-2 data-[state=active]:border-white h-10"
                      >
                        <MessageSquare className="h-4 w-4 mr-2" />
                        Single
                      </TabsTrigger>
                      <TabsTrigger 
                        value="batch" 
                        className="flex-1 rounded-none data-[state=active]:bg-zinc-900 data-[state=active]:border-b-2 data-[state=active]:border-white h-10"
                      >
                        <List className="h-4 w-4 mr-2" />
                        Batch
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="single" className="p-3 sm:p-4 m-0">
                      <div className="flex gap-2">
                        <Textarea
                          value={inputValue}
                          onChange={(e) => setInputValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              handleSendMessage();
                            }
                            if (e.key === "Escape") {
                              setIsOpen(false);
                            }
                          }}
                          placeholder="Type your message..."
                          className="min-h-[44px] max-h-32 resize-none bg-zinc-900 text-white border-zinc-800 placeholder:text-zinc-500"
                          aria-label="Message input"
                        />
                        <Button
                          onClick={() => handleSendMessage()}
                          disabled={!inputValue.trim() || isLoading}
                          size="icon"
                          className="h-[44px] w-[44px] shrink-0 bg-white text-black hover:bg-zinc-200"
                          aria-label="Send message"
                        >
                          <Send className="h-4 w-4" />
                        </Button>
                      </div>
                    </TabsContent>

                    <TabsContent value="batch" className="p-3 sm:p-4 m-0">
                      {batchProgress ? (
                        <BatchProgress 
                          currentQuery={batchProgress.current}
                          totalQueries={batchProgress.total}
                          currentQueryText={batchProgress.query}
                        />
                      ) : batchResults ? (
                        <BatchResults 
                          results={batchResults.results}
                          totalTokens={batchResults.totalTokens}
                          totalLatencyMs={batchResults.totalLatencyMs}
                          aggregated={batchResults.aggregated}
                        />
                      ) : (
                        <BatchQueryInput 
                          onSubmit={handleBatchSubmit}
                          isProcessing={isLoading}
                          maxQueries={10}
                        />
                      )}
                      {batchResults && !isLoading && (
                        <Button 
                          variant="outline" 
                          className="w-full mt-4"
                          onClick={() => setBatchResults(null)}
                        >
                          New Batch Query
                        </Button>
                      )}
                    </TabsContent>
                  </Tabs>
                </div>
              </>
            )}
          </div>
        )}

        {!isOpen && (
          <Tooltip>
              <TooltipTrigger asChild>
              <Button
                onClick={() => {
                  setIsOpen(true);
                  try {
                    // Trigger playback from the user's click gesture
                      greeting.playGreeting({ trigger: 'open' });
                    localStorage.setItem(GREETED_KEY, 'true');
                  } catch (e) {
                    // ignore
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    setIsOpen(true);
                    try {
                      greeting.playGreeting({ trigger: 'open' });
                      localStorage.setItem(GREETED_KEY, 'true');
                    } catch (err) {}
                  }
                }}
                size="icon"
                className="h-14 w-14 rounded-full shadow-lg hover:scale-110 transition-transform bg-black text-white hover:bg-zinc-900"
                aria-label="Open BiTB Assistant"
              >
                <Brain className="h-6 w-6" />
                {previewMode && (
                  <span className="absolute -top-1 -right-1 flex h-5 w-5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-5 w-5 bg-white items-center justify-center text-black text-xs font-bold">
                      !
                    </span>
                  </span>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent className="bg-black text-white border-zinc-800">
              Chat with {config.assistantName}
              {previewMode && " (Preview Mode)"}
            </TooltipContent>
          </Tooltip>
        )}

        {/* Footer greeting controls removed — header now contains mute and replay controls */}
      </div>

      <style jsx global>{`
        @keyframes slideIn {
          from {
            transform: translateY(12px) scaleY(0.98);
            opacity: 0;
          }
          to {
            transform: translateY(0) scaleY(1);
            opacity: 1;
          }
        }

        @keyframes messageSlideIn {
          from {
            transform: translateY(8px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }

        @keyframes scrollHintPulse {
          0%, 100% {
            opacity: 0.92;
          }
          50% {
            opacity: 1;
          }
        }

        .animate-scroll-hint {
          animation: scrollHintPulse 2.4s ease-in-out infinite;
        }

        /* Custom scrollbar for chat area */
        .custom-scrollbar [data-radix-scroll-area-viewport] {
          scrollbar-width: thin;
          scrollbar-color: rgba(255, 255, 255, 0.3) transparent;
        }

        .custom-scrollbar [data-radix-scroll-area-viewport]::-webkit-scrollbar {
          width: 6px;
          display: block;
        }

        .custom-scrollbar [data-radix-scroll-area-viewport]::-webkit-scrollbar-track {
          background: transparent;
          border-radius: 10px;
        }

        .custom-scrollbar [data-radix-scroll-area-viewport]::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.3);
          border-radius: 10px;
          transition: background 0.2s ease;
        }

        .custom-scrollbar [data-radix-scroll-area-viewport]::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.5);
        }

        .custom-scrollbar [data-radix-scroll-area-viewport]::-webkit-scrollbar-thumb:active {
          background: rgba(255, 255, 255, 0.6);
        }

        /* Hide scrollbar when not hovering on mobile */
        @media (max-width: 640px) {
          .custom-scrollbar [data-radix-scroll-area-viewport]::-webkit-scrollbar {
            width: 4px;
          }
        }

        /* Smooth scroll behavior */
        .custom-scrollbar [data-radix-scroll-area-viewport] {
          scroll-behavior: smooth;
        }

        /* Voice greeting footer removed — header controls in use */
        /* Replay button loading animation */
        @keyframes replaySpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .replay-loading svg {
          animation: replaySpin 1s linear infinite;
          transform-origin: center;
        }

        /* Speaking indicator (three bars) */
        .speaking-bars {
          display: inline-flex;
          gap: 4px;
          align-items: flex-end;
          margin-left: 6px;
        }

        .speaking-bars .bar {
          width: 3px;
          background: #10b981; /* emerald-500 */
          border-radius: 2px;
          height: 6px;
          opacity: 0.8;
          animation: wave 900ms ease-in-out infinite;
        }

        .speaking-bars .bar:nth-child(1) { animation-delay: 0ms; }
        .speaking-bars .bar:nth-child(2) { animation-delay: 120ms; }
        .speaking-bars .bar:nth-child(3) { animation-delay: 240ms; }

        @keyframes wave {
          0%, 100% { height: 4px; opacity: 0.6; }
          50% { height: 12px; opacity: 1; }
        }

        /* sr-only utility */
        .sr-only {
          position: absolute !important;
          width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
        }
      `}</style>
    </TooltipProvider>
  );
};
