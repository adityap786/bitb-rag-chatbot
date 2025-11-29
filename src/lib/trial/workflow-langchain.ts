/**
 * LLM Integration for Workflow Engine (Dual Backend: LangChain + LlamaIndex)
 * Phase 2: KB Quality Assessment and Tool Assignment
 */

import { KBQualityAssessment, BrandingConfig } from '../../types/workflow';
import TrialLogger from './logger';
import { logger } from '../observability/logger';
import { createLlamaIndexLlm } from '../rag/llamaindex-llm-factory';

export class WorkflowLangChainService {
  private logger: typeof TrialLogger;
  private useLlamaIndex: boolean;

  constructor() {
    this.logger = TrialLogger.getInstance();
    this.useLlamaIndex = process.env.USE_LLAMAINDEX_LLM === 'true';
  }

  /**
   * Assess KB quality using LangChain
   * 
   * This method evaluates:
   * 1. Document coherence and structure
   * 2. Topic coverage and relevance
   * 3. Completeness for chatbot training
   * 4. Semantic quality and clarity
   */
  async assessKBQuality(
    documents: Array<{
      id: string;
      content: string;
      metadata?: Record<string, unknown>;
    }>,
    tenantId: string
  ): Promise<KBQualityAssessment> {
    const startTime = Date.now();
    
    try {
      if (documents.length === 0) {
        return {
          quality_score: 0,
          quality_issues: ['No documents provided'],
          confidence: 1.0,
          recommendation: 'reject',
          document_count: 0,
          total_tokens: 0,
          coverage_score: 0,
          semantic_coherence: 0,
          details: { reason: 'empty_kb' },
        };
      }

      // Calculate basic metrics
      const totalTokens = documents.reduce(
        (sum, doc) => sum + this.estimateTokens(doc.content),
        0
      );
      const avgDocLength = documents.reduce((sum, doc) => sum + doc.content.length, 0) / documents.length;
      
      // Use LLM for semantic analysis if OpenAI is configured
      const openAIKey = process.env.OPENAI_API_KEY;
      let semanticAnalysis: { coherence: number; coverage: number; issues: string[] } | null = null;
      
      if (openAIKey && documents.length > 0) {
        // Sample documents for analysis (limit to 5 to control costs)
        const sampleDocs = documents.slice(0, 5);
        const sampleContent = sampleDocs.map(d => d.content.slice(0, 1000)).join('\n\n---\n\n');

        const promptText = `You are a knowledge base quality assessor. Analyze the following documents and evaluate:
1. Semantic coherence (0-1): How well-structured and clear is the content?
2. Topic coverage (0-1): Does it provide comprehensive information?
3. Issues: List any significant quality concerns.

Documents (${documents.length} total, showing first ${sampleDocs.length}):
${sampleContent}

Respond ONLY with valid JSON in this format:
{
  "coherence": 0.85,
  "coverage": 0.75,
  "issues": ["Issue 1", "Issue 2"]
}`;

        try {
          let responseText: string;

          if (this.useLlamaIndex) {
            // LlamaIndex approach
            const llm = await createLlamaIndexLlm();
            if (llm) {
              responseText = await llm.invoke(promptText);
            } else {
              responseText = '';
            }
          } else {
            // Use the LLM factory which returns a uniform adapter
            const adapter = await import('../rag/llm-factory').then(m => m.createLlm());
            if (adapter) {
              responseText = await adapter.invoke(promptText);
            } else {
              responseText = '';
            }
          }
          
          // Parse JSON response
          const jsonMatch = responseText.match(/\{[^{}]*\}/s);
          if (jsonMatch) {
            semanticAnalysis = JSON.parse(jsonMatch[0]);
            logger.info('LLM KB assessment completed', {
              tenant_id: tenantId,
              coherence: semanticAnalysis?.coherence,
              coverage: semanticAnalysis?.coverage,
              backend: this.useLlamaIndex ? 'llamaindex' : 'langchain',
              latency_ms: Date.now() - startTime,
            });
          }
        } catch (llmError) {
          logger.warn('LLM assessment failed, falling back to heuristic', {
            tenant_id: tenantId,
            backend: this.useLlamaIndex ? 'llamaindex' : 'langchain',
            error: llmError instanceof Error ? llmError.message : String(llmError),
          });
        }
      }

      // Calculate heuristic scores as fallback or supplement
      const contentScore = Math.min(avgDocLength / 2000, 1.0);
      const documentCountScore = Math.min(documents.length / 20, 1.0);
      const tokenScore = Math.min(totalTokens / 5000, 1.0);
      
      // Use LangChain scores if available, otherwise use heuristics
      const semanticCoherence = semanticAnalysis?.coherence ?? contentScore;
      const coverageScore = semanticAnalysis?.coverage ?? documentCountScore;
      
      // Combine scores
      const qualityScore = (
        semanticCoherence * 0.4 +
        coverageScore * 0.3 +
        tokenScore * 0.3
      );

      // Collect issues
      const issues: string[] = semanticAnalysis?.issues ?? [];
      if (documents.length < 3 && !issues.some(i => i.includes('few documents'))) {
        issues.push('Too few documents for comprehensive coverage');
      }
      if (totalTokens < 500 && !issues.some(i => i.includes('token'))) {
        issues.push('Insufficient content tokens for training');
      }
      if (avgDocLength < 200 && !issues.some(i => i.includes('short'))) {
        issues.push('Documents are too short and lack detail');
      }

      // Determine recommendation
      const recommendation =
        qualityScore < 0.3
          ? 'reject'
          : qualityScore < 0.5
            ? 'manual_review'
            : 'approve';

      const assessment: KBQualityAssessment = {
        quality_score: Math.round(qualityScore * 100) / 100,
        quality_issues: issues,
        confidence: semanticAnalysis ? 0.9 : 0.75, // Higher confidence with LangChain
        recommendation,
        document_count: documents.length,
        total_tokens: totalTokens,
        coverage_score: Math.round(coverageScore * 100) / 100,
        semantic_coherence: Math.round(semanticCoherence * 100) / 100,
        details: {
          avg_doc_length: Math.round(avgDocLength),
          min_doc_length: Math.min(...documents.map((d) => d.content.length)),
          max_doc_length: Math.max(...documents.map((d) => d.content.length)),
          assessment_timestamp: new Date().toISOString(),
          langchain_used: semanticAnalysis !== null,
          assessment_latency_ms: Date.now() - startTime,
        },
      };

      this.logger.info(`KB quality assessed for tenant ${tenantId}`, {
        tenant_id: tenantId,
        quality_score: assessment.quality_score,
        recommendation: assessment.recommendation,
        langchain_used: semanticAnalysis !== null,
      });

      return assessment;
    } catch (error) {
      this.logger.error('KB quality assessment failed', {
        tenant_id: tenantId,
        error: String(error),
      });

      // Return rejection on error (fail-safe)
      return {
        quality_score: 0,
        quality_issues: [`Assessment error: ${String(error)}`],
        confidence: 0.0,
        recommendation: 'reject',
        document_count: documents.length,
        total_tokens: 0,
        coverage_score: 0,
        semantic_coherence: 0,
        details: { error: String(error) },
      };
    }
  }

