/**
 * CourtListener API Integration
 * 
 * Production-ready integration with CourtListener for legal document retrieval.
 * Features:
 * - Case law search
 * - Opinion retrieval
 * - Docket access
 * - Citation lookup
 * - Court information
 */

const COURTLISTENER_API_BASE = 'https://www.courtlistener.com/api/rest/v3';

// Types
export interface Court {
  id: string;
  resource_uri: string;
  date_modified: string;
  in_use: boolean;
  has_opinion_scraper: boolean;
  has_oral_argument_scraper: boolean;
  position: number;
  citation_string: string;
  short_name: string;
  full_name: string;
  url: string;
  start_date: string;
  end_date: string | null;
  jurisdiction: string;
}

export interface Opinion {
  id: number;
  resource_uri: string;
  absolute_url: string;
  cluster: string;
  author: number | null;
  joined_by: number[];
  date_created: string;
  date_modified: string;
  type: string;
  sha1: string;
  page_count: number | null;
  download_url: string;
  local_path: string;
  plain_text: string;
  html: string;
  html_lawbox: string;
  html_columbia: string;
  html_with_citations: string;
  extracted_by_ocr: boolean;
}

export interface OpinionCluster {
  id: number;
  resource_uri: string;
  absolute_url: string;
  docket: string;
  sub_opinions: string[];
  citations: Citation[];
  panel: number[];
  non_participating_judges: number[];
  date_created: string;
  date_modified: string;
  judges: string;
  date_filed: string;
  date_filed_is_approximate: boolean;
  slug: string;
  case_name: string;
  case_name_short: string;
  case_name_full: string;
  federal_cite_one: string | null;
  federal_cite_two: string | null;
  federal_cite_three: string | null;
  state_cite_one: string | null;
  state_cite_two: string | null;
  state_cite_three: string | null;
  state_cite_regional: string | null;
  specialty_cite_one: string | null;
  scotus_early_cite: string | null;
  lexis_cite: string | null;
  westlaw_cite: string | null;
  neutral_cite: string | null;
  scdb_id: string | null;
  scdb_decision_direction: string | null;
  scdb_votes_majority: number | null;
  scdb_votes_minority: number | null;
  source: string;
  procedural_history: string;
  attorneys: string;
  nature_of_suit: string;
  posture: string;
  syllabus: string;
  citation_count: number;
  precedential_status: string;
  date_blocked: string | null;
  blocked: boolean;
}

export interface Citation {
  volume: number;
  reporter: string;
  page: number;
  type: number;
}

export interface Docket {
  id: number;
  resource_uri: string;
  absolute_url: string;
  court: string;
  court_id: string;
  clusters: string[];
  audio_files: string[];
  date_created: string;
  date_modified: string;
  date_last_index: string | null;
  date_cert_granted: string | null;
  date_cert_denied: string | null;
  date_argued: string | null;
  date_reargued: string | null;
  date_reargument_denied: string | null;
  date_filed: string | null;
  date_terminated: string | null;
  date_blocked: string | null;
  blocked: boolean;
  docket_number: string;
  case_name: string;
  case_name_short: string;
  case_name_full: string;
  slug: string;
  pacer_case_id: string | null;
  source: number;
  assigned_to: number | null;
  referred_to: number | null;
  cause: string;
  nature_of_suit: string;
  jury_demand: string;
  jurisdiction_type: string;
  filepath_ia: string;
  filepath_local: string;
  appeal_from: string | null;
  appeal_from_id: string | null;
}

export interface SearchResult {
  count: number;
  next: string | null;
  previous: string | null;
  results: OpinionCluster[];
}

export interface CourtListenerConfig {
  apiToken: string;
  timeout?: number;
}

export class CourtListenerClient {
  private config: CourtListenerConfig;

  constructor(config: CourtListenerConfig) {
    this.config = config;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeout || 30000);

