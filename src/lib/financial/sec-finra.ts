/**
 * Financial Compliance APIs
 * 
 * Production-ready SEC and FINRA compliance utilities.
 * Features:
 * - SEC EDGAR API integration
 * - FINRA BrokerCheck integration
 * - Compliance checks
 * - Regulatory filings access
 * - Audit trail logging
 */

// SEC EDGAR API
const SEC_EDGAR_BASE = 'https://data.sec.gov';
const SEC_EFTS_BASE = 'https://efts.sec.gov';

// Types
export interface SECFiling {
  accessionNumber: string;
  cik: string;
  companyName: string;
  type: string;
  dateFiled: Date;
  dateOfChange: Date;
  description: string;
  size: number;
  url: string;
  primaryDocument: string;
  primaryDocDescription: string;
}

export interface CompanyInfo {
  cik: string;
  name: string;
  tickers: string[];
  exchanges: string[];
  sic: string;
  sicDescription: string;
  category: string;
  fiscalYearEnd: string;
  stateOfIncorporation: string;
  addresses: {
    business: Address;
    mailing: Address;
  };
  phone: string;
  filings: {
    recent: {
      accessionNumber: string[];
      filingDate: string[];
      form: string[];
      primaryDocument: string[];
      primaryDocDescription: string[];
    };
  };
}

export interface Address {
  street1: string;
  street2?: string;
  city: string;
  stateOrCountry: string;
  zipCode: string;
}

export interface BrokerInfo {
  crd: string;
  name: string;
  registrationStatus: string;
  disclosures: number;
  employmentHistory: Array<{
    firm: string;
    startDate: Date;
    endDate?: Date;
    status: string;
  }>;
  qualifications: string[];
  registrations: Array<{
    state: string;
    status: string;
  }>;
}

export interface ComplianceCheck {
  type: string;
  passed: boolean;
  details: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: Date;
}

export interface AuditLogEntry {
  id: string;
  timestamp: Date;
  action: string;
  userId?: string;
  resourceType: string;
  resourceId: string;
  details: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

// SEC EDGAR Client
export class SECEdgarClient {
  private userAgent: string;

  constructor(email: string) {
    // SEC requires a unique User-Agent with contact email
    this.userAgent = `RAGChatbot/1.0 (${email})`;
  }

