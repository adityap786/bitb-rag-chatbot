/**
 * Confidence Calibration & Uncertainty Quantification
 * 
 * Ensures AI confidence scores accurately reflect actual accuracy.
 * Implements calibration techniques to produce well-calibrated probabilities.
 */

import { generateText } from 'ai';
import { getLLM } from '@/lib/llm/factory';

// ============================================================================
// Types
// ============================================================================

export interface CalibrationConfig {
  tenantId: string;
  /** Enable temperature scaling for calibration */
  enableTemperatureScaling: boolean;
  /** Enable ensemble confidence */
  enableEnsemble: boolean;
  /** Number of ensemble members */
  ensembleSize: number;
  /** Track historical calibration */
  enableHistoricalTracking: boolean;
  /** Confidence bins for calibration analysis */
  calibrationBins: number;
}

export interface ConfidenceScore {
  /** Overall confidence (0-1) */
  overall: number;
  /** Confidence breakdown by aspect */
  breakdown: {
    /** Factual accuracy confidence */
    factual: number;
    /** Completeness confidence */
    completeness: number;
    /** Relevance to query confidence */
    relevance: number;
    /** Source grounding confidence */
    grounding: number;
  };
  /** Calibrated confidence (adjusted for historical accuracy) */
  calibrated: number;
  /** Confidence interval */
  interval: {
    lower: number;
    upper: number;
  };
  /** Uncertainty sources */
  uncertaintySources: UncertaintySource[];
}

export interface UncertaintySource {
  source: string;
  impact: 'low' | 'medium' | 'high';
  description: string;
  mitigation?: string;
}

export interface CalibrationMetrics {
  /** Expected Calibration Error */
  ece: number;
  /** Maximum Calibration Error */
  mce: number;
  /** Brier Score */
  brierScore: number;
  /** Per-bin accuracy */
  binAccuracies: { bin: string; confidence: number; accuracy: number; count: number }[];
  /** Reliability diagram data */
  reliabilityDiagram: { confidence: number; accuracy: number }[];
}

export interface ConfidenceHistory {
  timestamp: Date;
  query: string;
  predictedConfidence: number;
  actualCorrect: boolean;
}

export interface UncertaintyDecomposition {
  /** Epistemic uncertainty (model uncertainty - reducible with more data) */
  epistemic: number;
  /** Aleatoric uncertainty (data uncertainty - irreducible) */
  aleatoric: number;
  /** Total uncertainty */
  total: number;
  /** Explanation */
  explanation: string;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: CalibrationConfig = {
  tenantId: 'default',
  enableTemperatureScaling: true,
  enableEnsemble: true,
  ensembleSize: 3,
  enableHistoricalTracking: true,
  calibrationBins: 10,
};

// ============================================================================
// Confidence Calibrator
// ============================================================================

export class ConfidenceCalibrator {
  private config: CalibrationConfig;
  private history: ConfidenceHistory[] = [];
  private temperatureParameter: number = 1.0; // For temperature scaling
  
  constructor(config: Partial<CalibrationConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }
  
  /**
   * Estimate confidence for a response
   */
  async estimateConfidence(
    query: string,
    response: string,
    context?: string | string[]
  ): Promise<ConfidenceScore> {
    // Step 1: Get raw confidence estimates
    const rawConfidence = await this.getRawConfidence(query, response, context);
    
    // Step 2: Ensemble confidence (if enabled)
    let ensembleConfidence = rawConfidence.overall;
    if (this.config.enableEnsemble) {
      ensembleConfidence = await this.getEnsembleConfidence(query, response, context);
    }
    
    // Step 3: Apply temperature scaling (if enabled)
    let calibratedConfidence = ensembleConfidence;
    if (this.config.enableTemperatureScaling) {
      calibratedConfidence = this.applyTemperatureScaling(ensembleConfidence);
    }
    
    // Step 4: Calculate confidence interval
    const interval = this.calculateConfidenceInterval(calibratedConfidence);
    
    // Step 5: Identify uncertainty sources
    const uncertaintySources = await this.identifyUncertaintySources(
      query, response, context, rawConfidence
    );
    
    return {
      overall: rawConfidence.overall,
      breakdown: rawConfidence.breakdown,
      calibrated: calibratedConfidence,
      interval,
      uncertaintySources,
    };
  }
  
