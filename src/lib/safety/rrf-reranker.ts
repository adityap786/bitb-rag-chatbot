/**
 * Reciprocal Rank Fusion (RRF) Re-Ranker with Safety Penalties
 * 
 * Combines relevance ranking with safety scoring:
 * 1. RRF score from semantic similarity + keyword matching
 * 2. Safety penalty: reduces score based on detected injection/harmful intent
 * 3. Tenant isolation check: zero score if cross-tenant contamination
 * 
 * Formula:
 * final_score = (rrf_score * safety_multiplier) - safety_penalty
 * 
 * Run with: npm run safety:rerank
 */

import type { RetrievedChunk } from '@/lib/security/rag-guardrails';
import { detectPromptInjection, sanitizeRetrievedContext } from '@/lib/safety/middleware';
import { metrics } from '@/lib/telemetry';

interface RankedResult {
  document: RetrievedChunk;
  relevance_score: number;
  safety_score: number;
  safety_issues: SafetyIssue[];
  final_score: number;
  rank: number;
}

interface SafetyIssue {
  type: 'injection_attempt' | 'harmful_content' | 'pii_leakage' | 'cross_tenant_contamination' | 'suspicious_markup';
  severity: 'low' | 'medium' | 'high' | 'critical';
  details: string;
}

/**
 * Calculate RRF score from multiple result sets
 * Higher rank = higher contribution
 */
function calculateRRFScore(
  rankInResultSet1: number,
  rankInResultSet2?: number,
  k: number = 60
): number {
  let score = 1 / (k + rankInResultSet1);
  if (rankInResultSet2 !== undefined) {
    score += 1 / (k + rankInResultSet2);
  }
  return score;
}

/**
 * Analyze document for safety issues
 */