  /**
   * Assign tools automatically based on KB content
   * 
   * Analyzes KB to determine which tools are most relevant:
   * - web_search: If KB mentions current events, web references
   * - code_generator: If KB contains code examples, programming concepts
   * - data_analyzer: If KB contains data analysis, statistics
   * - document_search: For document-heavy KBs
   */
  async assignToolsAutomatically(
    tenantId: string,
    contextData: Record<string, unknown>
  ): Promise<string[]> {
    const businessType = (contextData.business_type as string) || 'general';
    const kbQuality = contextData.kb_quality_assessment as KBQualityAssessment | undefined;
    const genericTools = ['document_search', 'web_search', 'knowledge_graph_search'];
    const businessToolMap: Record<string, string[]> = {
      technology: ['code_generator', 'data_analyzer', 'api_reference'],
      finance: ['data_analyzer', 'calculator', 'report_generator'],
      healthcare: ['document_search', 'data_analyzer'],
      ecommerce: ['product_search', 'pricing_engine', 'order_tracker'],
      education: ['code_generator', 'explanation_generator', 'quiz_builder'],
      general: ['web_search', 'document_search'],
    };

    const catalog: Record<string, string> = {
      document_search: 'Tenant knowledge base vector search',
      web_search: 'Browser-based augmentation for current events',
      knowledge_graph_search: 'Hybrid graph + vector search over subscribed ontologies',
      code_generator: 'Autogenerate code samples or scripts',
      data_analyzer: 'Data insights and aggregation dashboard',
      api_reference: 'API examples and specs',
      calculator: 'Math/finance calculator assistant',
      report_generator: 'Structured reporting tool',
      product_search: 'Product catalog exploration',
      pricing_engine: 'Pricing optimization assistant',
      order_tracker: 'Order and fulfillment tracker',
      explanation_generator: 'Simplified explanations of features',
      quiz_builder: 'Quiz creation for training teams',
    };

    const candidateTools = Array.from(
      new Set([
        ...genericTools,
        ...(businessToolMap[businessType] || businessToolMap.general),
        ...Object.keys(catalog),
      ])
    );

    let recommendedTools: string[] | null = null;
    const openAIKey = process.env.OPENAI_API_KEY;

    if (openAIKey) {
      const toolCatalogText = Object.entries(catalog)
        .map(([key, desc]) => `- ${key}: ${desc}`)
        .join('\n');

      const promptText = `You are an expert assistant that recommends the most suitable tools for a tenant's knowledge base.
Available tools:
${toolCatalogText}

Tenant context:
- Business type: ${businessType}
- KB quality score: ${kbQuality?.quality_score ?? 'unknown'}
- KB coverage: ${kbQuality?.coverage_score ?? 'unknown'}
- Documents: ${kbQuality?.document_count ?? 'unknown'} documents, ${kbQuality?.total_tokens ?? 'unknown'} tokens

Respond with JSON containing an array named "tools" (max 5 tools) and an optional "notes" field. Only include tools that exist in the catalog above. Example:
{
  "tools": ["document_search", "data_analyzer"],
  "notes": "Document-heavy KB, prioritize search then data analysis"
}`;

        try {
          let textResponse: string;

        if (this.useLlamaIndex) {
          // LlamaIndex approach
          const llm = await createLlamaIndexLlm();
          if (llm) {
            textResponse = await llm.invoke(promptText);
          } else {
            textResponse = '{}';
          }
        } else {
          // Use the LLM factory to get a uniform adapter
          const adapter = await import('../rag/llm-factory').then(m => m.createLlm());
          if (adapter) {
            textResponse = await adapter.invoke(promptText);
          } else {
            textResponse = '{}';
          }
        }

        const jsonMatch = textResponse.match(/\{[^}]*"tools"[^}]*\}/s);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]) as { tools?: string[] };
          recommendedTools = (parsed.tools ?? []).filter((tool) => catalog[tool]);
        }
      } catch (error) {
        this.logger.warn('LLM tool assignment failed', {
          tenant_id: tenantId,
          backend: this.useLlamaIndex ? 'llamaindex' : 'langchain',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const finalTools = (recommendedTools && recommendedTools.length > 0
      ? recommendedTools
      : candidateTools
    ).slice(0, 5);

    this.logger.info(`Tools assigned for tenant ${tenantId}`, {
      tenant_id: tenantId,
      business_type: businessType,
      tools: finalTools,
      langchain_used: Array.isArray(recommendedTools),
    });

    return finalTools;
  }

  /**
   * Generate branding recommendations based on business type
   */
  async generateBrandingRecommendations(
    businessType: string,
    businessName: string
  ): Promise<BrandingConfig> {
    try {
      // Predefined color schemes for different business types
      const colorSchemes: Record<string, [string, string, BrandingConfig['tone']]> = {
        technology: ['#0066cc', '#00cc66', 'professional'],
        finance: ['#1a1a4d', '#cc0000', 'professional'],
        healthcare: ['#006633', '#00cc99', 'friendly'],
        ecommerce: ['#ff6600', '#ffcc00', 'friendly'],
        education: ['#0033cc', '#00cc33', 'friendly'],
        general: ['#0066cc', '#00cc66', 'professional'],
      };

      const [primary, secondary, tone] = colorSchemes[businessType] || colorSchemes.general;

      return {
        primary_color: primary,
        secondary_color: secondary,
        tone,
        business_type: businessType,
        assigned_tools: [],
        customizations: {
          business_name: businessName,
          auto_generated: true,
        },
      };
    } catch (error) {
      this.logger.error('Branding recommendation failed', {
        business_type: businessType,
        error: String(error),
      });

      // Return default branding on error
      return {
        primary_color: '#0066cc',
        secondary_color: '#00cc66',
        tone: 'professional',
        business_type: businessType,
        assigned_tools: [],
        customizations: {},
      };
    }
  }

  /**
   * Estimate token count for content
   * Simple approximation: ~4 characters per token
   */
  private estimateTokens(content: string): number {
    return Math.ceil(content.length / 4);
  }

  /**
   * Extract key topics from KB using LangChain
   * TODO: Implement with actual LangChain
   */
  async extractKeyTopics(
    documents: Array<{ content: string }>,
    maxTopics: number = 10
  ): Promise<string[]> {
    try {
      // Mock implementation: extract common noun phrases
      // In production, use LangChain for NLP-based extraction
      const topics: string[] = [];

      // Simple heuristic: look for capitalized phrases
      const phraseRegex = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g;

      for (const doc of documents) {
        const matches = doc.content.match(phraseRegex);
        if (matches) {
          topics.push(...matches);
        }
      }

      // Count frequency and return top topics
      const topicFreq = new Map<string, number>();
      for (const topic of topics) {
        topicFreq.set(topic, (topicFreq.get(topic) || 0) + 1);
      }

      return Array.from(topicFreq.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, maxTopics)
        .map(([topic]) => topic);
    } catch (error) {
      this.logger.error('Topic extraction failed', { error: String(error) });
      return [];
    }
  }

  /**
   * Validate KB content for completeness
   * TODO: Implement with LangChain semantic analysis
   */
  async validateKBCompleteness(
    documents: Array<{ content: string }>,
    businessType: string
  ): Promise<{ valid: boolean; issues: string[] }> {
    try {
      const issues: string[] = [];

      if (documents.length === 0) {
        issues.push('No documents provided');
      }

      const totalContent = documents.reduce((sum, doc) => sum + doc.content.length, 0);
      if (totalContent < 1000) {
        issues.push('Total content is too short (minimum 1000 characters recommended)');
      }

      // Check for basic structure
      const hasHeadings = documents.some((doc) =>
        /^#+\s+/m.test(doc.content)
      );
      if (!hasHeadings) {
        issues.push('Documents lack proper structure (no headings detected)');
      }

      return {
        valid: issues.length === 0,
        issues,
      };
    } catch (error) {
      this.logger.error('KB completeness validation failed', {
        error: String(error),
      });

      return {
        valid: false,
        issues: [`Validation error: ${String(error)}`],
      };
    }
  }
}

// Export singleton instance
export const workflowLangChainService = new WorkflowLangChainService();