  /**
   * Get raw confidence scores using LLM self-assessment
   */
  private async getRawConfidence(
    query: string,
    response: string,
    context?: string | string[]
  ): Promise<{
    overall: number;
    breakdown: ConfidenceScore['breakdown'];
  }> {
    const llm = getLLM(this.config.tenantId);
    const contextStr = Array.isArray(context) ? context.join('\n\n') : context;
    
    const prompt = `Assess your confidence in this response. Be calibrated - a 70% confidence should mean you're correct 70% of the time.

QUERY: ${query}

RESPONSE:
${response}

${contextStr ? `AVAILABLE CONTEXT:\n${contextStr}` : 'No additional context provided.'}

Rate confidence (0.0-1.0) for:
1. **Factual Accuracy**: How confident are you that all facts are correct?
2. **Completeness**: How confident that the response fully addresses the query?
3. **Relevance**: How confident that the response is relevant and on-topic?
4. **Source Grounding**: How confident that claims are supported by the context?

Consider:
- Lower confidence if information might be outdated
- Lower confidence for specific numbers/dates without source
- Lower confidence for controversial or nuanced topics
- Higher confidence for well-established facts from context

Respond in JSON:
{
  "factual": 0.0-1.0,
  "completeness": 0.0-1.0,
  "relevance": 0.0-1.0,
  "grounding": 0.0-1.0,
  "overall": 0.0-1.0,
  "reasoning": "brief explanation of confidence assessment"
}`;

    try {
      const result = await generateText({
        model: llm,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
      });
      
      const parsed = JSON.parse(this.extractJSON(result.text));
      
      return {
        overall: parsed.overall || 0.5,
        breakdown: {
          factual: parsed.factual || 0.5,
          completeness: parsed.completeness || 0.5,
          relevance: parsed.relevance || 0.5,
          grounding: parsed.grounding || 0.5,
        },
      };
    } catch (error) {
      console.error('Confidence estimation failed:', error);
      return {
        overall: 0.5,
        breakdown: {
          factual: 0.5,
          completeness: 0.5,
          relevance: 0.5,
          grounding: 0.5,
        },
      };
    }
  }
  
  /**
   * Get ensemble confidence from multiple model samples
   */
  private async getEnsembleConfidence(
    query: string,
    response: string,
    context?: string | string[]
  ): Promise<number> {
    const confidences: number[] = [];
    
    for (let i = 0; i < this.config.ensembleSize; i++) {
      const confidence = await this.getRawConfidence(query, response, context);
      confidences.push(confidence.overall);
    }
    
    // Use mean confidence
    const meanConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length;
    
    // Reduce confidence if there's high variance (disagreement)
    const variance = confidences.reduce(
      (sum, c) => sum + Math.pow(c - meanConfidence, 2), 0
    ) / confidences.length;
    
    // Penalize high variance
    const variancePenalty = Math.sqrt(variance) * 0.5;
    
    return Math.max(0, Math.min(1, meanConfidence - variancePenalty));
  }
  
  /**
   * Apply temperature scaling for calibration
   */
  private applyTemperatureScaling(confidence: number): number {
    // Platt scaling: calibrated = sigmoid(logit(confidence) / T)
    const logit = Math.log(confidence / (1 - confidence + 1e-10));
    const scaledLogit = logit / this.temperatureParameter;
    const calibrated = 1 / (1 + Math.exp(-scaledLogit));
    
    return calibrated;
  }
  
  /**
   * Calculate confidence interval using Wilson score
   */
  private calculateConfidenceInterval(
    confidence: number,
    z: number = 1.96 // 95% confidence
  ): { lower: number; upper: number } {
    // Using effective sample size based on history
    const n = Math.max(10, this.history.length);
    const p = confidence;
    
    const denominator = 1 + (z * z) / n;
    const center = p + (z * z) / (2 * n);
    const spread = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n);
    
    return {
      lower: Math.max(0, (center - spread) / denominator),
      upper: Math.min(1, (center + spread) / denominator),
    };
  }
  