  private async request<T>(url: string): Promise<T> {
    const response = await fetch(url, {
      headers: {
        'User-Agent': this.userAgent,
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`SEC EDGAR API error: ${response.status}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Get company information by CIK
   */
  async getCompanyInfo(cik: string): Promise<CompanyInfo> {
    // Pad CIK to 10 digits
    const paddedCik = cik.padStart(10, '0');
    return this.request<CompanyInfo>(
      `${SEC_EDGAR_BASE}/submissions/CIK${paddedCik}.json`
    );
  }

  /**
   * Get company by ticker symbol
   */
  async getCompanyByTicker(ticker: string): Promise<CompanyInfo | null> {
    // First get the CIK from ticker
    const tickerMapping = await this.request<Record<string, { cik_str: string; ticker: string; title: string }>>(
      `${SEC_EDGAR_BASE}/files/company_tickers.json`
    );

    const match = Object.values(tickerMapping).find(
      c => c.ticker.toLowerCase() === ticker.toLowerCase()
    );

    if (!match) return null;

    return this.getCompanyInfo(match.cik_str);
  }

  /**
   * Search filings by full-text search
   */
  async searchFilings(query: string, options?: {
    forms?: string[];
    dateRange?: { start: Date; end: Date };
    limit?: number;
  }): Promise<{
    hits: Array<{
      cik: string;
      companyName: string;
      accessionNumber: string;
      form: string;
      filedAt: string;
      _id: string;
    }>;
    total: number;
  }> {
    const params = new URLSearchParams({ q: query });
    
    if (options?.forms?.length) {
      params.set('forms', options.forms.join(','));
    }
    if (options?.dateRange?.start) {
      params.set('dateRange', 
        `${options.dateRange.start.toISOString().split('T')[0]},${options.dateRange.end?.toISOString().split('T')[0] || ''}`
      );
    }
    if (options?.limit) {
      params.set('from', '0');
      params.set('size', options.limit.toString());
    }

    return this.request<{
      hits: Array<{
        cik: string;
        companyName: string;
        accessionNumber: string;
        form: string;
        filedAt: string;
        _id: string;
      }>;
      total: number;
    }>(`${SEC_EFTS_BASE}/search?${params}`);
  }

  /**
   * Get specific filing document
   */
  async getFiling(cik: string, accessionNumber: string): Promise<string> {
    const paddedCik = cik.padStart(10, '0');
    const formattedAccession = accessionNumber.replace(/-/g, '');
    
    const response = await fetch(
      `${SEC_EDGAR_BASE}/Archives/edgar/data/${paddedCik}/${formattedAccession}/${accessionNumber}.txt`,
      {
        headers: {
          'User-Agent': this.userAgent,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch filing: ${response.status}`);
    }

    return response.text();
  }

  /**
   * Get recent filings for a company
   */
  async getRecentFilings(cik: string, options?: {
    forms?: string[];
    limit?: number;
  }): Promise<SECFiling[]> {
    const company = await this.getCompanyInfo(cik);
    const limit = options?.limit || 10;

    const filings: SECFiling[] = [];
    const recentFilings = company.filings.recent;

    for (let i = 0; i < Math.min(recentFilings.accessionNumber.length, limit * 2); i++) {
      const form = recentFilings.form[i];
      
      // Filter by form type if specified
      if (options?.forms?.length && !options.forms.includes(form)) {
        continue;
      }

      filings.push({
        accessionNumber: recentFilings.accessionNumber[i],
        cik,
        companyName: company.name,
        type: form,
        dateFiled: new Date(recentFilings.filingDate[i]),
        dateOfChange: new Date(recentFilings.filingDate[i]),
        description: recentFilings.primaryDocDescription[i],
        size: 0,
        url: this.buildFilingUrl(cik, recentFilings.accessionNumber[i], recentFilings.primaryDocument[i]),
        primaryDocument: recentFilings.primaryDocument[i],
        primaryDocDescription: recentFilings.primaryDocDescription[i],
      });

      if (filings.length >= limit) break;
    }

    return filings;
  }

  private buildFilingUrl(cik: string, accessionNumber: string, primaryDocument: string): string {
    const paddedCik = cik.padStart(10, '0');
    const formattedAccession = accessionNumber.replace(/-/g, '');
    return `${SEC_EDGAR_BASE}/Archives/edgar/data/${paddedCik}/${formattedAccession}/${primaryDocument}`;
  }
}

// Financial Compliance Service
export class FinancialComplianceService {
  private secClient: SECEdgarClient;
  private auditLog: AuditLogEntry[] = [];

  constructor(secContactEmail: string) {
    this.secClient = new SECEdgarClient(secContactEmail);
  }

  /**
   * Check if a transaction is compliant
   */
  checkTransactionCompliance(
    amount: number,
    type: 'buy' | 'sell' | 'transfer',
    userId: string,
    metadata?: Record<string, unknown>
  ): ComplianceCheck[] {
    const checks: ComplianceCheck[] = [];
    const timestamp = new Date();

    // Check 1: Transaction amount limits
    if (amount > 10000) {
      checks.push({
        type: 'CTR_REQUIREMENT',
        passed: false,
        details: 'Transaction exceeds $10,000 and requires Currency Transaction Report (CTR)',
        severity: 'high',
        timestamp,
      });
    } else {
      checks.push({
        type: 'CTR_REQUIREMENT',
        passed: true,
        details: 'Transaction does not require CTR',
        severity: 'low',
        timestamp,
      });
    }

    // Check 2: Suspicious Activity Report threshold
    if (amount >= 5000 && this.checkForStructuring(userId, amount)) {
      checks.push({
        type: 'SAR_POTENTIAL',
        passed: false,
        details: 'Potential structuring detected - SAR may be required',
        severity: 'critical',
        timestamp,
      });
    }

    // Check 3: Wire transfer requirements
    if (type === 'transfer' && amount >= 3000) {
      checks.push({
        type: 'WIRE_TRANSFER_RECORD',
        passed: true,
        details: 'Wire transfer requires additional record keeping per BSA requirements',
        severity: 'medium',
        timestamp,
      });
    }

    // Log the compliance check
    this.addAuditLog({
      id: this.generateId(),
      timestamp,
      action: 'COMPLIANCE_CHECK',
      userId,
      resourceType: 'transaction',
      resourceId: this.generateId(),
      details: {
        amount,
        type,
        checks: checks.map(c => ({ type: c.type, passed: c.passed })),
        ...metadata,
      },
    });

    return checks;
  }

