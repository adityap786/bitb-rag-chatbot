import path from "path";
import { promises as fs } from "fs";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { pipeline } from "@xenova/transformers";
import { createLlm } from "./llm-factory";

export interface RagSource {
  id: number;
  url: string;
  title: string;
  section?: string;
  score: number;
}

export interface RagAnswer {
  answer: string;
  sources: RagSource[];
  confidence: number;
}

export interface RagHistoryItem {
  role: "user" | "assistant";
  content: string;
}

interface KnowledgeRow {
  url: string;
  title: string;
  section?: string;
  content: string;
}

interface ChunkPayload {
  content: string;
  metadata: {
    url: string;
    title: string;
    section?: string;
    chunkIndex: number;
  };
}

interface StoredChunk extends ChunkPayload {
  embedding: number[];
}

type RankedChunk = {
  chunk: StoredChunk;
  score: number;
};

const MODEL_NAME = process.env.BITB_EMBEDDING_MODEL || "Xenova/all-mpnet-base-v2";
const DEFAULT_LLM_MODEL = process.env.BITB_LLM_MODEL || "gpt-4o-mini";
const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 120;

let ragClientPromise: Promise<BitbRag> | null = null;

export async function getBitbRag(): Promise<BitbRag> {
  if (!ragClientPromise) {
    ragClientPromise = buildBitbRag();
  }
  return ragClientPromise;
}

async function buildBitbRag(): Promise<BitbRag> {
  const knowledge = await loadKnowledgeBase();
  const chunks = buildChunks(knowledge);
  const embeddingService = EmbeddingService.getInstance();

  const embeddings = await embeddingService.embedBatch(chunks.map((chunk) => chunk.content));
  const storedChunks: StoredChunk[] = chunks.map((chunk, index) => ({
    ...chunk,
    embedding: embeddings[index],
  }));

  return new BitbRag(storedChunks, embeddingService);
}

async function loadKnowledgeBase(): Promise<KnowledgeRow[]> {
  const knowledgePath = path.join(process.cwd(), "data", "bitb-knowledge.json");
  const raw = await fs.readFile(knowledgePath, "utf-8");
  return JSON.parse(raw) as KnowledgeRow[];
}

function buildChunks(rows: KnowledgeRow[]): ChunkPayload[] {
  const result: ChunkPayload[] = [];

  rows.forEach((row) => {
    const segments = chunkText(row.content, CHUNK_SIZE, CHUNK_OVERLAP);
    segments.forEach((segment, index) => {
      result.push({
        content: segment,
        metadata: {
          url: row.url,
          title: row.title,
          section: row.section,
          chunkIndex: index,
        },
      });
    });
  });

  return result;
}

class EmbeddingService {
  private static instance: EmbeddingService | null = null;
  private modelPromise: Promise<any> | null = null;

  static getInstance(): EmbeddingService {
    if (!EmbeddingService.instance) {
      EmbeddingService.instance = new EmbeddingService();
    }
    return EmbeddingService.instance;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const model = await this.loadModel();
    const vectors: number[][] = [];

    for (const text of texts) {
      const output = await model(text, {
        pooling: "mean",
        normalize: true,
      });
      const tensor = Array.isArray(output)
        ? output[0]
        : output;
      const data = Array.from((tensor.data as Float32Array) || []);
      vectors.push(data);
    }

    return vectors;
  }

  private async loadModel() {
    if (!this.modelPromise) {
      this.modelPromise = pipeline("feature-extraction", MODEL_NAME, {
        quantized: true,
      });
    }
    return this.modelPromise;
  }
}

class BitbRag {
  private chunks: StoredChunk[];
  private embeddingService: EmbeddingService;
  private llmPromise: Promise<any | null>;
  private outputParser = new StringOutputParser();

  constructor(chunks: StoredChunk[], embeddingService: EmbeddingService) {
    this.chunks = chunks;
    this.embeddingService = embeddingService;
    this.llmPromise = this.createLlm();
  }

  async answer(input: { question: string; history?: RagHistoryItem[]; k?: number }): Promise<RagAnswer> {
    const { question, history = [], k = 4 } = input;
    const [queryEmbedding] = await this.embeddingService.embedBatch([question]);

    if (!queryEmbedding || !queryEmbedding.length) {
      return this.emptyAnswer();
    }

    const matches = this.search(queryEmbedding, k);
    if (!matches.length) {
      return this.emptyAnswer();
    }

    const answerText = await this.generateAnswer(question, history, matches);
    const sources = this.buildSources(matches);
    const confidence = this.estimateConfidence(matches);

    return {
      answer: answerText,
      sources,
      confidence,
    };
  }