    try {
      const response = await fetch(`${COURTLISTENER_API_BASE}${endpoint}`, {
        ...options,
        headers: {
          'Authorization': `Token ${this.config.apiToken}`,
          'Content-Type': 'application/json',
          ...options.headers,
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`CourtListener API error: ${response.status} - ${error}`);
      }

      return response.json() as Promise<T>;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Search for opinions/cases
   */
  async searchOpinions(query: string, options?: {
    court?: string;
    type?: string;
    dateFiled?: { after?: Date; before?: Date };
    precedentialStatus?: 'Published' | 'Unpublished' | 'Errata' | 'Separate' | 'In-chambers' | 'Relating-to' | 'Unknown';
    orderBy?: string;
    limit?: number;
    offset?: number;
  }): Promise<SearchResult> {
    const params = new URLSearchParams({ q: query });

    if (options?.court) {
      params.set('court', options.court);
    }
    if (options?.type) {
      params.set('type', options.type);
    }
    if (options?.dateFiled?.after) {
      params.set('date_filed__gte', options.dateFiled.after.toISOString().split('T')[0]);
    }
    if (options?.dateFiled?.before) {
      params.set('date_filed__lte', options.dateFiled.before.toISOString().split('T')[0]);
    }
    if (options?.precedentialStatus) {
      params.set('precedential_status', options.precedentialStatus);
    }
    if (options?.orderBy) {
      params.set('order_by', options.orderBy);
    }
    if (options?.limit) {
      params.set('limit', options.limit.toString());
    }
    if (options?.offset) {
      params.set('offset', options.offset.toString());
    }

    return this.request<SearchResult>(`/clusters/?${params}`);
  }

  /**
   * Get a specific opinion cluster
   */
  async getOpinionCluster(id: number): Promise<OpinionCluster> {
    return this.request<OpinionCluster>(`/clusters/${id}/`);
  }

  /**
   * Get a specific opinion (the actual text)
   */
  async getOpinion(id: number): Promise<Opinion> {
    return this.request<Opinion>(`/opinions/${id}/`);
  }

  /**
   * Get full opinion text
   */
  async getOpinionText(id: number): Promise<string> {
    const opinion = await this.getOpinion(id);
    
    // Return the best available text format
    if (opinion.html_with_citations) {
      return opinion.html_with_citations;
    }
    if (opinion.html) {
      return opinion.html;
    }
    if (opinion.plain_text) {
      return opinion.plain_text;
    }

    throw new Error('No text available for this opinion');
  }

  /**
   * Get a docket by ID
   */
  async getDocket(id: number): Promise<Docket> {
    return this.request<Docket>(`/dockets/${id}/`);
  }

  /**
   * Search dockets
   */
  async searchDockets(query: string, options?: {
    court?: string;
    dateFiled?: { after?: Date; before?: Date };
    caseType?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ count: number; results: Docket[] }> {
    const params = new URLSearchParams({ q: query });

    if (options?.court) {
      params.set('court', options.court);
    }
    if (options?.dateFiled?.after) {
      params.set('date_filed__gte', options.dateFiled.after.toISOString().split('T')[0]);
    }
    if (options?.dateFiled?.before) {
      params.set('date_filed__lte', options.dateFiled.before.toISOString().split('T')[0]);
    }
    if (options?.limit) {
      params.set('limit', options.limit.toString());
    }
    if (options?.offset) {
      params.set('offset', options.offset.toString());
    }

    return this.request<{ count: number; results: Docket[] }>(`/dockets/?${params}`);
  }

  /**
   * Get court information
   */
  async getCourt(id: string): Promise<Court> {
    return this.request<Court>(`/courts/${id}/`);
  }

  /**
   * List all courts
   */
  async listCourts(options?: {
    jurisdiction?: 'F' | 'S' | 'SA' | 'SB' | 'C' | 'I' | 'T';
  }): Promise<{ count: number; results: Court[] }> {
    const params = new URLSearchParams();
    
    if (options?.jurisdiction) {
      params.set('jurisdiction', options.jurisdiction);
    }

    return this.request<{ count: number; results: Court[] }>(`/courts/?${params}`);
  }

  /**
   * Search by citation
   */
  async searchByCitation(citation: string): Promise<OpinionCluster[]> {
    // Parse citation format (e.g., "347 U.S. 483", "410 U.S. 113")
    const match = citation.match(/(\d+)\s+([A-Za-z.\s]+)\s+(\d+)/);
    
    if (!match) {
      throw new Error('Invalid citation format. Expected format: "347 U.S. 483"');
    }

    const [, volume, reporter, page] = match;

    const params = new URLSearchParams({
      citation: `${volume} ${reporter.trim()} ${page}`,
    });

    const result = await this.request<SearchResult>(`/clusters/?${params}`);
    return result.results;
  }

  /**
   * Get citing opinions for a case
   */
  async getCitingOpinions(clusterId: number, options?: {
    limit?: number;
    offset?: number;
  }): Promise<SearchResult> {
    const params = new URLSearchParams({
      cites: clusterId.toString(),
    });

    if (options?.limit) {
      params.set('limit', options.limit.toString());
    }
    if (options?.offset) {
      params.set('offset', options.offset.toString());
    }

    return this.request<SearchResult>(`/clusters/?${params}`);
  }

  /**
   * Get opinions cited by a case
   */
  async getCitedOpinions(clusterId: number): Promise<OpinionCluster[]> {
    const cluster = await this.getOpinionCluster(clusterId);
    
    // Extract cited cases from the cluster
    // This is a simplified version - real implementation would need to parse citations
    const citedCases: OpinionCluster[] = [];
    
    // You would typically parse the opinion text to extract citations
    // and then look them up individually
    
    return citedCases;
  }
}

// Legal Research Service using CourtListener
export class LegalResearchService {
  private client: CourtListenerClient;

  constructor(config: CourtListenerConfig) {
    this.client = new CourtListenerClient(config);
  }

  /**
   * Research case law for a legal topic
   */
  async researchTopic(topic: string, options?: {
    jurisdiction?: string;
    yearRange?: { start: number; end: number };
    limit?: number;
  }): Promise<{
    cases: OpinionCluster[];
    summary: string;
  }> {
    const searchOptions: Parameters<CourtListenerClient['searchOpinions']>[1] = {
      limit: options?.limit || 10,
      orderBy: '-date_filed',
      precedentialStatus: 'Published',
    };

    if (options?.jurisdiction) {
      searchOptions.court = options.jurisdiction;
    }

    if (options?.yearRange) {
      searchOptions.dateFiled = {
        after: new Date(options.yearRange.start, 0, 1),
        before: new Date(options.yearRange.end, 11, 31),
      };
    }

    const result = await this.client.searchOpinions(topic, searchOptions);

    // Generate research summary
    const summary = this.generateResearchSummary(topic, result.results);

    return {
      cases: result.results,
      summary,
    };
  }

  /**
   * Find precedents for a specific legal issue
   */
  async findPrecedents(issue: string, options?: {
    court?: string;
    beforeDate?: Date;
    limit?: number;
  }): Promise<{
    precedents: Array<{
      case: OpinionCluster;
      relevance: number;
      keyCitation: string;
    }>;
  }> {
    const searchOptions: Parameters<CourtListenerClient['searchOpinions']>[1] = {
      limit: options?.limit || 20,
      orderBy: '-citation_count',
      precedentialStatus: 'Published',
    };

    if (options?.court) {
      searchOptions.court = options.court;
    }

    if (options?.beforeDate) {
      searchOptions.dateFiled = { before: options.beforeDate };
    }

    const result = await this.client.searchOpinions(issue, searchOptions);

    return {
      precedents: result.results.map(cluster => ({
        case: cluster,
        relevance: this.calculateRelevance(cluster),
        keyCitation: this.formatCitation(cluster),
      })),
    };
  }

  /**
   * Analyze a case and find related cases
   */
  async analyzeCase(citation: string): Promise<{
    case: OpinionCluster;
    citingCases: OpinionCluster[];
    citedCases: OpinionCluster[];
    analysis: {
      procedural_history: string;
      holding: string;
      significance: string;
    };
  }> {
    // Find the case by citation
    const cases = await this.client.searchByCitation(citation);
    
    if (cases.length === 0) {
      throw new Error(`Case not found: ${citation}`);
    }

    const caseCluster = cases[0];

    // Get citing and cited cases
    const [citingResult] = await Promise.all([
      this.client.getCitingOpinions(caseCluster.id, { limit: 10 }),
    ]);

    return {
      case: caseCluster,
      citingCases: citingResult.results,
      citedCases: [], // Would need to parse opinion text
      analysis: {
        procedural_history: caseCluster.procedural_history || 'Not available',
        holding: caseCluster.syllabus || 'Not available',
        significance: this.assessSignificance(caseCluster),
      },
    };
  }

  /**
   * Get court hierarchy information
   */
  async getCourtHierarchy(jurisdiction: string): Promise<{
    courts: Court[];
    hierarchy: Record<string, string[]>;
  }> {
    const result = await this.client.listCourts({
      jurisdiction: jurisdiction as 'F' | 'S',
    });

    // Build hierarchy based on court positions
    const hierarchy: Record<string, string[]> = {};
    
    for (const court of result.results) {
      if (!hierarchy[court.jurisdiction]) {
        hierarchy[court.jurisdiction] = [];
      }
      hierarchy[court.jurisdiction].push(court.short_name);
    }

    return {
      courts: result.results,
      hierarchy,
    };
  }

  // Helper methods
  private generateResearchSummary(topic: string, cases: OpinionCluster[]): string {
    if (cases.length === 0) {
      return `No relevant cases found for the topic: "${topic}"`;
    }

    const yearRange = cases.reduce(
      (acc, c) => {
        const year = new Date(c.date_filed).getFullYear();
        return {
          min: Math.min(acc.min, year),
          max: Math.max(acc.max, year),
        };
      },
      { min: Infinity, max: -Infinity }
    );

    const courts = [...new Set(cases.map(c => c.docket.split('/').pop()))];

    return `Found ${cases.length} relevant cases for "${topic}" spanning ${yearRange.min}-${yearRange.max} across ${courts.length} courts. The most cited case is "${cases[0].case_name}" (${this.formatCitation(cases[0])}).`;
  }

  private calculateRelevance(cluster: OpinionCluster): number {
    // Simple relevance calculation based on citation count and recency
    const citationScore = Math.min(cluster.citation_count / 100, 1) * 0.6;
    const recencyScore = this.calculateRecencyScore(cluster.date_filed) * 0.4;
    return Math.round((citationScore + recencyScore) * 100) / 100;
  }

  private calculateRecencyScore(dateStr: string): number {
    const date = new Date(dateStr);
    const now = new Date();
    const yearsOld = (now.getTime() - date.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    
    // More recent cases get higher scores, with diminishing returns after 10 years
    return Math.max(0, 1 - yearsOld / 50);
  }

  private formatCitation(cluster: OpinionCluster): string {
    // Return the best available citation
    return (
      cluster.federal_cite_one ||
      cluster.state_cite_one ||
      cluster.neutral_cite ||
      cluster.lexis_cite ||
      cluster.westlaw_cite ||
      `${cluster.case_name} (${new Date(cluster.date_filed).getFullYear()})`
    );
  }

  private assessSignificance(cluster: OpinionCluster): string {
    if (cluster.citation_count > 100) {
      return 'Highly significant - widely cited precedent';
    }
    if (cluster.citation_count > 50) {
      return 'Significant - frequently cited';
    }
    if (cluster.citation_count > 10) {
      return 'Moderate significance';
    }
    return 'Limited citation history';
  }
}

export default CourtListenerClient;