  /**
   * Check for pattern day trading
   */
  checkPatternDayTrading(
    userId: string,
    trades: Array<{ type: 'buy' | 'sell'; date: Date; symbol: string }>
  ): ComplianceCheck {
    const timestamp = new Date();
    const fiveBusinessDays = 5;
    
    // Count day trades in last 5 business days
    const dayTrades = this.countDayTrades(trades);

    if (dayTrades >= 4) {
      return {
        type: 'PATTERN_DAY_TRADER',
        passed: false,
        details: `User has executed ${dayTrades} day trades in 5 business days. Pattern Day Trader rules apply - minimum $25,000 equity required.`,
        severity: 'high',
        timestamp,
      };
    }

    return {
      type: 'PATTERN_DAY_TRADER',
      passed: true,
      details: `User has ${dayTrades} day trades in 5 business days (limit: 4)`,
      severity: 'low',
      timestamp,
    };
  }

  /**
   * Verify accredited investor status
   */
  verifyAccreditedInvestor(criteria: {
    income?: { current: number; previous: number };
    netWorth?: number;
    professionalCertifications?: string[];
    entityType?: 'individual' | 'trust' | 'company';
    entityAssets?: number;
  }): ComplianceCheck {
    const timestamp = new Date();

    // Individual income test: $200K/year for 2 years
    if (criteria.income && 
        criteria.income.current >= 200000 && 
        criteria.income.previous >= 200000) {
      return {
        type: 'ACCREDITED_INVESTOR',
        passed: true,
        details: 'Qualified as accredited investor based on income ($200K+ for 2 consecutive years)',
        severity: 'low',
        timestamp,
      };
    }

    // Net worth test: $1M excluding primary residence
    if (criteria.netWorth && criteria.netWorth >= 1000000) {
      return {
        type: 'ACCREDITED_INVESTOR',
        passed: true,
        details: 'Qualified as accredited investor based on net worth ($1M+ excluding primary residence)',
        severity: 'low',
        timestamp,
      };
    }

    // Professional certification test
    const qualifyingCerts = ['Series 7', 'Series 65', 'Series 82'];
    if (criteria.professionalCertifications?.some(c => qualifyingCerts.includes(c))) {
      return {
        type: 'ACCREDITED_INVESTOR',
        passed: true,
        details: 'Qualified as accredited investor based on professional certification',
        severity: 'low',
        timestamp,
      };
    }

    // Entity test: $5M in assets
    if (criteria.entityType && criteria.entityAssets && criteria.entityAssets >= 5000000) {
      return {
        type: 'ACCREDITED_INVESTOR',
        passed: true,
        details: `Qualified as accredited investor: ${criteria.entityType} with $5M+ in assets`,
        severity: 'low',
        timestamp,
      };
    }

    return {
      type: 'ACCREDITED_INVESTOR',
      passed: false,
      details: 'Does not meet accredited investor criteria',
      severity: 'medium',
      timestamp,
    };
  }

  /**
   * Generate required disclaimers
   */
  getDisclaimers(context: {
    hasInvestmentAdvice: boolean;
    hasForwardLooking: boolean;
    productTypes?: string[];
    jurisdiction?: string;
  }): string[] {
    const disclaimers: string[] = [];

    // Standard investment disclaimer
    if (context.hasInvestmentAdvice) {
      disclaimers.push(
        'INVESTMENT DISCLAIMER: The information provided does not constitute investment advice, financial advice, trading advice, or any other sort of advice. You should not treat any of the content as such. Past performance is not indicative of future results.'
      );
    }

    // Forward-looking statements disclaimer
    if (context.hasForwardLooking) {
      disclaimers.push(
        'FORWARD-LOOKING STATEMENTS: This content contains forward-looking statements that involve risks and uncertainties. Actual results may differ materially from those expressed or implied.'
      );
    }

    // Product-specific disclaimers
    if (context.productTypes?.includes('crypto')) {
      disclaimers.push(
        'CRYPTOCURRENCY RISK: Cryptocurrency investments are highly volatile and speculative. You could lose some or all of your investment.'
      );
    }

    if (context.productTypes?.includes('options')) {
      disclaimers.push(
        'OPTIONS RISK: Options involve risk and are not suitable for all investors. Prior to buying or selling an option, a person must receive a copy of "Characteristics and Risks of Standardized Options."'
      );
    }

    if (context.productTypes?.includes('margin')) {
      disclaimers.push(
        'MARGIN RISK: Margin trading involves interest charges and heightened risks, including the potential to lose more than deposited funds.'
      );
    }

    return disclaimers;
  }

