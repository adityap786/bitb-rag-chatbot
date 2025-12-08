# Visual AI Chatbot - Production Implementation Plan

## 🎯 Project Scope
Build a next-generation visual AI chatbot combining embedded rich previews and visual answer synthesis for e-commerce and service-based businesses.

---

## 📋 Phase 1: Architecture & Foundation (Weeks 1-2)

### 1.1 Multi-Tenant Architecture
**Priority: Critical**

#### Database Schema
```sql
-- Tenants table
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  domain TEXT UNIQUE NOT NULL,
  branding JSONB DEFAULT '{}',
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Conversations table
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT,
  session_id TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Messages table
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  visual_data JSONB,
  citations JSONB DEFAULT '[]',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Knowledge base chunks
CREATE TABLE kb_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  embedding VECTOR(1536),
  metadata JSONB NOT NULL,
  source_url TEXT,
  source_type TEXT,
  published_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Row-level security
ALTER TABLE kb_chunks ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON kb_chunks
  FOR ALL USING (tenant_id = current_setting('app.tenant_id')::UUID);
```

#### WebSocket Infrastructure
```typescript
// src/lib/websocket/socket-server.ts
import { Server } from 'socket.io';
import { verifyJWT } from '@/lib/security/jwt';

export class ChatWebSocketServer {
  private io: Server;

  constructor(httpServer: any) {
    this.io = new Server(httpServer, {
      cors: { origin: '*', credentials: true },
      transports: ['websocket', 'polling'],
    });

    this.io.use(async (socket, next) => {
      const token = socket.handshake.auth.token;
      const tenantId = socket.handshake.query.tenantId;
      
      try {
        const payload = await verifyJWT(token);
        socket.data.tenantId = tenantId;
        socket.data.userId = payload.userId;
        next();
      } catch (err) {
        next(new Error('Authentication failed'));
      }
    });

    this.setupHandlers();
  }

  private setupHandlers() {
    this.io.on('connection', (socket) => {
      const tenantId = socket.data.tenantId;
      socket.join(`tenant:${tenantId}`);

      socket.on('chat:message', async (data) => {
        await this.handleChatMessage(socket, data);
      });

      socket.on('chat:interrupt', async (data) => {
        await this.handleInterruption(socket, data);
      });

      socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
      });
    });
  }

  private async handleChatMessage(socket: any, data: any) {
    const { conversationId, message } = data;
    const tenantId = socket.data.tenantId;

    // Stream response
    const stream = await this.generateResponse(tenantId, conversationId, message);
    
    for await (const chunk of stream) {
      socket.emit('chat:stream', chunk);
    }

    socket.emit('chat:done', { conversationId });
  }

  private async handleInterruption(socket: any, data: any) {
    // Intelligent interruption handling
    const { conversationId, type } = data;
    // Pause current generation, save state, acknowledge
    socket.emit('chat:interrupted', { conversationId, acknowledged: true });
  }
}
```

### 1.2 Citation Tracking System
```typescript
// src/lib/citations/citation-tracker.ts
export interface Citation {
  id: string;
  source_url: string;
  title: string;
  snippet: string;
  confidence: number;
  relevance_score: number;
  preview_image?: string;
  content_type: 'documentation' | 'product' | 'blog' | 'faq';
  published_date?: string;
  tenant_specific: boolean;
  metadata: Record<string, any>;
}

export class CitationTracker {
  async trackCitation(
    messageId: string,
    citation: Citation
  ): Promise<void> {
    await supabase.from('message_citations').insert({
      message_id: messageId,
      citation_data: citation,
      clicked: false,
      expanded: false,
    });
  }

  async generateCitationCard(citation: Citation): Promise<any> {
    const previewData = await this.fetchPreviewData(citation.source_url);
    
    return {
      ...citation,
      preview: {
        thumbnail: previewData.og_image || previewData.favicon,
        description: previewData.og_description,
        site_name: previewData.og_site_name,
      },
    };
  }

  private async fetchPreviewData(url: string): Promise<any> {
    // Cache preview data for 24h
    const cached = await redis.get(`preview:${url}`);
    if (cached) return JSON.parse(cached);

    const response = await fetch(url);
    const html = await response.text();
    const previewData = this.extractOpenGraphTags(html);

    await redis.set(`preview:${url}`, JSON.stringify(previewData), 'EX', 86400);
    return previewData;
  }
}
```

---

## 📋 Phase 2: Industry-Specific Domain Logic (Weeks 3-4)