  private search(queryEmbedding: number[], k: number): RankedChunk[] {
    const results: RankedChunk[] = this.chunks.map((chunk) => ({
      chunk,
      score: cosineSimilarity(queryEmbedding, chunk.embedding),
    }));

    return results
      .filter((item) => Number.isFinite(item.score))
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }

  private async generateAnswer(question: string, history: RagHistoryItem[], matches: RankedChunk[]): Promise<string> {
    const llm = await this.llmPromise;

    if (llm) {
      const prompt = ChatPromptTemplate.fromMessages([
        [
          "system",
          "You are Rachel, the BiTB virtual assistant. Answer using only the provided context. Keep answers concise, cite sources as [n], and mention when information is unavailable.",
        ],
        [
          "system",
          "Previous conversation:\n{history}\n---",
        ],
        [
          "human",
          "Question: {question}\n\nContext:\n{context}\n\nRespond in markdown with helpful structure.",
        ],
      ]);

      // Mask/redact PII in context before sending to LLM
      const safeContext = maskPII(formatContext(matches));
      const promptValue = await prompt.invoke({
        question,
        history: formatChatHistory(history),
        context: safeContext,
      });

      const llmResult = await llm.invoke(promptValue);
      return this.outputParser.invoke(llmResult);
    // Simple PII masking function (extend as needed)
    function maskPII(text: string): string {
      // Mask emails
      text = text.replace(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g, '[REDACTED_EMAIL]');
      // Mask phone numbers
      text = text.replace(/(\+?\d{1,3}[\s-]?)?(\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{4})/g, '[REDACTED_PHONE]');
      // Mask SSN-like patterns
      text = text.replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[REDACTED_SSN]');
      // Mask credit card numbers (basic)
      text = text.replace(/\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g, '[REDACTED_CC]');
      return text;
    }
    }

    return this.buildExtractiveAnswer(question, matches);
  }

  private buildExtractiveAnswer(question: string, matches: RankedChunk[]): string {
    const intro = `Here is what the BiTB docs say about "${question}":`;
    const bodies = matches.slice(0, 3).map(({ chunk }, index) => {
      const snippet = truncate(chunk.content, 380);
      return `**Source [${index + 1}]** ${chunk.metadata.title}: ${snippet}`;
    });

    return [intro, ...bodies, "Ask if you need another angle or more depth."].join("\n\n");
  }

  private buildSources(matches: RankedChunk[]): RagSource[] {
    return matches.map(({ chunk, score }, index) => ({
      id: index + 1,
      url: chunk.metadata.url,
      title: chunk.metadata.title,
      section: chunk.metadata.section,
      score: clampScore(score),
    }));
  }

  private estimateConfidence(matches: RankedChunk[]): number {
    const values = matches.map(({ score }) => clampScore(score));
    const average = values.reduce((sum, value) => sum + value, 0) / values.length;
    return Math.min(0.99, Math.max(0.1, average));
  }

  private async createLlm(): Promise<any | null> {
    try {
      return await createLlm();
    } catch (error) {
      console.warn("[BiTB] Failed to initialize LLM factory", error);
      return null;
    }
  }

  private emptyAnswer(): RagAnswer {
    return {
      answer: "I could not find relevant information yet. Try asking about the BiTB platform, the 3-day trial, data sources, or security policies.",
      sources: [],
      confidence: 0.1,
    };
  }
}

function chunkText(input: string, chunkSize: number, overlap: number): string[] {
  const words = input.split(/\s+/);
  const chunks: string[] = [];
  const step = Math.max(1, chunkSize - overlap);

  for (let start = 0; start < words.length; start += step) {
    const slice = words.slice(start, start + chunkSize);
    if (slice.length < 40) {
      continue;
    }
    chunks.push(slice.join(" "));
  }

  if (!chunks.length) {
    chunks.push(input);
  }

  return chunks;
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (!a.length || !b.length || a.length !== b.length) {
    return 0;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function clampScore(score: number): number {
  if (!Number.isFinite(score)) {
    return 0.1;
  }
  return Math.min(0.99, Math.max(0, score));
}

function formatContext(matches: RankedChunk[]): string {
  return matches
    .map(({ chunk }, index) => {
      const { url, title, section } = chunk.metadata;
  const contextTitle = section ? `${title} - ${section}` : title;
      return `[${index + 1}] ${contextTitle}\nURL: ${url}\n${truncate(chunk.content, 780)}`;
    })
    .join("\n\n");
}

function formatChatHistory(history: RagHistoryItem[]): string {
  if (!history.length) {
    return "(no prior messages)";
  }
  return history
    .map((item) => `${item.role.toUpperCase()}: ${item.content}`)
    .join("\n");
}

function truncate(text: string, limit: number): string {
  if (text.length <= limit) {
    return text;
  }
  return `${text.slice(0, limit - 3).trim()}...`;
}
