# Production Implementation Guide
## Multi-Tenant RAG + MCP + LLM Chatbot SaaS Platform

**Version:** 1.0.0  
**Last Updated:** November 25, 2025  
**Status:** Active Development

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Architecture Overview](#architecture-overview)
3. [Implementation Phases](#implementation-phases)
4. [Phase 1: Core RAG Pipeline](#phase-1-core-rag-pipeline)
5. [Phase 2: Advanced Retrieval](#phase-2-advanced-retrieval)
6. [Phase 3: Orchestration & Memory](#phase-3-orchestration--memory)
7. [Phase 4: Multi-Agent System](#phase-4-multi-agent-system)
8. [Phase 5: Production Hardening](#phase-5-production-hardening)
9. [Code Quality Standards](#code-quality-standards)
10. [Testing Requirements](#testing-requirements)
11. [Deployment Checklist](#deployment-checklist)

---

## Executive Summary

### Project Completion Status: ~60%

| Component | Status | Priority |
|-----------|--------|----------|
| Core RAG Pipeline | 70% | P0 |
| Advanced Retrieval | 40% | P0 |
| Tenant Isolation | 85% | P0 |
| Admin Authentication | 30% | P0 |
| MCP Server | 50% | P1 |
| Multi-Agent System | 10% | P1 |
| Conversation Memory | 20% | P1 |
| Observability | 40% | P1 |
| UI Components | 75% | P2 |
| Testing Coverage | 45% | P1 |

### Estimated Remaining Work: 280-360 hours

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │
│  │ ChatWidget  │  │ Trial Page  │  │ Admin Panel │                 │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                 │
└─────────┼────────────────┼────────────────┼─────────────────────────┘
          │                │                │
┌─────────▼────────────────▼────────────────▼─────────────────────────┐
│                         API LAYER                                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │
│  │ REST APIs   │  │ WebSocket   │  │ MCP Server  │                 │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                 │
└─────────┼────────────────┼────────────────┼─────────────────────────┘
          │                │                │
┌─────────▼────────────────▼────────────────▼─────────────────────────┐
│                      ORCHESTRATION LAYER                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │
│  │ Workflow    │  │ Intent      │  │ Agent       │                 │
│  │ Engine      │  │ Router      │  │ Supervisor  │                 │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                 │
└─────────┼────────────────┼────────────────┼─────────────────────────┘
          │                │                │
┌─────────▼────────────────▼────────────────▼─────────────────────────┐
│                         RAG LAYER                                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │
│  │ Chunking    │  │ Hybrid      │  │ Reranking   │                 │
│  │ Pipeline    │  │ Search      │  │ Pipeline    │                 │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                 │
└─────────┼────────────────┼────────────────┼─────────────────────────┘
          │                │                │
┌─────────▼────────────────▼────────────────▼─────────────────────────┐
│                        DATA LAYER                                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │
│  │ Supabase    │  │ Redis       │  │ LLM APIs    │                 │
│  │ (Vector DB) │  │ (Cache)     │  │ (OpenAI)    │                 │
│  └─────────────┘  └─────────────┘  └─────────────┘                 │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Phases

### Timeline Overview

```
Week 1-2: Phase 1 (Core RAG Pipeline)
Week 2-3: Phase 2 (Advanced Retrieval)
Week 3-4: Phase 3 (Orchestration & Memory)
Week 4-5: Phase 4 (Multi-Agent System)
Week 5-6: Phase 5 (Production Hardening)
```

---

## Phase 1: Core RAG Pipeline

### 1.1 Semantic Chunking ✅ COMPLETED

**File:** `src/lib/rag/llamaindex-semantic-chunking.ts`

**Status:** Production-ready implementation completed.

**Features Implemented:**
- Embedding-based semantic boundary detection
- Configurable buffer size for context smoothing
- Percentile-based adaptive breakpoint detection
- Chunk size constraints with intelligent splitting
- Rich metadata including semantic coherence scores
- Fallback to size-based chunking on failure
- Batch embedding support for performance

**Usage:**
```typescript
import { SemanticSplitterNodeParser } from './llamaindex-semantic-chunking';

const chunker = new SemanticSplitterNodeParser({
  chunkSize: 1024,
  minChunkSize: 100,
  bufferSize: 1,
  breakpointPercentileThreshold: 95,
});

const chunks = await chunker.split({
  content: 'Your document text here...',
  metadata: { source: 'document.pdf' },
});
```

---

### 1.2 Metadata Extractors 🔴 NOT STARTED

**Files to Create:**
- `src/lib/rag/metadata-extractors/keyword-extractor.ts`
- `src/lib/rag/metadata-extractors/summary-extractor.ts`
- `src/lib/rag/metadata-extractors/questions-extractor.ts`
- `src/lib/rag/metadata-extractors/entity-extractor.ts`
- `src/lib/rag/metadata-extractors/index.ts`

**Implementation Guide:**

#### 1.2.1 Keyword Extractor

```typescript
/**
 * KeywordExtractor - Extract keywords from document chunks
 * 
 * Production Requirements:
 * 1. Use TF-IDF or RAKE algorithm for keyword extraction
 * 2. Support configurable max_keywords (default: 5)
 * 3. Filter stopwords for multiple languages
 * 4. Return relevance scores for each keyword
 * 5. Handle edge cases (empty text, non-text content)
 * 
 * Performance Target: < 50ms per chunk
 */

export interface KeywordExtractorOptions {
  maxKeywords?: number;
  minWordLength?: number;
  language?: string;
  includeScores?: boolean;
}

export interface ExtractedKeyword {
  keyword: string;
  score: number;
  frequency: number;
}

export class KeywordExtractor {
  constructor(options?: KeywordExtractorOptions);
  
  async extract(text: string): Promise<ExtractedKeyword[]>;
  async extractBatch(texts: string[]): Promise<ExtractedKeyword[][]>;
}
```

**Algorithm:**
1. Tokenize text into words
2. Remove stopwords and punctuation
3. Calculate TF-IDF scores
4. Optionally use RAKE for phrase extraction
5. Return top N keywords with scores

#### 1.2.2 Summary Extractor

```typescript
/**
 * SummaryExtractor - Generate concise summaries for chunks
 * 
 * Production Requirements:
 * 1. Use LLM (gpt-4o-mini) for cost efficiency
 * 2. Batch process chunks (10 at a time)
 * 3. Implement retry logic with exponential backoff
 * 4. Cache summaries to avoid re-computation
 * 5. Handle rate limiting gracefully
 * 
 * Performance Target: < 2s per batch of 10
 */

export interface SummaryExtractorOptions {
  model?: string;
  maxSummaryLength?: number;
  batchSize?: number;
  cacheEnabled?: boolean;
}

export class SummaryExtractor {
  constructor(options?: SummaryExtractorOptions);
  
  async summarize(text: string): Promise<string>;
  async summarizeBatch(texts: string[]): Promise<string[]>;
}
```

**Prompt Template:**
```
Summarize the following text in 1-2 sentences, capturing the main idea:

Text: {chunk_text}

Summary:
```

#### 1.2.3 Questions Extractor

```typescript
/**
 * QuestionsAnsweredExtractor - Generate questions each chunk answers
 * 
 * Production Requirements:
 * 1. Generate 3-5 questions per chunk
 * 2. Questions should be specific and answerable
 * 3. Use for query matching optimization
 * 4. Store in metadata.questions array
 * 
 * Performance Target: < 2s per batch of 10
 */

export interface QuestionsExtractorOptions {
  model?: string;
  questionsPerChunk?: number;
  batchSize?: number;
}

export class QuestionsAnsweredExtractor {
  constructor(options?: QuestionsExtractorOptions);
  
  async extract(text: string): Promise<string[]>;
  async extractBatch(texts: string[]): Promise<string[][]>;
}
```

#### 1.2.4 Entity Extractor

```typescript
/**
 * EntityExtractor - Extract named entities from chunks
 * 
 * Production Requirements:
 * 1. Extract: products, features, people, dates, locations, organizations
 * 2. Use NER model or LLM-based extraction
 * 3. Normalize entity names (e.g., "John Smith" = "john_smith")
 * 4. Support entity-based filtering for retrieval
 * 
 * Performance Target: < 100ms per chunk
 */

export type EntityType = 
  | 'person'
  | 'organization'
  | 'location'
  | 'date'
  | 'product'
  | 'feature'
  | 'money'
  | 'other';

export interface ExtractedEntity {
  text: string;
  type: EntityType;
  normalizedText: string;
  confidence: number;
  startIndex: number;
  endIndex: number;
}

export class EntityExtractor {
  constructor(options?: EntityExtractorOptions);
  
  async extract(text: string): Promise<ExtractedEntity[]>;
  async extractBatch(texts: string[]): Promise<ExtractedEntity[][]>;
}
```

---

### 1.3 Hierarchical Chunking 🟡 PARTIAL

**File:** `src/lib/rag/llamaindex-hierarchical-chunking.ts`

**Current Status:** Basic implementation exists, needs enhancement.

**Improvements Needed:**
1. Preserve parent-child relationships in metadata
2. Support nested hierarchy (document → sections → subsections → paragraphs)
3. Add cross-references between related chunks
4. Implement chunk linking for context retrieval

**Enhanced Implementation:**

```typescript
export interface HierarchicalChunk {
  content: string;
  metadata: Record<string, any>;
  hierarchy: {
    level: number;
    path: string[];
    parentId: string | null;
    childIds: string[];
  };
  relationships: {
    siblings: string[];
    references: string[];
  };
}
```

---

### 1.4 Admin Authentication 🔴 NOT STARTED

**Files to Create/Modify:**
- `src/lib/trial/auth.ts` (modify)
- `src/lib/auth/admin-jwt.ts` (create)
- `src/middleware/admin-auth.ts` (create)

**Implementation Guide:**

```typescript
/**
 * Admin JWT Authentication System
 * 
 * Production Requirements:
 * 1. JWT tokens with short expiry (15 min access, 7 day refresh)
 * 2. Role-based access control (RBAC)
 * 3. Token refresh mechanism
 * 4. Audit logging for all admin actions
 * 5. IP whitelisting option
 * 6. MFA support (future)
 * 
 * Security Requirements:
 * - Tokens stored in httpOnly cookies
 * - CSRF protection
 * - Rate limiting on auth endpoints
 * - Brute force protection
 */

export interface AdminUser {
  id: string;
  email: string;
  role: 'super_admin' | 'admin' | 'moderator';
  permissions: string[];
  tenantIds: string[];
  createdAt: Date;
  lastLoginAt: Date;
}

export interface AdminAuthOptions {
  jwtSecret: string;
  accessTokenExpiry?: string;
  refreshTokenExpiry?: string;
  enableMFA?: boolean;
}

export class AdminAuthService {
  constructor(options: AdminAuthOptions);
  
  async login(email: string, password: string): Promise<AuthTokens>;
  async logout(refreshToken: string): Promise<void>;
  async refreshTokens(refreshToken: string): Promise<AuthTokens>;
  async verifyToken(accessToken: string): Promise<AdminUser>;
  async hasPermission(user: AdminUser, permission: string): Promise<boolean>;
}
```

---

## Phase 2: Advanced Retrieval

### 2.1 Hybrid Search Enhancement 🟡 PARTIAL

**File:** `src/lib/rag/hybrid-search.ts`

**Current Status:** Basic implementation exists with vector + keyword fusion.

**Improvements Needed:**

```typescript
/**
 * Enhanced Hybrid Search with RRF
 * 
 * Production Requirements:
 * 1. Reciprocal Rank Fusion (RRF) for score combination
 * 2. Configurable weights for vector vs keyword
 * 3. Query expansion support
 * 4. Result deduplication
 * 5. Minimum score thresholds
 * 6. Metadata filtering
 */

export interface EnhancedHybridSearchOptions {
  vectorSearch: VectorSearchFn;
  keywordSearch: KeywordSearchFn;
  reranker?: RerankerFn;
  
  // Fusion settings
  fusionMethod: 'rrf' | 'weighted' | 'linear';
  vectorWeight?: number;
  keywordWeight?: number;
  rrfK?: number; // RRF constant (default: 60)
  
  // Result settings
  topK?: number;
  minScore?: number;
  deduplicateByContent?: boolean;
  deduplicationThreshold?: number;
}

// Reciprocal Rank Fusion implementation
function rrfScore(rank: number, k: number = 60): number {
  return 1 / (k + rank);
}

function fuseWithRRF(
  vectorResults: SearchResult[],
  keywordResults: SearchResult[],
  k: number = 60
): SearchResult[] {
  const scoreMap = new Map<string, number>();
  
  vectorResults.forEach((r, i) => {
    const id = r.id || r.content;
    scoreMap.set(id, (scoreMap.get(id) || 0) + rrfScore(i + 1, k));
  });
  
  keywordResults.forEach((r, i) => {
    const id = r.id || r.content;
    scoreMap.set(id, (scoreMap.get(id) || 0) + rrfScore(i + 1, k));
  });
  
  // Sort by combined RRF score
  return [...scoreMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, score]) => ({ id, score, ...findResult(id) }));
}
```

---

### 2.2 Reranking Pipeline 🔴 NOT STARTED

**File to Create:** `src/lib/rag/reranking-pipeline.ts`

**Implementation Guide:**

```typescript
/**
 * Reranking Pipeline
 * 
 * Production Requirements:
 * 1. Support multiple rerankers (SentenceTransformer, Cohere, custom)
 * 2. Cross-encoder scoring for query-document pairs
 * 3. Batch processing for efficiency
 * 4. Fallback chain if primary reranker fails
 * 5. Score normalization
 * 6. Caching for repeated queries
 * 
 * Performance Target: < 500ms for top-20 reranking
 */

export type RerankerType = 'sentence-transformer' | 'cohere' | 'openai' | 'custom';

export interface RerankerOptions {
  type: RerankerType;
  model?: string;
  apiKey?: string;
  batchSize?: number;
  cacheEnabled?: boolean;
  cacheTTL?: number;
}

export interface RerankResult {
  content: string;
  originalScore: number;
  rerankScore: number;
  combinedScore: number;
  metadata?: Record<string, any>;
}

export class RerankingPipeline {
  private rerankers: Reranker[];
  
  constructor(options: RerankerOptions[]);
  
  async rerank(
    query: string,
    documents: SearchResult[],
    topK?: number
  ): Promise<RerankResult[]>;
  
  async rerankWithFallback(
    query: string,
    documents: SearchResult[],
    topK?: number
  ): Promise<RerankResult[]>;
}

// Cohere Reranker Implementation
class CohereReranker implements Reranker {
  async rerank(query: string, documents: string[]): Promise<number[]> {
    const response = await cohere.rerank({
      model: 'rerank-english-v3.0',
      query,
      documents,
      top_n: documents.length,
    });
    
    return response.results.map(r => r.relevance_score);
  }
}

// SentenceTransformer Reranker (via Python service)
class SentenceTransformerReranker implements Reranker {
  async rerank(query: string, documents: string[]): Promise<number[]> {
    const response = await axios.post(`${this.serviceUrl}/rerank`, {
      query,
      documents,
      model: 'cross-encoder/ms-marco-MiniLM-L-12-v2',
    });
    
    return response.data.scores;
  }
}
```

---

### 2.3 HyDE Query Transformation 🔴 NOT STARTED

**File to Create:** `src/lib/rag/query-transformers/hyde.ts`

**Implementation Guide:**

```typescript
/**
 * HyDE (Hypothetical Document Embeddings)
 * 
 * Algorithm:
 * 1. Given a query, generate a hypothetical document that would answer it
 * 2. Embed the hypothetical document instead of the query
 * 3. Use hypothetical embedding for vector search
 * 
 * Production Requirements:
 * 1. Use LLM to generate hypothetical documents
 * 2. Generate multiple hypotheticals for better coverage
 * 3. Cache hypotheticals for repeated queries
 * 4. Combine with original query embedding
 */

export interface HyDEOptions {
  model?: string;
  numHypotheticals?: number;
  temperature?: number;
  cacheEnabled?: boolean;
}

export class HyDETransformer {
  constructor(options?: HyDEOptions);
  
  async transform(query: string): Promise<HyDEResult>;
}

export interface HyDEResult {
  originalQuery: string;
  hypotheticalDocuments: string[];
  embeddings: number[][];
  combinedEmbedding: number[];
}

// Prompt template for generating hypothetical documents
const HYDE_PROMPT = `
Given the following question, write a short paragraph that would directly answer it.
The paragraph should be factual and informative, as if taken from a knowledge base.

Question: {query}

Answer paragraph:
`;
```

---

### 2.4 Query Decomposition 🔴 NOT STARTED

**File to Create:** `src/lib/rag/query-transformers/decomposition.ts`

```typescript
/**
 * Query Decomposition
 * 
 * Break complex queries into simpler sub-queries for better retrieval.
 * 
 * Production Requirements:
 * 1. Detect multi-part questions
 * 2. Generate independent sub-queries
 * 3. Merge results from all sub-queries
 * 4. Handle comparative and conditional queries
 */

export class QueryDecomposer {
  async decompose(query: string): Promise<DecomposedQuery>;
  async mergeResults(subResults: SearchResult[][]): Promise<SearchResult[]>;
}

export interface DecomposedQuery {
  original: string;
  isComplex: boolean;
  subQueries: SubQuery[];
  mergeStrategy: 'union' | 'intersection' | 'weighted';
}

export interface SubQuery {
  query: string;
  type: 'factual' | 'comparative' | 'temporal' | 'conditional';
  weight: number;
}
```

---

## Phase 3: Orchestration & Memory

### 3.1 Conversation Memory 🔴 NOT STARTED

**Files to Create:**
- `src/lib/memory/buffer-memory.ts`
- `src/lib/memory/summary-memory.ts`
- `src/lib/memory/entity-memory.ts`
- `src/lib/memory/index.ts`

**Implementation Guide:**

```typescript
/**
 * Conversation Memory System
 * 
 * Production Requirements:
 * 1. Multiple memory backends (Redis, Supabase, in-memory)
 * 2. Per-tenant and per-session isolation
 * 3. Configurable retention policies
 * 4. Memory compression for long conversations
 * 5. Context window management
 */

// Buffer Memory - stores last N messages
export class ConversationBufferMemory {
  constructor(options: {
    maxMessages?: number;
    backend: MemoryBackend;
    tenantId: string;
  });
  
  async addMessage(message: Message): Promise<void>;
  async getHistory(sessionId: string, limit?: number): Promise<Message[]>;
  async clear(sessionId: string): Promise<void>;
}

// Summary Memory - summarizes old messages
export class ConversationSummaryMemory {
  constructor(options: {
    llmClient: LLMClient;
    backend: MemoryBackend;
    summarizeAfter?: number;
  });
  
  async addMessage(message: Message): Promise<void>;
  async getContext(sessionId: string): Promise<MemoryContext>;
  async getSummary(sessionId: string): Promise<string>;
}

// Entity Memory - tracks entities mentioned in conversation
export class EntityMemory {
  constructor(options: {
    entityExtractor: EntityExtractor;
    backend: MemoryBackend;
  });
  
  async extractAndStore(message: Message): Promise<void>;
  async getEntities(sessionId: string): Promise<EntityMap>;
  async getEntityContext(sessionId: string, entityName: string): Promise<EntityContext>;
}

// Combined memory manager
export class ConversationMemoryManager {
  private bufferMemory: ConversationBufferMemory;
  private summaryMemory: ConversationSummaryMemory;
  private entityMemory: EntityMemory;
  
  async buildContext(sessionId: string, query: string): Promise<FullContext>;
}
```

---

### 3.2 Intent Classification & Routing 🔴 NOT STARTED

**Files to Create:**
- `src/lib/orchestration/intent-classifier.ts`
- `src/lib/orchestration/router.ts`

```typescript
/**
 * Intent Classification System
 * 
 * Production Requirements:
 * 1. Multi-label intent classification
 * 2. Confidence scores for each intent
 * 3. Fallback handling for low-confidence
 * 4. Intent hierarchy support
 * 5. Custom intent training
 */

export type IntentCategory = 
  | 'question_answering'
  | 'task_execution'
  | 'clarification'
  | 'greeting'
  | 'feedback'
  | 'escalation'
  | 'out_of_scope';

export interface ClassifiedIntent {
  primary: IntentCategory;
  secondary?: IntentCategory;
  confidence: number;
  entities: ExtractedEntity[];
  suggestedAction: string;
}

export class IntentClassifier {
  constructor(options: IntentClassifierOptions);
  
  async classify(query: string, context?: ConversationContext): Promise<ClassifiedIntent>;
  async classifyBatch(queries: string[]): Promise<ClassifiedIntent[]>;
}

// Router based on intent
export class IntentRouter {
  private handlers: Map<IntentCategory, IntentHandler>;
  
  async route(intent: ClassifiedIntent, context: RequestContext): Promise<Response>;
}
```

---

### 3.3 Workflow Engine Enhancement 🟡 PARTIAL

**File:** `src/lib/trial/workflow-engine.ts`

**Current Status:** Basic workflow execution exists, needs enhancement.

**Improvements Needed:**
1. State machine for complex workflows
2. Conditional branching
3. Parallel execution
4. Error recovery and rollback
5. Workflow persistence

```typescript
/**
 * Enhanced Workflow Engine
 * 
 * Production Requirements:
 * 1. DAG-based workflow definition
 * 2. Conditional and parallel execution
 * 3. State persistence and recovery
 * 4. Timeout handling
 * 5. Retry with exponential backoff
 */

export interface WorkflowDefinition {
  id: string;
  name: string;
  version: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  triggers: WorkflowTrigger[];
}

export interface WorkflowNode {
  id: string;
  type: 'action' | 'condition' | 'parallel' | 'wait';
  handler: string;
  config: Record<string, any>;
  timeout?: number;
  retries?: number;
}

export class WorkflowExecutor {
  async execute(workflow: WorkflowDefinition, input: any): Promise<WorkflowResult>;
  async resume(executionId: string): Promise<WorkflowResult>;
  async cancel(executionId: string): Promise<void>;
}
```

---

## Phase 4: Multi-Agent System

### 4.1 ReAct Agent 🔴 NOT STARTED

**File to Create:** `src/lib/agents/react-agent.ts`

```typescript
/**
 * ReAct Agent Implementation
 * 
 * ReAct = Reasoning + Acting
 * 
 * Production Requirements:
 * 1. Thought-Action-Observation loop
 * 2. Tool selection and execution
 * 3. Multi-step reasoning
 * 4. Self-correction on errors
 * 5. Observation parsing
 * 6. Max iterations limit
 */

export interface ReActStep {
  thought: string;
  action: {
    tool: string;
    input: Record<string, any>;
  } | null;
  observation: string | null;
}

export interface ReActAgentOptions {
  llmClient: LLMClient;
  tools: Tool[];
  maxIterations?: number;
  verbose?: boolean;
}

export class ReActAgent {
  constructor(options: ReActAgentOptions);
  
  async run(query: string, context?: AgentContext): Promise<AgentResult>;
  
  private async think(query: string, history: ReActStep[]): Promise<ReActStep>;
  private async act(action: Action): Promise<string>;
  private parseThought(response: string): { thought: string; action: Action | null };
}

// ReAct Prompt Template
const REACT_PROMPT = `
You are an AI assistant that follows the ReAct framework.

Available Tools:
{tools_description}

Format your response as:
Thought: [your reasoning about what to do]
Action: [tool_name]
Action Input: [JSON input for the tool]

OR if you have the final answer:
Thought: [your reasoning]
Final Answer: [your response to the user]

Previous steps:
{history}

Question: {query}
`;
```

---

### 4.2 Specialized Agents 🔴 NOT STARTED

**Files to Create:**
- `src/lib/agents/kb-agent.ts` - Knowledge Base Agent
- `src/lib/agents/research-agent.ts` - Research Agent
- `src/lib/agents/support-agent.ts` - Customer Support Agent
- `src/lib/agents/escalation-agent.ts` - Escalation Agent

```typescript
/**
 * Knowledge Base Agent
 * 
 * Specializes in retrieving and synthesizing information from the KB.
 */
export class KBAgent extends BaseAgent {
  constructor(options: {
    retriever: HybridSearch;
    reranker: RerankingPipeline;
    llmClient: LLMClient;
  });
  
  async answer(query: string): Promise<KBResponse>;
}

/**
 * Research Agent
 * 
 * Performs deep research by combining multiple sources.
 */
export class ResearchAgent extends BaseAgent {
  async research(topic: string): Promise<ResearchReport>;
}

/**
 * Support Agent
 * 
 * Handles customer support queries with empathy and solutions.
 */
export class SupportAgent extends BaseAgent {
  async handleTicket(ticket: SupportTicket): Promise<SupportResponse>;
}

/**
 * Escalation Agent
 * 
 * Determines when to escalate to human support.
 */
export class EscalationAgent extends BaseAgent {
  async evaluate(context: ConversationContext): Promise<EscalationDecision>;
}
```

---

### 4.3 Supervisor Agent 🔴 NOT STARTED

**File to Create:** `src/lib/agents/supervisor-agent.ts`

```typescript
/**
 * Supervisor Agent
 * 
 * Coordinates multiple specialized agents and routes tasks.
 * 
 * Production Requirements:
 * 1. Agent selection based on task type
 * 2. Multi-agent orchestration
 * 3. Result aggregation
 * 4. Conflict resolution
 * 5. Performance monitoring per agent
 */

export interface SupervisorOptions {
  agents: Map<string, BaseAgent>;
  llmClient: LLMClient;
  routingStrategy: 'llm' | 'rules' | 'hybrid';
}

export class SupervisorAgent {
  constructor(options: SupervisorOptions);
  
  async process(query: string, context: RequestContext): Promise<SupervisorResult>;
  
  private async selectAgent(query: string): Promise<string>;
  private async delegateToAgent(agentId: string, task: Task): Promise<AgentResult>;
  private async aggregateResults(results: AgentResult[]): Promise<FinalResult>;
}
```

---

### 4.4 Agent Guardrails 🔴 NOT STARTED

**Files to Create:**
- `src/lib/agents/guardrails/input-validator.ts`
- `src/lib/agents/guardrails/output-filter.ts`
- `src/lib/agents/guardrails/rate-limiter.ts`

```typescript
/**
 * Agent Guardrails
 * 
 * Production Requirements:
 * 1. Input validation (prompt injection, jailbreak detection)
 * 2. Output filtering (PII, harmful content)
 * 3. Rate limiting per user/tenant
 * 4. Cost controls
 * 5. Audit logging
 */

export class InputValidator {
  async validate(input: string): Promise<ValidationResult>;
  async detectPromptInjection(input: string): Promise<boolean>;
  async detectJailbreak(input: string): Promise<boolean>;
}

export class OutputFilter {
  async filter(output: string): Promise<FilteredOutput>;
  async detectPII(text: string): Promise<PIIMatch[]>;
  async detectHarmfulContent(text: string): Promise<HarmfulContentMatch[]>;
}

export class AgentRateLimiter {
  async checkLimit(userId: string, agentId: string): Promise<boolean>;
  async recordUsage(userId: string, agentId: string, tokens: number): Promise<void>;
}
```

---

## Phase 5: Production Hardening

### 5.1 Observability 🟡 PARTIAL

**Files to Create/Modify:**
- `src/lib/observability/opentelemetry.ts`
- `src/lib/observability/metrics.ts`
- `src/lib/observability/tracing.ts`

```typescript
/**
 * OpenTelemetry Integration
 * 
 * Production Requirements:
 * 1. Distributed tracing across all services
 * 2. Custom spans for RAG operations
 * 3. Metrics collection (latency, error rates, token usage)
 * 4. Log correlation with trace IDs
 * 5. Export to Grafana/Prometheus/Jaeger
 */

import { trace, context, SpanStatusCode } from '@opentelemetry/api';

export class RAGTracer {
  private tracer = trace.getTracer('rag-pipeline');
  
  async traceRetrieval<T>(
    name: string,
    fn: () => Promise<T>,
    attributes?: Record<string, any>
  ): Promise<T> {
    return this.tracer.startActiveSpan(name, async (span) => {
      try {
        if (attributes) {
          span.setAttributes(attributes);
        }
        const result = await fn();
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: String(error) });
        throw error;
      } finally {
        span.end();
      }
    });
  }
}

// Metrics
export class RAGMetrics {
  recordRetrievalLatency(durationMs: number, attributes: Record<string, any>): void;
  recordChunkingLatency(durationMs: number, chunkCount: number): void;
  recordLLMTokens(inputTokens: number, outputTokens: number, model: string): void;
  recordErrorRate(errorType: string): void;
}
```

---

### 5.2 Testing Infrastructure 🟡 PARTIAL

**Files to Create:**
- `tests/integration/rag-pipeline.test.ts`
- `tests/integration/tenant-isolation.test.ts`
- `tests/integration/agent-system.test.ts`
- `tests/e2e/chat-flow.test.ts`
- `tests/load/k6-scripts/`

```typescript
/**
 * Integration Test Template
 * 
 * All integration tests should:
 * 1. Use test fixtures and factories
 * 2. Clean up after themselves
 * 3. Test happy path and error cases
 * 4. Mock external services appropriately
 * 5. Run in isolation
 */

describe('RAG Pipeline Integration', () => {
  let pipeline: RetrievalPipeline;
  let testTenantId: string;
  
  beforeAll(async () => {
    testTenantId = createTestTenant();
    pipeline = createTestPipeline(testTenantId);
  });
  
  afterAll(async () => {
    await cleanupTestTenant(testTenantId);
  });
  
  it('should ingest and retrieve documents correctly', async () => {
    // Test implementation
  });
  
  it('should enforce tenant isolation', async () => {
    // Test that tenant A cannot see tenant B's documents
  });
  
  it('should handle errors gracefully', async () => {
    // Test error handling
  });
});

// Load Testing with k6
export const options = {
  stages: [
    { duration: '1m', target: 100 },  // Ramp up
    { duration: '5m', target: 100 },  // Steady state
    { duration: '1m', target: 1000 }, // Spike
    { duration: '1m', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
};
```

---

### 5.3 ChatbotWidget Refactoring 🔴 NOT STARTED

**Current:** `src/components/ChatbotWidget.tsx` (1211 lines)

**Target Structure:**
```
src/components/chatbot/
├── ChatbotWidget.tsx (orchestrator, ~100 lines)
├── ChatbotButton.tsx
├── ChatbotHeader.tsx
├── ChatbotMessages.tsx
├── ChatbotInput.tsx
├── ChatbotMessage.tsx
├── ChatbotTypingIndicator.tsx
├── hooks/
│   ├── useChat.ts
│   ├── useChatConfig.ts
│   ├── useChatScroll.ts
│   └── useChatSuggestions.ts
├── types.ts
└── index.ts
```

**Implementation Guide:**

```typescript
// useChat.ts - Main chat state management
export function useChat(options: UseChatOptions) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  
  const sendMessage = useCallback(async (content: string) => {
    // Message sending logic
  }, []);
  
  const clearHistory = useCallback(() => {
    setMessages([]);
  }, []);
  
  return {
    messages,
    isLoading,
    error,
    sendMessage,
    clearHistory,
  };
}

// useChatScroll.ts - Auto-scroll behavior
export function useChatScroll(
  messagesRef: RefObject<HTMLDivElement>,
  messages: Message[]
) {
  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [messages]);
}
```

---

## Code Quality Standards

### TypeScript Guidelines

```typescript
// ✅ DO: Use strict typing
interface User {
  id: string;
  email: string;
  role: UserRole;
}

// ❌ DON'T: Use any
const user: any = getUser();

// ✅ DO: Use discriminated unions for state
type LoadingState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: Error };

// ✅ DO: Use Result types for errors
type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };
```

### Error Handling

```typescript
// ✅ DO: Create custom error classes
export class RAGPipelineError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Record<string, any>
  ) {
    super(message);
    this.name = 'RAGPipelineError';
  }
}

// ✅ DO: Use try-catch with proper logging
try {
  await pipeline.retrieve(query);
} catch (error) {
  logger.error('Retrieval failed', {
    error: error instanceof Error ? error.message : String(error),
    query,
    tenantId,
  });
  throw new RAGPipelineError('Retrieval failed', 'RETRIEVAL_ERROR', { query });
}
```

### Logging Standards

```typescript
// ✅ DO: Use structured logging
logger.info('Document ingested', {
  tenantId,
  documentId,
  chunkCount,
  processingTimeMs,
});

// ❌ DON'T: Use console.log in production
console.log('Document ingested: ' + documentId);

// ✅ DO: Include correlation IDs
logger.info('Request processed', {
  requestId: context.requestId,
  traceId: context.traceId,
  userId: context.userId,
});
```

---

## Testing Requirements

### Coverage Targets

| Area | Minimum Coverage |
|------|------------------|
| Core RAG Pipeline | 90% |
| Authentication | 95% |
| Tenant Isolation | 95% |
| API Routes | 80% |
| UI Components | 70% |
| Utilities | 85% |

### Test Types

1. **Unit Tests**: All pure functions and classes
2. **Integration Tests**: Database, external APIs, full pipelines
3. **E2E Tests**: Critical user flows
4. **Load Tests**: Performance under stress
5. **Security Tests**: Authentication, authorization, injection

---

## Deployment Checklist

### Pre-Production

- [ ] All P0 tasks completed
- [ ] No critical security vulnerabilities
- [ ] Test coverage meets thresholds
- [ ] Load testing passed (1000 req/s target)
- [ ] Monitoring and alerting configured
- [ ] Runbooks documented
- [ ] Rollback plan tested

### Production Environment

- [ ] Environment variables validated
- [ ] Database migrations applied
- [ ] Redis cluster configured
- [ ] CDN configured for static assets
- [ ] SSL certificates valid
- [ ] CORS properly configured
- [ ] Rate limiting enabled

### Post-Deployment

- [ ] Smoke tests passing
- [ ] Metrics flowing to dashboards
- [ ] Error rates within thresholds
- [ ] Latency within SLOs
- [ ] Customer-facing features verified

---

## Quick Reference

### Priority Legend

- 🔴 **P0 - Critical**: Must be done before production
- 🟡 **P1 - High**: Should be done before production
- 🟢 **P2 - Medium**: Nice to have for production
- ⚪ **P3 - Low**: Can be done post-production

### Status Legend

- ✅ **COMPLETED**: Production-ready
- 🟡 **PARTIAL**: Needs enhancement
- 🔴 **NOT STARTED**: Needs implementation

### File Locations

| Component | Primary File |
|-----------|--------------|
| Semantic Chunking | `src/lib/rag/llamaindex-semantic-chunking.ts` |
| Hybrid Search | `src/lib/rag/hybrid-search.ts` |
| Tenant Isolation | `src/lib/rag/tenant-isolation.ts` |
| Workflow Engine | `src/lib/trial/workflow-engine.ts` |
| MCP Server | `src/lib/mcp/mcp-server.ts` |
| ChatbotWidget | `src/components/ChatbotWidget.tsx` |
| Admin Auth | `src/lib/trial/auth.ts` |

---

## Contact & Resources

- **Architecture Docs**: `docs/HYBRID_FRAMEWORK_ARCHITECTURE.md`
- **API Reference**: `docs/PHASE_1_API_REFERENCE.md`
- **Migration Plan**: `docs/LLAMAINDEX_MIGRATION_PLAN.md`
- **Security Guide**: `docs/PRODUCTION_HARDENING.md`

---

*Last updated: November 25, 2025*
