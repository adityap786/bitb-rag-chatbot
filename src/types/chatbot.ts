export interface ChatMessage {
  id: string;
  content: string;
  role: "user" | "assistant" | "system";
  timestamp: Date | string;
  language?: "en" | "hi" | "hinglish";
  suggested_replies?: string[];
  sources?: Array<{ url: string; title?: string }>;
  error?: string | null;
  characterLimitApplied?: number | null;
  originalLength?: number | null;
  audit?: any;
  metadata?: any;
  status?: "success" | "error";
}
export interface BatchChatRequest {
  sessionId: string;
  messages: Array<{
    query: string;
    metadata?: Record<string, any>;
  }>;
}

export interface BatchChatResponse {
  batch: Array<{
    reply: string;
    sources: Array<{ text: string; similarity: number }>;
    tokens_used: number;
    latency_ms: number;
    error?: string | null;
    characterLimitApplied?: number | null;
    originalLength?: number | null;
    audit?: any;
    query: string;
    metadata?: Record<string, any>;
    sessionId: string;
    status: "success" | "error";
    timestamp: string;
  }>;
  aggregated: boolean;
  totalTokens: number;
  totalLatency: number;
  audits: any[];
  summary: {
    batchSize: number;
    totalTokens: number;
    totalLatency: number;
    characterLimits: Array<number | null>;
    originalLengths: Array<number | null>;
    errors: Array<any>;
  };
}

export interface ChatbotConfig {
  // ...existing code...
  // Branding
  logo?: string;
  assistantName: string;
  brandColor: string;
  fontFamily: string;
  theme: "light" | "dark" | "auto";
  
  // Tone & Behavior
  tone: "professional" | "friendly" | "casual" | "formal";
  fallbackMessage: string;
  language: "en" | "hi" | "hinglish" | "auto";
  
  // Layout
  position: "bottom-right" | "bottom-left" | "top-right" | "top-left";
  layout: "compact" | "standard" | "expanded";
  
  // Features
  enableSuggestedReplies: boolean;
  enableHumanHandover: boolean;
  enableSiteSearch: boolean;
  enableFeedback: boolean;
  enableTranscriptExport: boolean;
  enableBooking?: boolean; // New feature flag
  
  // Data Sources
  indexedUrls?: string[];
  uploadedDocuments?: string[];
  
  // Vertical/Industry
  industry?: "healthcare" | "legal" | "financial" | "real_estate" | "ecommerce" | "general";
}

export interface ChatSession {
  id: string;
  messages: ChatMessage[];
  startedAt: Date;
  lastActivity: Date;
  userDemographics?: {
    country?: string;
    browser?: string;
    device?: string;
  };
  rating?: number;
  feedback?: string;
}

export interface AnalyticsData {
  totalChats: number;
  totalMessages: number;
  avgRating: number;
  topTopics: Array<{ topic: string; count: number }>;
  coverageGaps: string[];
  userDemographics: {
    countries: Record<string, number>;
    devices: Record<string, number>;
  };
}
