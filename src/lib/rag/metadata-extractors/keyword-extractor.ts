/**
 * KeywordExtractor - Production-grade keyword extraction
 * 
 * Features:
 * - TF-IDF based keyword scoring
 * - RAKE algorithm for phrase extraction
 * - Multi-language stopword filteringp
 * - Configurable extraction parameters
 * - Batch processing support
 * 
 * @module metadata-extractors/keyword-extractor
 */

import { logger } from '../../observability/logger';

// Stopwords for common languages
const STOPWORDS: Record<string, Set<string>> = {
  en: new Set([
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'he',
    'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the', 'to', 'was', 'were',
    'will', 'with', 'the', 'this', 'but', 'they', 'have', 'had', 'what', 'when',
    'where', 'who', 'which', 'why', 'how', 'all', 'each', 'every', 'both', 'few',
    'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own',
    'same', 'so', 'than', 'too', 'very', 'just', 'can', 'could', 'may', 'might',
    'must', 'shall', 'should', 'would', 'i', 'me', 'my', 'myself', 'we', 'our',
    'ours', 'ourselves', 'you', 'your', 'yours', 'yourself', 'yourselves', 'him',
    'his', 'himself', 'she', 'her', 'hers', 'herself', 'its', 'itself', 'them',
    'their', 'theirs', 'themselves', 'am', 'been', 'being', 'do', 'does', 'did',
    'doing', 'would', 'could', 'should', 'might', 'must', 'need', 'dare', 'ought',
    'used', 'also', 'back', 'even', 'still', 'way', 'well', 'new', 'now', 'old',
    'see', 'time', 'very', 'when', 'come', 'made', 'find', 'here', 'many', 'then',
  ]),
};

export interface KeywordExtractorOptions {
  /** Maximum number of keywords to extract (default: 10) */
  maxKeywords?: number;
  /** Minimum word length to consider (default: 3) */
  minWordLength?: number;
  /** Language for stopword filtering (default: 'en') */
  language?: string;
  /** Include relevance scores in output (default: true) */
  includeScores?: boolean;
  /** Enable phrase extraction using RAKE (default: true) */
  enablePhrases?: boolean;
  /** Maximum phrase length in words (default: 3) */
  maxPhraseLength?: number;
  /** Minimum frequency for a keyword (default: 1) */
  minFrequency?: number;
}

export interface ExtractedKeyword {
  /** The keyword or phrase */
  keyword: string;
  /** Relevance score (higher = more relevant) */
  score: number;
  /** Frequency in the document */
  frequency: number;
  /** Whether this is a phrase (multiple words) */
  isPhrase: boolean;
}

interface WordStats {
  frequency: number;
  positions: number[];
  documentFrequency?: number;
}

export class KeywordExtractor {
  private readonly maxKeywords: number;
  private readonly minWordLength: number;
  private readonly language: string;
  private readonly includeScores: boolean;
  private readonly enablePhrases: boolean;
  private readonly maxPhraseLength: number;
  private readonly minFrequency: number;
  private readonly stopwords: Set<string>;

  constructor(options: KeywordExtractorOptions = {}) {
    this.maxKeywords = options.maxKeywords ?? 10;
    this.minWordLength = options.minWordLength ?? 3;
    this.language = options.language ?? 'en';
    this.includeScores = options.includeScores ?? true;
    this.enablePhrases = options.enablePhrases ?? true;
    this.maxPhraseLength = options.maxPhraseLength ?? 3;
    this.minFrequency = options.minFrequency ?? 1;
    this.stopwords = STOPWORDS[this.language] || STOPWORDS['en'];
  }