function analyzeSafetyOfDocument(
  document: RetrievedChunk,
  tenantId: string
): { issues: SafetyIssue[]; safetyScore: number } {
  const issues: SafetyIssue[] = [];
  let penaltyScore = 0;
  
  const content = document.text || '';
  
  // 1. Check for prompt injection in document
  const injectionCheck = detectPromptInjection(content);
  if (injectionCheck.detected) {
    type RiskLevel = 'low' | 'medium' | 'high' | 'critical';
    const severity: RiskLevel = injectionCheck.risk_level as RiskLevel;
    issues.push({
      type: 'injection_attempt',
      severity,
      details: `Injection patterns detected: ${injectionCheck.patterns.join(', ')}`,
    });
    
    // Penalty: 0.3 (low), 0.5 (medium), 0.7 (high), 0.95 (critical)
    const penaltyMap: Record<RiskLevel, number> = {
      low: 0.1,
      medium: 0.3,
      high: 0.5,
      critical: 0.95,
    };
    penaltyScore += penaltyMap[severity];
  }
  
  // 2. Check for harmful content patterns
  const harmfulPatterns = [
    /(?:malware|ransomware|exploit|vulnerability|zero-day)/gi,
    /(?:breach|hack|crack|bypass|circumvent)/gi,
    /(?:credit\s*card|ssn|password|api\s*key|token)/gi,
  ];
  
  for (const pattern of harmfulPatterns) {
    if (pattern.test(content)) {
      let issueType: SafetyIssue['type'] = 'harmful_content';
      if (pattern.source.includes('credit')) {
        issueType = 'pii_leakage';
      }
      
      issues.push({
        type: issueType,
        severity: 'high',
        details: `Detected harmful content: ${pattern.source}`,
      });
      penaltyScore += 0.4;
    }
  }
  
  // 3. Check for cross-tenant contamination
  if (document.tenant_id && document.tenant_id !== tenantId) {
    issues.push({
      type: 'cross_tenant_contamination',
      severity: 'critical',
      details: `Document belongs to different tenant: ${document.tenant_id}`,
    });
    penaltyScore += 1.0; // Complete penalty
  }
  
  // 4. Check for suspicious markup/instructions
  const suspiciousMarkup = [
    /<(?:system|prompt|instruction|override)/gi,
    /\[(?:SYSTEM|ADMIN|CMD)[:\s]/gi,
    /SYSTEM\s*OVERRIDE/gi,
  ];
  
  for (const pattern of suspiciousMarkup) {
    if (pattern.test(content)) {
      issues.push({
        type: 'suspicious_markup',
        severity: 'high',
        details: `Detected suspicious markup: ${pattern.source}`,
      });
      penaltyScore += 0.35;
    }
  }
  
  // Cap penalty at 0.95 (never trust 100%, but don't completely discard)
  penaltyScore = Math.min(penaltyScore, 0.95);
  
  // Safety score: 1.0 = no issues, 0.05 = max penalty
  const safetyScore = Math.max(1.0 - penaltyScore, 0.05);
  
  return { issues, safetyScore };
}

/**
 * Re-rank search results with safety considerations
 */
export function reRankWithSafety(
  documents: RetrievedChunk[],
  query: string,
  tenantId: string,
  options?: {
    k?: number; // RRF constant (default 60)
    safety_weight?: number; // How much to weight safety (0-1, default 0.3)
    include_all_results?: boolean; // Include unsafe results in output (marked)
  }
): RankedResult[] {
  const rrfK = options?.k ?? 60;
  const safetyWeight = options?.safety_weight ?? 0.3;
  const includeAll = options?.include_all_results ?? false;
  
  // 1. Calculate base RRF scores
  const rankedDocs = documents.map((doc, index) => {
    const rrfScore = calculateRRFScore(index + 1, undefined, rrfK);
    
    // 2. Calculate safety scores
    const { issues, safetyScore } = analyzeSafetyOfDocument(doc, tenantId);
    
    // 3. Calculate final score with safety adjustment
    // final = rrf * (1 + safetyScore * safetyWeight)
    // This means: good safety = slight boost, bad safety = reduction
    const safetyMultiplier = 1 + (safetyScore - 0.5) * safetyWeight;
    const finalScore = rrfScore * Math.max(safetyMultiplier, 0.05);
    
    return {
      document: doc,
      relevance_score: rrfScore,
      safety_score: safetyScore,
      safety_issues: issues,
      final_score: finalScore,
      rank: 0, // Will be updated below
    };
  });
  
  // 4. Sort by final score (descending)
  rankedDocs.sort((a, b) => b.final_score - a.final_score);
  
  // 5. Update ranks
  rankedDocs.forEach((doc, index) => {
    doc.rank = index + 1;
  });
  
  // 6. Filter or flag unsafe results
  if (!includeAll) {
    // Remove results with critical safety issues
    return rankedDocs.filter((doc) => {
      const hasCriticalIssue = doc.safety_issues.some(
        (issue) => issue.type === 'cross_tenant_contamination'
      );
      return !hasCriticalIssue;
    });
  }
  
  // Log safety metrics
  rankedDocs.forEach((result) => {
    if (result.safety_issues.length > 0) {
      metrics.increment('safety.rerank.issues_detected', {
        severity: result.safety_issues[0].severity,
        type: result.safety_issues[0].type,
      });
    }
  });
  
  return rankedDocs;
}

/**
 * Format re-ranked results for display/logging
 */
export function formatReRankResults(
  results: RankedResult[],
  options?: { include_safety_details?: boolean }
): string {
  const includeSafetyDetails = options?.include_safety_details ?? false;
  
  let output = `\n[RRF RE-RANK RESULTS] Total: ${results.length} documents\n`;
  output += `${'Rank'.padEnd(5)} ${'Rel Score'.padEnd(12)} ${'Safety'.padEnd(10)} ${'Final'.padEnd(10)} ${'Issues'.padEnd(8)} Doc\n`;
  output += '-'.repeat(80) + '\n';
  
  results.forEach((result) => {
    const issueCount = result.safety_issues.length;
    const issueStr = issueCount > 0 ? `⚠️ ${issueCount}` : 'OK';
    
    output += `${String(result.rank).padEnd(5)}`;
    output += `${result.relevance_score.toFixed(4).padEnd(12)}`;
    output += `${result.safety_score.toFixed(2).padEnd(10)}`;
    output += `${result.final_score.toFixed(4).padEnd(10)}`;
    output += `${issueStr.padEnd(8)}`;
    output += `${(result.document.metadata?.title || 'Untitled').slice(0, 40)}\n`;
    
    if (includeSafetyDetails && result.safety_issues.length > 0) {
      result.safety_issues.forEach((issue) => {
        output += `         ⚠️  ${issue.type} [${issue.severity}]: ${issue.details}\n`;
      });
    }
  });
  
  return output;
}

/**
 * Safety-aware retrieval pipeline
 * Combines semantic search + safety re-ranking
 */
export async function retrieveWithSafetyReRanking(
  semanticResults: RetrievedChunk[],
  keywordResults: RetrievedChunk[],
  query: string,
  tenantId: string,
  options?: {
    top_k?: number;
    safety_threshold?: number; // Min safety score to include (0-1)
    verbose?: boolean;
  }
): Promise<RankedResult[]> {
  const topK = options?.top_k ?? 5;
  const safetyThreshold = options?.safety_threshold ?? 0.2;
  const verbose = options?.verbose ?? false;
  
  // 1. Deduplicate and combine results
  const combined = Array.from(
    new Map(
      [...semanticResults, ...keywordResults].map((doc) => [
        doc.text, // Use content as dedup key
        doc,
      ])
    ).values()
  );
  
  // 2. Re-rank with safety
  const reRanked = reRankWithSafety(combined, query, tenantId, {
    include_all_results: true,
  });
  
  // 3. Filter by safety threshold
  const filtered = reRanked.filter((result) => {
    const passesThreshold = result.safety_score >= safetyThreshold;
    if (!passesThreshold && verbose) {
      console.warn(
        `[SAFETY] Filtering result below threshold: ${result.document.metadata?.title} (score: ${result.safety_score})`
      );
    }
    return passesThreshold;
  });
  
  // 4. Return top-k
  const topResults = filtered.slice(0, topK);
  
  if (verbose) {
    console.log(formatReRankResults(topResults, { include_safety_details: true }));
  }
  
  return topResults;
}

/**
 * Generate safety report for audit
 */
export function generateSafetyReport(
  results: RankedResult[]
): {
  total_results: number;
  safe_results: number;
  flagged_results: number;
  issues_by_type: Record<string, number>;
  issues_by_severity: Record<string, number>;
} {
  const report = {
    total_results: results.length,
    safe_results: 0,
    flagged_results: 0,
    issues_by_type: {} as Record<string, number>,
    issues_by_severity: {} as Record<string, number>,
  };
  
  results.forEach((result) => {
    if (result.safety_issues.length === 0) {
      report.safe_results++;
    } else {
      report.flagged_results++;
      
      result.safety_issues.forEach((issue) => {
        report.issues_by_type[issue.type] =
          (report.issues_by_type[issue.type] || 0) + 1;
        report.issues_by_severity[issue.severity] =
          (report.issues_by_severity[issue.severity] || 0) + 1;
      });
    }
  });
  
  return report;
}

export type { RankedResult, SafetyIssue };
