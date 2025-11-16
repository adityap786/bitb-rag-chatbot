export interface ChatMessage {
  id: string;
  content: string;
  role: "user" | "assistant" | "system";
  timestamp: Date;
  language?: "en" | "hi" | "hinglish";
  suggested_replies?: string[];
  sources?: Array<{ url: string; title?: string }>;
}

export interface ChatbotConfig {
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
  
  // Data Sources
  indexedUrls: string[];
  uploadedDocuments: string[];
  
  // Advanced
  maxTokens?: number;
  temperature?: number;
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
