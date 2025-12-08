/**
 * Hallucination Detection & Prevention
 * 
 * Advanced techniques to detect, prevent, and mitigate AI hallucinations.
 * Uses multiple strategies for robust hallucination control.
 */

import { generateText } from 'ai';
import { getLLM } from '@/lib/llm/factory';

// ============================================================================
// Types
// ============================================================================

export interface HallucinationDetectionConfig {
  /** Tenant ID for LLM */
  tenantId: string;
  /** Sensitivity level for detection */
  sensitivity: 'low' | 'medium' | 'high';
  /** Enable NLI-based detection */
  enableNLI: boolean;
  /** Enable claim extraction */
  enableClaimExtraction: boolean;
  /** Enable entity verification */
  enableEntityVerification: boolean;
  /** Custom knowledge base for verification */
  knowledgeBase?: KnowledgeEntry[];
}

export interface KnowledgeEntry {
  fact: string;
  source: string;
  confidence: number;
  domain?: string;
}

export interface HallucinationReport {
  /** Overall hallucination detected */
  detected: boolean;
  /** Hallucination severity score (0-1) */
  severity: number;
  /** List of detected hallucinations */
  hallucinations: DetectedHallucination[];
  /** Verified factual claims */
  verifiedClaims: VerifiedClaim[];
  /** Recommendations for fixing */
  recommendations: string[];
  /** Corrected response if possible */
  correctedResponse?: string;
}

export interface DetectedHallucination {
  /** The hallucinated content */
  content: string;
  /** Type of hallucination */
  type: HallucinationType;
  /** Confidence in detection */
  confidence: number;
  /** Why it's considered a hallucination */
  reason: string;
  /** Location in the response */
  position: { start: number; end: number };
  /** Suggested correction */
  correction?: string;
}

export type HallucinationType =
  | 'fabricated_fact'      // Made-up information
  | 'entity_confusion'     // Mixing up entities
  | 'temporal_error'       // Wrong dates/times
  | 'numerical_error'      // Wrong numbers/statistics
  | 'source_misattribution' // Incorrect source citation
  | 'logical_impossibility' // Logically impossible claims
  | 'context_contradiction' // Contradicts provided context
  | 'overconfident_claim'  // Claiming certainty where none exists
  | 'invented_quote'       // Fabricated quotations
  | 'causal_hallucination'; // False cause-effect relationships

export interface VerifiedClaim {
  claim: string;
  verification: 'supported' | 'partially_supported' | 'unsupported';
  evidence?: string;
  confidence: number;
}

export interface ClaimExtractionResult {
  claims: ExtractedClaim[];
  totalClaims: number;
}

export interface ExtractedClaim {
  text: string;
  type: 'factual' | 'opinion' | 'inference';
  entities: string[];
  verifiable: boolean;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: HallucinationDetectionConfig = {
  tenantId: 'default',
  sensitivity: 'medium',
  enableNLI: true,
  enableClaimExtraction: true,
  enableEntityVerification: true,
};

// ============================================================================
// Hallucination Detector
// ============================================================================

export class HallucinationDetector {
  private config: HallucinationDetectionConfig;
  
  constructor(config: Partial<HallucinationDetectionConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }
  