  /**
   * Identify sources of uncertainty
   */
  private async identifyUncertaintySources(
    query: string,
    response: string,
    context: string | string[] | undefined,
    confidence: { overall: number; breakdown: ConfidenceScore['breakdown'] }
  ): Promise<UncertaintySource[]> {
    const sources: UncertaintySource[] = [];
    
    // Check context availability
    if (!context || (Array.isArray(context) && context.length === 0)) {
      sources.push({
        source: 'missing_context',
        impact: 'high',
        description: 'No source documents provided for grounding',
        mitigation: 'Provide relevant documents or knowledge base entries',
      });
    }
    
    // Check confidence breakdown for weak areas
    if (confidence.breakdown.factual < 0.7) {
      sources.push({
        source: 'factual_uncertainty',
        impact: confidence.breakdown.factual < 0.5 ? 'high' : 'medium',
        description: 'Uncertainty about factual accuracy of claims',
        mitigation: 'Verify claims against authoritative sources',
      });
    }
    
    if (confidence.breakdown.completeness < 0.7) {
      sources.push({
        source: 'incomplete_answer',
        impact: 'medium',
        description: 'Response may not fully address all aspects of the query',
        mitigation: 'Consider if additional information should be included',
      });
    }
    
    if (confidence.breakdown.grounding < 0.7) {
      sources.push({
        source: 'weak_grounding',
        impact: 'high',
        description: 'Claims may not be well-supported by provided context',
        mitigation: 'Add citations or acknowledge where information comes from',
      });
    }
    
    // Query complexity check
    const complexityIndicators = [
      'compare', 'contrast', 'analyze', 'evaluate', 'why', 'how',
      'implications', 'consequences', 'future', 'predict',
    ];
    const isComplexQuery = complexityIndicators.some(ind => 
      query.toLowerCase().includes(ind)
    );
    
    if (isComplexQuery) {
      sources.push({
        source: 'query_complexity',
        impact: 'medium',
        description: 'Complex query may require nuanced reasoning',
        mitigation: 'Consider breaking down into simpler sub-questions',
      });
    }
    
    return sources;
  }
  
  /**
   * Decompose uncertainty into epistemic and aleatoric components
   */
  async decomposeUncertainty(
    query: string,
    response: string,
    context?: string | string[]
  ): Promise<UncertaintyDecomposition> {
    const llm = getLLM(this.config.tenantId);
    
    const prompt = `Analyze the types of uncertainty in this response.

QUERY: ${query}

RESPONSE:
${response}

${context ? `CONTEXT: ${Array.isArray(context) ? context.join('\n') : context}` : ''}

Categorize uncertainty into:

1. **Epistemic Uncertainty** (Model/Knowledge Uncertainty):
   - Could be reduced with more training data or information
   - Examples: Unknown facts, gaps in knowledge, ambiguous phrasing
   
2. **Aleatoric Uncertainty** (Data/Inherent Uncertainty):
   - Cannot be reduced, inherent to the problem
   - Examples: Future predictions, inherently random processes, subjective opinions

Rate each type (0.0-1.0) and explain.

Respond in JSON:
{
  "epistemic": 0.0-1.0,
  "aleatoric": 0.0-1.0,
  "explanation": "detailed breakdown of uncertainty sources"
}`;

    try {
      const result = await generateText({
        model: llm,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
      });
      
      const parsed = JSON.parse(this.extractJSON(result.text));
      
      return {
        epistemic: parsed.epistemic || 0.3,
        aleatoric: parsed.aleatoric || 0.2,
        total: Math.min(1, Math.sqrt(
          Math.pow(parsed.epistemic || 0.3, 2) + 
          Math.pow(parsed.aleatoric || 0.2, 2)
        )),
        explanation: parsed.explanation || 'Uncertainty decomposition unavailable',
      };
    } catch (error) {
      console.error('Uncertainty decomposition failed:', error);
      return {
        epistemic: 0.3,
        aleatoric: 0.2,
        total: 0.36,
        explanation: 'Unable to decompose uncertainty',
      };
    }
  }
  
  /**
   * Update calibration based on feedback
   */
  recordFeedback(
    query: string,
    predictedConfidence: number,
    wasCorrect: boolean
  ): void {
    this.history.push({
      timestamp: new Date(),
      query,
      predictedConfidence,
      actualCorrect: wasCorrect,
    });
    
    // Update temperature parameter based on historical performance
    if (this.history.length >= 20) {
      this.updateTemperatureParameter();
    }
  }
  