### 2.1 Vertical AI Modules
```typescript
// src/lib/domain/vertical-engines.ts
export interface DomainEngine {
  vertical: 'healthcare' | 'legal' | 'financial' | 'support';
  applyLogic(query: string, context: any): Promise<any>;
  validateCompliance(response: string): Promise<boolean>;
}

export class HealthcareDomainEngine implements DomainEngine {
  vertical = 'healthcare' as const;

  async applyLogic(query: string, context: any) {
    // HIPAA compliance checks
    const hasPII = await this.detectPHI(query);
    if (hasPII) {
      return {
        requiresConsent: true,
        maskedQuery: await this.maskPHI(query),
      };
    }

    // Medical terminology understanding
    const medicalEntities = await this.extractMedicalEntities(query);
    
    // Clinical decision support
    if (this.isClinicalQuery(query)) {
      return await this.getClinicalGuidance(query, medicalEntities);
    }

    return { processedQuery: query, entities: medicalEntities };
  }

  async validateCompliance(response: string): Promise<boolean> {
    // Ensure no medical advice given without disclaimers
    const containsMedicalAdvice = await this.detectMedicalAdvice(response);
    if (containsMedicalAdvice) {
      const hasDisclaimer = response.includes('consult a healthcare professional');
      return hasDisclaimer;
    }
    return true;
  }

  private async detectPHI(text: string): Promise<boolean> {
    // Pattern matching for SSN, MRN, DOB, etc.
    const phiPatterns = [
      /\b\d{3}-\d{2}-\d{4}\b/, // SSN
      /\b\d{2}\/\d{2}\/\d{4}\b/, // DOB
      // Add more patterns
    ];
    return phiPatterns.some(pattern => pattern.test(text));
  }
}

export class LegalDomainEngine implements DomainEngine {
  vertical = 'legal' as const;

  async applyLogic(query: string, context: any) {
    // Jurisdiction awareness
    const jurisdiction = context.location || 'US';
    
    // Legal term disambiguation
    const legalConcepts = await this.extractLegalConcepts(query);
    
    // Case law references
    if (this.requiresCaseLaw(query)) {
      return await this.fetchRelevantCaseLaw(query, jurisdiction);
    }

    return { jurisdiction, concepts: legalConcepts };
  }

  async validateCompliance(response: string): Promise<boolean> {
    // Ensure "not legal advice" disclaimer
    const providesLegalInfo = await this.detectLegalAdvice(response);
    if (providesLegalInfo) {
      return response.includes('This is not legal advice');
    }
    return true;
  }
}

export class FinancialDomainEngine implements DomainEngine {
  vertical = 'financial' as const;

  async applyLogic(query: string, context: any) {
    // SEC compliance for investment advice
    const containsInvestmentAdvice = await this.detectInvestmentAdvice(query);
    
    // PCI-DSS compliance for payment data
    const hasPCI = await this.detectPaymentData(query);
    if (hasPCI) {
      return { error: 'Cannot process payment card data in chat' };
    }

    // Financial calculations
    if (this.isFinancialCalculation(query)) {
      return await this.performFinancialCalculation(query);
    }

    return { processedQuery: query };
  }

  async validateCompliance(response: string): Promise<boolean> {
    // Ensure financial disclaimers
    const providesFinancialAdvice = await this.detectFinancialAdvice(response);
    if (providesFinancialAdvice) {
      return response.includes('not financial advice') && 
             response.includes('consult a financial advisor');
    }
    return true;
  }
}
```

### 2.2 Domain Router
```typescript
// src/lib/domain/domain-router.ts
export class DomainRouter {
  private engines: Map<string, DomainEngine> = new Map();

  constructor() {
    this.engines.set('healthcare', new HealthcareDomainEngine());
    this.engines.set('legal', new LegalDomainEngine());
    this.engines.set('financial', new FinancialDomainEngine());
  }

  async route(tenantId: string, query: string, context: any): Promise<any> {
    const tenant = await this.getTenant(tenantId);
    const vertical = tenant.settings.vertical;

    const engine = this.engines.get(vertical);
    if (!engine) {
      return { processedQuery: query }; // Default passthrough
    }

    const result = await engine.applyLogic(query, context);
    return result;
  }

  async validateResponse(
    tenantId: string,
    response: string
  ): Promise<{ valid: boolean; modifiedResponse?: string }> {
    const tenant = await this.getTenant(tenantId);
    const vertical = tenant.settings.vertical;

    const engine = this.engines.get(vertical);
    if (!engine) return { valid: true };

    const isCompliant = await engine.validateCompliance(response);
    
    if (!isCompliant) {
      // Inject compliance disclaimers
      const disclaimer = this.getDisclaimerForVertical(vertical);
      return {
        valid: true,
        modifiedResponse: `${response}\n\n${disclaimer}`,
      };
    }

    return { valid: true };
  }
}
```

---

## 📋 Phase 3: Real-Time Learning & Self-Improvement (Weeks 5-6)