  /**
   * Detect hallucinations in a response given the source context
   */
  async detect(
    response: string,
    sourceContext: string | string[],
    query?: string
  ): Promise<HallucinationReport> {
    const context = Array.isArray(sourceContext) 
      ? sourceContext.join('\n\n---\n\n') 
      : sourceContext;
    
    // Step 1: Extract claims from response
    const claims = this.config.enableClaimExtraction
      ? await this.extractClaims(response)
      : { claims: [], totalClaims: 0 };
    
    // Step 2: Verify each claim against context
    const verifiedClaims = await this.verifyClaims(claims.claims, context);
    
    // Step 3: Run NLI-based entailment check
    const nliResults = this.config.enableNLI
      ? await this.checkEntailment(response, context)
      : null;
    
    // Step 4: Check for specific hallucination patterns
    const patternResults = await this.detectPatterns(response, context, query);
    
    // Step 5: Entity verification
    const entityResults = this.config.enableEntityVerification
      ? await this.verifyEntities(response, context)
      : [];
    
    // Combine all detection results
    const hallucinations = this.combineResults(
      verifiedClaims,
      nliResults,
      patternResults,
      entityResults
    );
    
    // Generate corrected response if hallucinations found
    let correctedResponse: string | undefined;
    if (hallucinations.length > 0) {
      correctedResponse = await this.generateCorrectedResponse(
        response,
        hallucinations,
        context
      );
    }
    
    return {
      detected: hallucinations.length > 0,
      severity: this.calculateSeverity(hallucinations),
      hallucinations,
      verifiedClaims,
      recommendations: this.generateRecommendations(hallucinations),
      correctedResponse,
    };
  }
  
  /**
   * Extract verifiable claims from response
   */
  private async extractClaims(response: string): Promise<ClaimExtractionResult> {
    const llm = getLLM(this.config.tenantId);
    
    const prompt = `Extract all factual claims from this text. A claim is a statement that asserts something as true.

TEXT:
${response}

For each claim, identify:
1. The exact claim text
2. Whether it's factual, opinion, or inference
3. Any named entities (people, places, organizations, dates, numbers)
4. Whether it can be verified against sources

Respond in JSON:
{
  "claims": [
    {
      "text": "the exact claim",
      "type": "factual|opinion|inference",
      "entities": ["list", "of", "entities"],
      "verifiable": true/false
    }
  ]
}`;

    try {
      const result = await generateText({
        model: llm,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
      });
      
      const parsed = JSON.parse(this.extractJSON(result.text));
      return {
        claims: parsed.claims || [],
        totalClaims: parsed.claims?.length || 0,
      };
    } catch (error) {
      console.error('Claim extraction failed:', error);
      return { claims: [], totalClaims: 0 };
    }
  }
  
  /**
   * Verify claims against source context
   */
  private async verifyClaims(
    claims: ExtractedClaim[],
    context: string
  ): Promise<VerifiedClaim[]> {
    const llm = getLLM(this.config.tenantId);
    const results: VerifiedClaim[] = [];
    
    for (const claim of claims.filter(c => c.verifiable)) {
      const prompt = `Verify if this claim is supported by the given context.

CLAIM: "${claim.text}"

CONTEXT:
${context}

Determine:
1. Is this claim SUPPORTED, PARTIALLY_SUPPORTED, or UNSUPPORTED by the context?
2. What evidence from the context supports or contradicts this claim?
3. Confidence level (0-1)

Respond in JSON:
{
  "verification": "supported|partially_supported|unsupported",
  "evidence": "quote from context or explanation",
  "confidence": 0.0-1.0
}`;

      try {
        const result = await generateText({
          model: llm,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0,
        });
        
        const parsed = JSON.parse(this.extractJSON(result.text));
        results.push({
          claim: claim.text,
          verification: parsed.verification,
          evidence: parsed.evidence,
          confidence: parsed.confidence,
        });
      } catch (error) {
        results.push({
          claim: claim.text,
          verification: 'unsupported',
          confidence: 0.5,
        });
      }
    }
    
    return results;
  }
  
