// Mark this module as server-only in Next.js when available. Some environments
// (local linting/IDE) may not resolve the virtual `server-only` module, which
// triggers an import/no-unresolved ESLint error. Suppress that rule for this
// import so the file can still be treated as server-only in Next.js runtimes.
/* eslint-disable-next-line import/no-unresolved */
import "server-only";

export type ConversationVolumePoint = {
  label: string;
  chat: number;
  voice: number;
};

export type ResponseLatencyPoint = {
  label: string;
  median: number;
  p95: number;
};

export type AdminAnalytics = {
  conversationVolume: {
    points: ConversationVolumePoint[];
    totalInteractions: number;
    weekOverWeekDelta: number;
  };
  responseLatency: {
    points: ResponseLatencyPoint[];
    changePercent: number;
    currentMedianMs: number;
    currentP95Ms: number;
  };
};

const fallbackConversationPoints: ConversationVolumePoint[] = [
  { label: "Mon", chat: 182, voice: 42 },
  { label: "Tue", chat: 194, voice: 47 },
  { label: "Wed", chat: 205, voice: 51 },
  { label: "Thu", chat: 216, voice: 56 },
  { label: "Fri", chat: 224, voice: 58 },
  { label: "Sat", chat: 189, voice: 45 },
  { label: "Sun", chat: 176, voice: 39 },
];

const fallbackLatencyPoints: ResponseLatencyPoint[] = [
  { label: "W32", median: 248, p95: 612 },
  { label: "W33", median: 236, p95: 598 },
  { label: "W34", median: 229, p95: 572 },
  { label: "W35", median: 221, p95: 561 },
  { label: "W36", median: 214, p95: 548 },
  { label: "W37", median: 208, p95: 533 },
  { label: "W38", median: 203, p95: 525 },
];

const fallbackAnalytics: AdminAnalytics = {
  conversationVolume: {
    points: fallbackConversationPoints,
    totalInteractions: fallbackConversationPoints.reduce(
      (total, point) => total + point.chat + point.voice,
      0
    ),
    weekOverWeekDelta: 0.08,
  },
  responseLatency: {
    points: fallbackLatencyPoints,
    changePercent: -0.09,
    currentMedianMs: fallbackLatencyPoints.at(-1)?.median ?? 0,
    currentP95Ms: fallbackLatencyPoints.at(-1)?.p95 ?? 0,
  },
};

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isConversationVolumePoint = (value: unknown): value is ConversationVolumePoint =>
  typeof value === "object" &&
  value !== null &&
  isFiniteNumber((value as ConversationVolumePoint).chat) &&
  isFiniteNumber((value as ConversationVolumePoint).voice) &&
  typeof (value as ConversationVolumePoint).label === "string";

const isResponseLatencyPoint = (value: unknown): value is ResponseLatencyPoint =>
  typeof value === "object" &&
  value !== null &&
  isFiniteNumber((value as ResponseLatencyPoint).median) &&
  isFiniteNumber((value as ResponseLatencyPoint).p95) &&
  typeof (value as ResponseLatencyPoint).label === "string";

const isAdminAnalytics = (value: unknown): value is AdminAnalytics => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const analytics = value as Record<string, unknown>;
  const conversation = analytics.conversationVolume as Record<string, unknown> | undefined;
  const latency = analytics.responseLatency as Record<string, unknown> | undefined;

  if (!conversation || typeof conversation !== "object") {
    return false;
  }

  if (!latency || typeof latency !== "object") {
    return false;
  }

  const conversationPoints = conversation.points;
  const latencyPoints = latency.points;

  return (
    Array.isArray(conversationPoints) &&
    conversationPoints.every(isConversationVolumePoint) &&
    isFiniteNumber(conversation.totalInteractions) &&
    isFiniteNumber(conversation.weekOverWeekDelta) &&
    Array.isArray(latencyPoints) &&
    latencyPoints.every(isResponseLatencyPoint) &&
    isFiniteNumber(latency.changePercent) &&
    isFiniteNumber(latency.currentMedianMs) &&
    isFiniteNumber(latency.currentP95Ms)
  );
};

const normalizeBaseUrl = (value: string) => value.replace(/\/$/, "");

async function fetchRemoteAnalytics(baseUrl: string): Promise<AdminAnalytics | null> {
  const endpoint = `${normalizeBaseUrl(baseUrl)}/admin/analytics`;
  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  const token = process.env.BITB_ANALYTICS_SERVICE_TOKEN;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(endpoint, {
    cache: "no-store",
    headers,
    next: { revalidate: 0 },
  });

  if (!response.ok) {
    throw new Error(`Analytics service responded with ${response.status}`);
  }

  const body = await response.json();

  if (!isAdminAnalytics(body)) {
    throw new Error("Analytics payload did not match expected shape");
  }

  return body;
}

export async function getAdminAnalytics(): Promise<AdminAnalytics> {
  const endpoint = process.env.BITB_ANALYTICS_SERVICE_URL;

  if (!endpoint) {
    return fallbackAnalytics;
  }

  try {
    const analytics = await fetchRemoteAnalytics(endpoint);
    if (analytics) {
      return analytics;
    }
  } catch (error) {
    console.error("[admin-analytics] Falling back to stub data", error);
  }

  return fallbackAnalytics;
}

export { fallbackAnalytics as FALLBACK_ADMIN_ANALYTICS };