  /**
   * Extract keywords from a single text
   */
  async extract(text: string): Promise<ExtractedKeyword[]> {
    const startTime = Date.now();

    try {
      if (!text || text.trim().length === 0) {
        return [];
      }

      // Tokenize and clean text
      const words = this.tokenize(text);
      
      // Calculate word statistics
      const wordStats = this.calculateWordStats(words);
      
      // Calculate TF-IDF scores for single words
      const wordScores = this.calculateTFIDF(wordStats, words.length);
      
      // Extract phrases using RAKE if enabled
      let phraseScores: Map<string, { score: number; frequency: number }> = new Map();
      if (this.enablePhrases) {
        phraseScores = this.extractPhrasesRAKE(text);
      }

      // Combine and rank keywords
      const keywords = this.combineAndRank(wordScores, phraseScores);

      logger.debug('Keyword extraction complete', {
        inputLength: text.length,
        keywordCount: keywords.length,
        processingTimeMs: Date.now() - startTime,
      });

      return keywords.slice(0, this.maxKeywords);
    } catch (error) {
      logger.error('Keyword extraction failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Extract keywords from multiple texts in batch
   */
  async extractBatch(texts: string[]): Promise<ExtractedKeyword[][]> {
    const results: ExtractedKeyword[][] = [];
    
    // Calculate document frequency for IDF
    const documentFrequency = this.calculateDocumentFrequency(texts);

    for (const text of texts) {
      const keywords = await this.extractWithIDF(text, documentFrequency, texts.length);
      results.push(keywords);
    }

    return results;
  }

  /**
   * Extract with pre-calculated IDF values
   */
  private async extractWithIDF(
    text: string,
    documentFrequency: Map<string, number>,
    totalDocs: number
  ): Promise<ExtractedKeyword[]> {
    if (!text || text.trim().length === 0) {
      return [];
    }

    const words = this.tokenize(text);
    const wordStats = this.calculateWordStats(words);
    const wordScores = this.calculateTFIDFWithDF(wordStats, words.length, documentFrequency, totalDocs);

    let phraseScores: Map<string, { score: number; frequency: number }> = new Map();
    if (this.enablePhrases) {
      phraseScores = this.extractPhrasesRAKE(text);
    }

    const keywords = this.combineAndRank(wordScores, phraseScores);
    return keywords.slice(0, this.maxKeywords);
  }

  /**
   * Tokenize text into words
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => 
        word.length >= this.minWordLength &&
        !this.stopwords.has(word) &&
        !/^\d+$/.test(word) // Exclude pure numbers
      );
  }

  /**
   * Calculate word frequency and positions
   */
  private calculateWordStats(words: string[]): Map<string, WordStats> {
    const stats = new Map<string, WordStats>();

    words.forEach((word, position) => {
      if (stats.has(word)) {
        const existing = stats.get(word)!;
        existing.frequency++;
        existing.positions.push(position);
      } else {
        stats.set(word, {
          frequency: 1,
          positions: [position],
        });
      }
    });

    return stats;
  }

  /**
   * Calculate TF-IDF scores
   */
  private calculateTFIDF(
    wordStats: Map<string, WordStats>,
    totalWords: number
  ): Map<string, { score: number; frequency: number }> {
    const scores = new Map<string, { score: number; frequency: number }>();

    wordStats.forEach((stats, word) => {
      if (stats.frequency < this.minFrequency) return;

      // Term Frequency (normalized)
      const tf = stats.frequency / totalWords;
      
      // Inverse Document Frequency (approximation for single doc)
      // Use position-based weighting: words appearing early are more important
      const avgPosition = stats.positions.reduce((a, b) => a + b, 0) / stats.positions.length;
      const positionWeight = 1 / (1 + Math.log(1 + avgPosition / totalWords));
      
      // Combined score
      const score = tf * positionWeight * Math.log(1 + stats.frequency);

      scores.set(word, {
        score,
        frequency: stats.frequency,
      });
    });

    return scores;
  }

  /**
   * Calculate TF-IDF with document frequency
   */
  private calculateTFIDFWithDF(
    wordStats: Map<string, WordStats>,
    totalWords: number,
    documentFrequency: Map<string, number>,
    totalDocs: number
  ): Map<string, { score: number; frequency: number }> {
    const scores = new Map<string, { score: number; frequency: number }>();

    wordStats.forEach((stats, word) => {
      if (stats.frequency < this.minFrequency) return;

      const tf = stats.frequency / totalWords;
      const df = documentFrequency.get(word) || 1;
      const idf = Math.log((totalDocs + 1) / (df + 1)) + 1;
      const score = tf * idf;

      scores.set(word, {
        score,
        frequency: stats.frequency,
      });
    });

    return scores;
  }

  /**
   * Calculate document frequency across corpus
   */
  private calculateDocumentFrequency(texts: string[]): Map<string, number> {
    const df = new Map<string, number>();

    texts.forEach(text => {
      const uniqueWords = new Set(this.tokenize(text));
      uniqueWords.forEach(word => {
        df.set(word, (df.get(word) || 0) + 1);
      });
    });

    return df;
  }

  /**
   * Extract phrases using RAKE algorithm
   * Rapid Automatic Keyword Extraction
   */
  private extractPhrasesRAKE(text: string): Map<string, { score: number; frequency: number }> {
    const phrases = new Map<string, { score: number; frequency: number }>();

    // Split into sentences
    const sentences = text.split(/[.!?;:\n]+/);

    // Extract candidate phrases (sequences of words between stopwords)
    const candidatePhrases: string[] = [];

    sentences.forEach(sentence => {
      const words = sentence.toLowerCase().split(/\s+/);
      let currentPhrase: string[] = [];

      words.forEach(word => {
        const cleanWord = word.replace(/[^\w]/g, '');
        
        if (this.stopwords.has(cleanWord) || cleanWord.length < this.minWordLength) {
          if (currentPhrase.length > 0 && currentPhrase.length <= this.maxPhraseLength) {
            candidatePhrases.push(currentPhrase.join(' '));
          }
          currentPhrase = [];
        } else if (cleanWord.length >= this.minWordLength) {
          currentPhrase.push(cleanWord);
        }
      });

      if (currentPhrase.length > 0 && currentPhrase.length <= this.maxPhraseLength) {
        candidatePhrases.push(currentPhrase.join(' '));
      }
    });

    // Calculate word scores for RAKE
    const wordFreq = new Map<string, number>();
    const wordDegree = new Map<string, number>();

    candidatePhrases.forEach(phrase => {
      const words = phrase.split(' ');
      const degree = words.length - 1;

      words.forEach(word => {
        wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
        wordDegree.set(word, (wordDegree.get(word) || 0) + degree);
      });
    });

    // Calculate word scores (degree / frequency)
    const wordScores = new Map<string, number>();
    wordFreq.forEach((freq, word) => {
      const degree = wordDegree.get(word) || 0;
      wordScores.set(word, (degree + freq) / freq);
    });

    // Calculate phrase scores
    const phraseFreq = new Map<string, number>();
    candidatePhrases.forEach(phrase => {
      phraseFreq.set(phrase, (phraseFreq.get(phrase) || 0) + 1);
    });

    phraseFreq.forEach((frequency, phrase) => {
      const words = phrase.split(' ');
      
      // Only consider multi-word phrases
      if (words.length < 2) return;

      const score = words.reduce((sum, word) => sum + (wordScores.get(word) || 0), 0);
      
      phrases.set(phrase, { score, frequency });
    });

    return phrases;
  }

  /**
   * Combine word and phrase scores, rank and return top keywords
   */
  private combineAndRank(
    wordScores: Map<string, { score: number; frequency: number }>,
    phraseScores: Map<string, { score: number; frequency: number }>
  ): ExtractedKeyword[] {
    const allKeywords: ExtractedKeyword[] = [];

    // Add single words
    wordScores.forEach((data, word) => {
      allKeywords.push({
        keyword: word,
        score: data.score,
        frequency: data.frequency,
        isPhrase: false,
      });
    });

    // Add phrases
    phraseScores.forEach((data, phrase) => {
      allKeywords.push({
        keyword: phrase,
        score: data.score,
        frequency: data.frequency,
        isPhrase: true,
      });
    });

    // Sort by score descending
    allKeywords.sort((a, b) => b.score - a.score);

    // Normalize scores to 0-1 range
    if (allKeywords.length > 0) {
      const maxScore = allKeywords[0].score;
      allKeywords.forEach(kw => {
        kw.score = Math.round((kw.score / maxScore) * 1000) / 1000;
      });
    }

    // Remove redundant keywords (phrases containing single words that are already top keywords)
    const topSingleWords = new Set(
      allKeywords
        .filter(kw => !kw.isPhrase)
        .slice(0, 5)
        .map(kw => kw.keyword)
    );

    return allKeywords.filter(kw => {
      if (!kw.isPhrase) return true;
      
      // Keep phrase if it adds value beyond its constituent words
      const words = kw.keyword.split(' ');
      const allWordsAreTop = words.every(w => topSingleWords.has(w));
      return !allWordsAreTop || kw.score > 0.8;
    });
  }
}

/**
 * Factory function for creating keyword extractor with defaults
 */
export function createKeywordExtractor(
  options?: KeywordExtractorOptions
): KeywordExtractor {
  return new KeywordExtractor(options);
}