  /**
   * NLI-based entailment checking
   */
  private async checkEntailment(
    response: string,
    context: string
  ): Promise<{ entailed: boolean; score: number; details: string }> {
    const llm = getLLM(this.config.tenantId);
    
    const prompt = `Perform natural language inference (NLI) analysis.

PREMISE (Source Context):
${context}

HYPOTHESIS (Response to verify):
${response}

Determine:
1. Does the premise ENTAIL the hypothesis (the hypothesis logically follows)?
2. Are they NEUTRAL (neither supports nor contradicts)?
3. Does the premise CONTRADICT the hypothesis?

Score the entailment from 0 (strong contradiction) to 1 (strong entailment).

Respond in JSON:
{
  "relationship": "entailment|neutral|contradiction",
  "score": 0.0-1.0,
  "details": "explanation of the relationship"
}`;

    try {
      const result = await generateText({
        model: llm,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
      });
      
      const parsed = JSON.parse(this.extractJSON(result.text));
      return {
        entailed: parsed.relationship === 'entailment',
        score: parsed.score,
        details: parsed.details,
      };
    } catch (error) {
      return { entailed: true, score: 0.7, details: 'Unable to verify' };
    }
  }
  
  /**
   * Detect specific hallucination patterns
   */
  private async detectPatterns(
    response: string,
    context: string,
    query?: string
  ): Promise<DetectedHallucination[]> {
    const llm = getLLM(this.config.tenantId);
    
    const prompt = `Analyze this response for common hallucination patterns.

${query ? `QUERY: ${query}\n` : ''}
RESPONSE:
${response}

AVAILABLE CONTEXT:
${context}

Check for these hallucination types:
1. fabricated_fact: Information made up without basis
2. entity_confusion: Mixing up names, places, or concepts
3. temporal_error: Wrong dates, times, or sequences
4. numerical_error: Incorrect numbers, statistics, or quantities
5. source_misattribution: Incorrectly citing sources
6. logical_impossibility: Claims that are logically impossible
7. context_contradiction: Directly contradicts the provided context
8. overconfident_claim: Expressing certainty about uncertain things
9. invented_quote: Made-up quotations
10. causal_hallucination: False cause-effect relationships

For each hallucination found, provide:
- The problematic content
- The type of hallucination
- Why it's a hallucination
- A suggested correction

Respond in JSON:
{
  "hallucinations": [
    {
      "content": "the hallucinated text",
      "type": "hallucination_type",
      "confidence": 0.0-1.0,
      "reason": "why this is a hallucination",
      "correction": "suggested fix"
    }
  ]
}`;

    try {
      const result = await generateText({
        model: llm,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
      });
      
      const parsed = JSON.parse(this.extractJSON(result.text));
      return (parsed.hallucinations || []).map((h: any) => ({
        ...h,
        position: this.findPosition(response, h.content),
      }));
    } catch (error) {
      console.error('Pattern detection failed:', error);
      return [];
    }
  }
  
  /**
   * Verify named entities in the response
   */
  private async verifyEntities(
    response: string,
    context: string
  ): Promise<DetectedHallucination[]> {
    const llm = getLLM(this.config.tenantId);
    
    const prompt = `Extract and verify all named entities from this response against the context.

RESPONSE:
${response}

CONTEXT:
${context}

For each entity (person, organization, location, date, number):
1. Is it mentioned in the context?
2. Is the information about it accurate?
3. Are there any mix-ups with similar entities?

Respond in JSON:
{
  "entities": [
    {
      "entity": "entity name",
      "type": "person|organization|location|date|number|other",
      "inContext": true/false,
      "accurate": true/false,
      "issue": "description of issue if any"
    }
  ]
}`;

    try {
      const result = await generateText({
        model: llm,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
      });
      
      const parsed = JSON.parse(this.extractJSON(result.text));
      const hallucinations: DetectedHallucination[] = [];
      
      for (const entity of parsed.entities || []) {
        if (!entity.accurate || (!entity.inContext && entity.type !== 'other')) {
          hallucinations.push({
            content: entity.entity,
            type: 'entity_confusion',
            confidence: 0.8,
            reason: entity.issue || 'Entity not found in context',
            position: this.findPosition(response, entity.entity),
          });
        }
      }
      
      return hallucinations;
    } catch (error) {
      console.error('Entity verification failed:', error);
      return [];
    }
  }
  