  /**
   * Get SEC company and filings
   */
  async getSECCompanyInfo(tickerOrCik: string): Promise<{
    company: CompanyInfo;
    recentFilings: SECFiling[];
  }> {
    let company: CompanyInfo;

    if (/^\d+$/.test(tickerOrCik)) {
      company = await this.secClient.getCompanyInfo(tickerOrCik);
    } else {
      const result = await this.secClient.getCompanyByTicker(tickerOrCik);
      if (!result) {
        throw new Error(`Company not found: ${tickerOrCik}`);
      }
      company = result;
    }

    const recentFilings = await this.secClient.getRecentFilings(company.cik, {
      forms: ['10-K', '10-Q', '8-K', 'DEF 14A'],
      limit: 10,
    });

    return { company, recentFilings };
  }

  /**
   * Get audit log entries
   */
  getAuditLog(options?: {
    userId?: string;
    action?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }): AuditLogEntry[] {
    let entries = [...this.auditLog];

    if (options?.userId) {
      entries = entries.filter(e => e.userId === options.userId);
    }
    if (options?.action) {
      entries = entries.filter(e => e.action === options.action);
    }
    if (options?.startDate) {
      entries = entries.filter(e => e.timestamp >= options.startDate!);
    }
    if (options?.endDate) {
      entries = entries.filter(e => e.timestamp <= options.endDate!);
    }

    entries.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    if (options?.limit) {
      entries = entries.slice(0, options.limit);
    }

    return entries;
  }

  // Private helpers
  private checkForStructuring(userId: string, amount: number): boolean {
    // Check for potential structuring (breaking up transactions to avoid reporting)
    const recentTransactions = this.auditLog.filter(
      e => e.userId === userId && 
           e.resourceType === 'transaction' &&
           e.timestamp > new Date(Date.now() - 24 * 60 * 60 * 1000)
    );

    // If multiple transactions just under reporting threshold
    const totalAmount = recentTransactions.reduce(
      (sum, t) => sum + ((t.details['amount'] as number) || 0),
      amount
    );

    return totalAmount >= 10000 && recentTransactions.length >= 2;
  }

  private countDayTrades(trades: Array<{ type: 'buy' | 'sell'; date: Date; symbol: string }>): number {
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    const recentTrades = trades.filter(t => t.date >= fiveDaysAgo);

    // Group by symbol and date
    const tradesBySymbolAndDate = new Map<string, { buys: number; sells: number }>();

    for (const trade of recentTrades) {
      const key = `${trade.symbol}-${trade.date.toDateString()}`;
      const current = tradesBySymbolAndDate.get(key) || { buys: 0, sells: 0 };
      
      if (trade.type === 'buy') current.buys++;
      else current.sells++;
      
      tradesBySymbolAndDate.set(key, current);
    }

    // Count day trades (same-day buy and sell)
    let dayTrades = 0;
    for (const { buys, sells } of tradesBySymbolAndDate.values()) {
      dayTrades += Math.min(buys, sells);
    }

    return dayTrades;
  }

  private addAuditLog(entry: AuditLogEntry): void {
    this.auditLog.push(entry);
    
    // Keep only last 10000 entries
    if (this.auditLog.length > 10000) {
      this.auditLog = this.auditLog.slice(-10000);
    }
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
}

// Legacy exports for backwards compatibility
export function getFinancialDisclaimer(): string {
  return 'This AI assistant does not provide financial advice. For investment or banking decisions, consult a licensed financial advisor.';
}

export function checkTransaction(amount: number): {
  disclaimer: string;
  compliance: boolean;
  transactionStatus?: string;
} {
  if (amount > 10000) {
    return {
      disclaimer: getFinancialDisclaimer(),
      compliance: false,
      transactionStatus: 'Transaction exceeds compliance limit. CTR required.',
    };
  }
  return {
    disclaimer: getFinancialDisclaimer(),
    compliance: true,
    transactionStatus: 'Transaction approved.',
  };
}

export default FinancialComplianceService;