  /**
   * Update temperature parameter for better calibration
   */
  private updateTemperatureParameter(): void {
    // Simple gradient-based update to minimize calibration error
    const bins = this.binPredictions();
    
    let gradient = 0;
    for (const bin of bins) {
      if (bin.count > 0) {
        const gap = bin.confidence - bin.accuracy;
        gradient += gap * bin.count;
      }
    }
    
    // Adjust temperature
    const learningRate = 0.1;
    this.temperatureParameter += learningRate * gradient;
    this.temperatureParameter = Math.max(0.1, Math.min(10, this.temperatureParameter));
  }
  
  /**
   * Bin predictions for calibration analysis
   */
  private binPredictions(): CalibrationMetrics['binAccuracies'] {
    const numBins = this.config.calibrationBins;
    const bins: { confidence: number; correct: number; count: number }[] = 
      Array(numBins).fill(null).map(() => ({ confidence: 0, correct: 0, count: 0 }));
    
    for (const entry of this.history) {
      const binIndex = Math.min(
        numBins - 1,
        Math.floor(entry.predictedConfidence * numBins)
      );
      bins[binIndex].confidence += entry.predictedConfidence;
      bins[binIndex].correct += entry.actualCorrect ? 1 : 0;
      bins[binIndex].count += 1;
    }
    
    return bins.map((bin, i) => ({
      bin: `${(i / numBins * 100).toFixed(0)}-${((i + 1) / numBins * 100).toFixed(0)}%`,
      confidence: bin.count > 0 ? bin.confidence / bin.count : (i + 0.5) / numBins,
      accuracy: bin.count > 0 ? bin.correct / bin.count : 0,
      count: bin.count,
    }));
  }
  
  /**
   * Get calibration metrics
   */
  getCalibrationMetrics(): CalibrationMetrics {
    const bins = this.binPredictions();
    
    // Expected Calibration Error (ECE)
    let ece = 0;
    let totalCount = 0;
    for (const bin of bins) {
      if (bin.count > 0) {
        ece += bin.count * Math.abs(bin.accuracy - bin.confidence);
        totalCount += bin.count;
      }
    }
    ece = totalCount > 0 ? ece / totalCount : 0;
    
    // Maximum Calibration Error (MCE)
    const mce = Math.max(...bins.map(bin => 
      bin.count > 0 ? Math.abs(bin.accuracy - bin.confidence) : 0
    ));
    
    // Brier Score
    const brierScore = this.history.length > 0
      ? this.history.reduce((sum, entry) => 
          sum + Math.pow(entry.predictedConfidence - (entry.actualCorrect ? 1 : 0), 2), 0
        ) / this.history.length
      : 0;
    
    return {
      ece,
      mce,
      brierScore,
      binAccuracies: bins,
      reliabilityDiagram: bins.map(bin => ({
        confidence: bin.confidence,
        accuracy: bin.accuracy,
      })),
    };
  }
  
  /**
   * Extract JSON from text
   */
  private extractJSON(text: string): string {
    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) return codeBlockMatch[1].trim();
    
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) return jsonMatch[0];
    
    return text;
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Create a confidence calibrator
 */
export function createConfidenceCalibrator(
  tenantId: string,
  options: Partial<CalibrationConfig> = {}
): ConfidenceCalibrator {
  return new ConfidenceCalibrator({
    tenantId,
    ...options,
  });
}

/**
 * Quick confidence estimation
 */
export async function estimateConfidence(
  query: string,
  response: string,
  context?: string | string[],
  tenantId: string = 'default'
): Promise<ConfidenceScore> {
  const calibrator = createConfidenceCalibrator(tenantId);
  return calibrator.estimateConfidence(query, response, context);
}

/**
 * Generate confidence-aware response wrapper
 */
export function withConfidenceScore<T extends { response: string; query: string }>(
  ragFunction: (...args: unknown[]) => Promise<T>,
  tenantId: string = 'default'
): (...args: unknown[]) => Promise<T & { confidence: ConfidenceScore }> {
  const calibrator = createConfidenceCalibrator(tenantId);
  
  return async (...args: unknown[]) => {
    const result = await ragFunction(...args);
    const confidence = await calibrator.estimateConfidence(
      result.query,
      result.response
    );
    
    return {
      ...result,
      confidence,
    };
  };
}

export default ConfidenceCalibrator;