### 3.1 Continuous Learning Loop
```typescript
// src/lib/learning/continuous-learning.ts
export class ContinuousLearningEngine {
  async captureInteraction(interaction: {
    conversationId: string;
    query: string;
    response: string;
    userFeedback?: 'positive' | 'negative';
    clickedCitations: string[];
    expandedSections: string[];
    timeToAnswer: number;
  }) {
    // Store interaction for learning
    await supabase.from('learning_interactions').insert({
      ...interaction,
      analyzed: false,
    });

    // Immediate feedback loop
    if (interaction.userFeedback === 'negative') {
      await this.triggerImmediateImprovement(interaction);
    }
  }

  private async triggerImmediateImprovement(interaction: any) {
    // Analyze failure patterns
    const similarFailures = await this.findSimilarFailures(interaction.query);
    
    if (similarFailures.length > 3) {
      // Auto-generate training example
      await this.generateTrainingExample(interaction);
      
      // Update KB with better content
      await this.suggestKBImprovements(interaction);
    }
  }

  async analyzeConversationQuality(conversationId: string): Promise<number> {
    const messages = await this.getConversationMessages(conversationId);
    
    const metrics = {
      avgResponseTime: this.calculateAvgResponseTime(messages),
      citationAccuracy: await this.calculateCitationAccuracy(messages),
      userSatisfaction: await this.getUserSatisfaction(conversationId),
      completionRate: await this.getCompletionRate(conversationId),
    };

    // Weighted quality score
    const qualityScore = (
      metrics.userSatisfaction * 0.4 +
      metrics.citationAccuracy * 0.3 +
      (1 - metrics.avgResponseTime / 10) * 0.2 +
      metrics.completionRate * 0.1
    );

    return qualityScore;
  }
}
```

### 3.2 A/B Testing Engine
```typescript
// src/lib/learning/ab-testing.ts
export class ABTestingEngine {
  async createExperiment(config: {
    name: string;
    variants: Array<{
      id: string;
      responseStrategy: string;
      visualConfig: any;
    }>;
    trafficSplit: number[];
    metrics: string[];
  }) {
    return await supabase.from('ab_experiments').insert({
      name: config.name,
      variants: config.variants,
      traffic_split: config.trafficSplit,
      metrics: config.metrics,
      status: 'active',
      started_at: new Date(),
    });
  }

  async assignVariant(tenantId: string, userId: string): Promise<string> {
    const activeExperiments = await this.getActiveExperiments(tenantId);
    
    for (const experiment of activeExperiments) {
      const assignment = await this.getOrCreateAssignment(
        experiment.id,
        userId
      );
      return assignment.variant_id;
    }

    return 'control';
  }

  async trackMetric(
    experimentId: string,
    variantId: string,
    metric: string,
    value: number
  ) {
    await supabase.from('ab_metrics').insert({
      experiment_id: experimentId,
      variant_id: variantId,
      metric_name: metric,
      metric_value: value,
      recorded_at: new Date(),
    });
  }

  async analyzeResults(experimentId: string) {
    const metrics = await this.getExperimentMetrics(experimentId);
    
    // Statistical significance testing
    const analysis = {
      winner: null as string | null,
      confidence: 0,
      improvements: {} as Record<string, number>,
    };

    // Compare variants
    const variants = Object.keys(metrics);
    for (let i = 0; i < variants.length; i++) {
      for (let j = i + 1; j < variants.length; j++) {
        const significance = this.tTest(
          metrics[variants[i]],
          metrics[variants[j]]
        );
        
        if (significance.pValue < 0.05) {
          analysis.winner = significance.better;
          analysis.confidence = 1 - significance.pValue;
        }
      }
    }

    return analysis;
  }
}
```

### 3.3 Performance Analytics Dashboard
```typescript
// src/lib/monitoring/analytics-dashboard.ts
export class AnalyticsDashboard {
  async getRealtimeMetrics(tenantId: string) {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 3600000);

    const [
      totalQueries,
      avgResponseTime,
      satisfactionRate,
      topQueries,
      failureRate,
    ] = await Promise.all([
      this.getTotalQueries(tenantId, oneHourAgo),
      this.getAvgResponseTime(tenantId, oneHourAgo),
      this.getSatisfactionRate(tenantId, oneHourAgo),
      this.getTopQueries(tenantId, oneHourAgo, 10),
      this.getFailureRate(tenantId, oneHourAgo),
    ]);

    return {
      totalQueries,
      avgResponseTime,
      satisfactionRate,
      topQueries,
      failureRate,
      timestamp: now,
    };
  }

  async detectAnomalies(tenantId: string) {
    const metrics = await this.getRealtimeMetrics(tenantId);
    const historical = await this.getHistoricalBaseline(tenantId);

    const anomalies = [];

    // Response time spike
    if (metrics.avgResponseTime > historical.avgResponseTime * 1.5) {
      anomalies.push({
        type: 'response_time_spike',
        severity: 'high',
        current: metrics.avgResponseTime,
        baseline: historical.avgResponseTime,
      });
    }

    // Satisfaction drop
    if (metrics.satisfactionRate < historical.satisfactionRate * 0.8) {
      anomalies.push({
        type: 'satisfaction_drop',
        severity: 'critical',
        current: metrics.satisfactionRate,
        baseline: historical.satisfactionRate,
      });
    }

    return anomalies;
  }
}
```

---

*[Continue with remaining phases in separate files due to length...]*