  /**
   * Combine results from all detection methods
   */
  private combineResults(
    verifiedClaims: VerifiedClaim[],
    nliResults: { entailed: boolean; score: number; details: string } | null,
    patternResults: DetectedHallucination[],
    entityResults: DetectedHallucination[]
  ): DetectedHallucination[] {
    const hallucinations: DetectedHallucination[] = [...patternResults, ...entityResults];
    
    // Add hallucinations from unsupported claims
    for (const claim of verifiedClaims) {
      if (claim.verification === 'unsupported' && claim.confidence > 0.7) {
        hallucinations.push({
          content: claim.claim,
          type: 'fabricated_fact',
          confidence: claim.confidence,
          reason: 'Claim not supported by provided context',
          position: { start: 0, end: 0 }, // Position needs to be found
        });
      }
    }
    
    // Add NLI-based hallucination if contradiction detected
    if (nliResults && !nliResults.entailed && nliResults.score < 0.3) {
      hallucinations.push({
        content: 'Overall response',
        type: 'context_contradiction',
        confidence: 1 - nliResults.score,
        reason: nliResults.details,
        position: { start: 0, end: 0 },
      });
    }
    
    // Deduplicate based on content similarity
    return this.deduplicateHallucinations(hallucinations);
  }
  
  /**
   * Remove duplicate hallucination detections
   */
  private deduplicateHallucinations(
    hallucinations: DetectedHallucination[]
  ): DetectedHallucination[] {
    const seen = new Set<string>();
    return hallucinations.filter(h => {
      const key = `${h.type}:${h.content.toLowerCase().substring(0, 50)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  
  /**
   * Generate a corrected version of the response
   */
  private async generateCorrectedResponse(
    response: string,
    hallucinations: DetectedHallucination[],
    context: string
  ): Promise<string> {
    const llm = getLLM(this.config.tenantId);
    
    const hallucinationsList = hallucinations
      .map(h => `- ${h.type}: "${h.content}" → ${h.correction || 'Remove or correct'}`)
      .join('\n');
    
    const prompt = `Correct this response by removing or fixing the identified hallucinations.

ORIGINAL RESPONSE:
${response}

HALLUCINATIONS TO FIX:
${hallucinationsList}

ACCURATE CONTEXT:
${context}

Generate a corrected response that:
1. Removes all hallucinated content
2. Only includes information from the context
3. Acknowledges uncertainty where appropriate
4. Maintains helpful and coherent structure

Provide the corrected response:`;

    try {
      const result = await generateText({
        model: llm,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
      });
      
      return result.text.trim();
    } catch (error) {
      console.error('Correction generation failed:', error);
      return response;
    }
  }
  
  /**
   * Calculate overall severity of hallucinations
   */
  private calculateSeverity(hallucinations: DetectedHallucination[]): number {
    if (hallucinations.length === 0) return 0;
    
    const weights: Record<HallucinationType, number> = {
      'fabricated_fact': 0.9,
      'entity_confusion': 0.7,
      'temporal_error': 0.6,
      'numerical_error': 0.7,
      'source_misattribution': 0.5,
      'logical_impossibility': 0.95,
      'context_contradiction': 0.85,
      'overconfident_claim': 0.4,
      'invented_quote': 0.8,
      'causal_hallucination': 0.75,
    };
    
    const totalWeight = hallucinations.reduce(
      (sum, h) => sum + (weights[h.type] || 0.5) * h.confidence,
      0
    );
    
    return Math.min(1, totalWeight / hallucinations.length);
  }
  
  /**
   * Generate recommendations for addressing hallucinations
   */
  private generateRecommendations(hallucinations: DetectedHallucination[]): string[] {
    const recommendations: string[] = [];
    const typeCount = new Map<HallucinationType, number>();
    
    for (const h of hallucinations) {
      typeCount.set(h.type, (typeCount.get(h.type) || 0) + 1);
    }
    
    if (typeCount.get('fabricated_fact')) {
      recommendations.push('Stick strictly to information provided in the source documents');
    }
    if (typeCount.get('entity_confusion')) {
      recommendations.push('Double-check entity names and ensure correct attribution');
    }
    if (typeCount.get('temporal_error')) {
      recommendations.push('Verify all dates and temporal relationships against sources');
    }
    if (typeCount.get('numerical_error')) {
      recommendations.push('Cross-check all numbers and statistics with source documents');
    }
    if (typeCount.get('overconfident_claim')) {
      recommendations.push('Use hedging language when information is uncertain or incomplete');
    }
    if (typeCount.get('context_contradiction')) {
      recommendations.push('Review response for consistency with provided context');
    }
    
    if (recommendations.length === 0 && hallucinations.length > 0) {
      recommendations.push('Review the response carefully for accuracy');
    }
    
    return recommendations;
  }
  
  /**
   * Find position of content in response
   */
  private findPosition(response: string, content: string): { start: number; end: number } {
    const start = response.toLowerCase().indexOf(content.toLowerCase());
    if (start === -1) return { start: 0, end: 0 };
    return { start, end: start + content.length };
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
// Hallucination Prevention Strategies
// ============================================================================

export const PREVENTION_STRATEGIES = {
  /**
   * Constrained Generation: Force model to cite sources
   */
  constrainedGeneration: (context: string, query: string): string => {
    return `You must ONLY use information from the provided context to answer the question.
If the context doesn't contain the answer, say "I don't have enough information to answer this."

CONTEXT:
${context}

QUESTION: ${query}

RULES:
- Every fact must be traceable to the context
- Use phrases like "According to the document..." or "The context states..."
- Do not add information not present in the context
- If uncertain, express uncertainty

Answer:`;
  },
  
  /**
   * Retrieval-Augmented Verification
   */
  retrievalAugmentedPrompt: (context: string, query: string): string => {
    return `Answer the question using ONLY the retrieved documents below.

Retrieved Documents:
${context}

Question: ${query}

Instructions:
1. First, identify which documents are relevant to the question
2. Extract the specific information that answers the question
3. Synthesize an answer using only that information
4. If the documents don't contain the answer, say so explicitly
5. Cite the specific document(s) you're drawing from

Answer:`;
  },
  
  /**
   * Self-Verification Prompt
   */
  selfVerificationPrompt: (response: string, context: string): string => {
    return `Verify this response against the source documents.

RESPONSE TO VERIFY:
${response}

SOURCE DOCUMENTS:
${context}

For each claim in the response:
1. Is it supported by the sources? (YES/NO/PARTIALLY)
2. If not supported, mark it as potentially hallucinated

After analysis:
- If there are unsupported claims, provide a REVISED response that only includes supported information
- If all claims are supported, output "VERIFIED: [original response]"

Output:`;
  },
  
  /**
   * Uncertainty-Aware Generation
   */
  uncertaintyAwarePrompt: (context: string, query: string): string => {
    return `Answer the question based on the context. Express uncertainty appropriately.

Context:
${context}

Question: ${query}

Guidelines:
- For well-supported facts: State directly
- For partially supported claims: Use "likely", "suggests that", "appears to"
- For inferences: Use "this might indicate", "it could be that"
- For unsupported topics: Clearly state the limitation

Respond with appropriate confidence levels:`;
  },
};

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a hallucination detector with configuration
 */
export function createHallucinationDetector(
  tenantId: string,
  options: Partial<HallucinationDetectionConfig> = {}
): HallucinationDetector {
  return new HallucinationDetector({
    tenantId,
    ...options,
  });
}

/**
 * Quick hallucination check
 */
export async function checkForHallucinations(
  response: string,
  context: string | string[],
  tenantId: string = 'default'
): Promise<HallucinationReport> {
  const detector = createHallucinationDetector(tenantId);
  return detector.detect(response, context);
}

export default HallucinationDetector;
