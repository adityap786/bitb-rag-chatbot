/**
 * ML-Based Recommendation Engine
 * 
 * Production-ready recommendation system using embeddings and collaborative filtering.
 * Features:
 * - Content-based filtering using embeddings
 * - Collaborative filtering
 * - Hybrid recommendations
 * - Real-time personalization
 * - A/B testing support
 * - Explainable recommendations
 */

// Types
export interface Product {
  id: string;
  name: string;
  description: string;
  category: string;
  subcategory?: string;
  brand?: string;
  price: number;
  imageUrl?: string;
  tags?: string[];
  attributes?: Record<string, string | number | boolean>;
  embedding?: number[];
  popularity?: number;
  rating?: number;
  reviewCount?: number;
}

export interface UserProfile {
  id: string;
  preferences: {
    categories?: string[];
    brands?: string[];
    priceRange?: { min: number; max: number };
    attributes?: Record<string, string[]>;
  };
  history: {
    viewed: Array<{ productId: string; timestamp: Date; duration?: number }>;
    purchased: Array<{ productId: string; timestamp: Date; quantity: number }>;
    searched: Array<{ query: string; timestamp: Date }>;
    clicked: Array<{ productId: string; source: string; timestamp: Date }>;
  };
  embedding?: number[];
}

export interface RecommendationContext {
  userId?: string;
  sessionId?: string;
  currentProduct?: string;
  cartItems?: string[];
  recentQueries?: string[];
  pageType?: 'home' | 'category' | 'product' | 'cart' | 'search';
  category?: string;
  filters?: Record<string, string[]>;
  limit?: number;
  excludeIds?: string[];
}

export interface Recommendation {
  id: string;
  itemId: string;
  productId: string;
  product: Product;
  score: number;
  confidence: number;
  algorithm: 'content' | 'collaborative' | 'hybrid' | 'trending' | 'similar' | 'complementary';
  reason: string;
  explanationFactors?: Array<{
    factor: string;
    weight: number;
    description: string;
  }>;
  metadata?: Record<string, unknown>;
}

export interface RecommendationResult {
  recommendations: Recommendation[];
  userId?: string;
  sessionId?: string;
  algorithm: string;
  processingTimeMs: number;
  experimentId?: string;
  variantId?: string;
}

// Similarity functions
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  return magnitude === 0 ? 0 : dotProduct / magnitude;
}

function euclideanDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) return Infinity;
  
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += Math.pow(a[i] - b[i], 2);
  }
  
  return Math.sqrt(sum);
}

// Simple text embedding (for demo - in production use OpenAI/Cohere embeddings)
function simpleTextEmbedding(text: string, dimensions: number = 768): number[] {
  const words = text.toLowerCase().split(/\s+/);
  const embedding = new Array(dimensions).fill(0);
  
  for (const word of words) {
    for (let i = 0; i < word.length; i++) {
      const charCode = word.charCodeAt(i);
      const idx = (charCode * (i + 1)) % dimensions;
      embedding[idx] += 1 / words.length;
    }
  }
  
  // Normalize
  const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  return norm === 0 ? embedding : embedding.map(v => v / norm);
}

export class RecommendationEngine {
  private products: Map<string, Product> = new Map();
  private userProfiles: Map<string, UserProfile> = new Map();
  private productEmbeddings: Map<string, number[]> = new Map();
  private userEmbeddings: Map<string, number[]> = new Map();
  private interactionMatrix: Map<string, Map<string, number>> = new Map(); // user -> product -> score
  
  // Configuration
  private readonly embeddingDimensions = 768;
  private readonly minSimilarity = 0.1;
  private readonly decayFactor = 0.95; // For time-based decay
  private readonly diversityFactor = 0.3; // Balance between relevance and diversity

  constructor() {}

  /**
   * Index products for recommendations
   */
  async indexProducts(products: Product[]): Promise<void> {
    for (const product of products) {
      // Generate embedding if not provided
      if (!product.embedding) {
        const text = [
          product.name,
          product.description,
          product.category,
          product.subcategory,
          product.brand,
          ...(product.tags || []),
        ].filter(Boolean).join(' ');
        
        product.embedding = simpleTextEmbedding(text, this.embeddingDimensions);
      }
      
      this.products.set(product.id, product);
      this.productEmbeddings.set(product.id, product.embedding);
    }
  }

  /**
   * Update or create user profile
   */
  async updateUserProfile(profile: UserProfile): Promise<void> {
    this.userProfiles.set(profile.id, profile);
    
    // Generate user embedding from preferences and history
    const userEmbedding = this.generateUserEmbedding(profile);
    this.userEmbeddings.set(profile.id, userEmbedding);
    
    // Update interaction matrix
    this.updateInteractionMatrix(profile);
  }

  /**
   * Record user interaction
   */
  async recordInteraction(
    userId: string,
    productId: string,
    type: 'view' | 'click' | 'cart' | 'purchase',
    metadata?: Record<string, unknown>
  ): Promise<void> {
    let profile = this.userProfiles.get(userId);
    
    if (!profile) {
      profile = {
        id: userId,
        preferences: {},
        history: {
          viewed: [],
          purchased: [],
          searched: [],
          clicked: [],
        },
      };
      this.userProfiles.set(userId, profile);
    }

    const timestamp = new Date();

    switch (type) {
      case 'view':
        profile.history.viewed.push({
          productId,
          timestamp,
          duration: metadata?.['duration'] as number,
        });
        break;
      case 'click':
        profile.history.clicked.push({
          productId,
          source: (metadata?.['source'] as string) || 'unknown',
          timestamp,
        });
        break;
      case 'cart':
      case 'purchase':
        profile.history.purchased.push({
          productId,
          timestamp,
          quantity: (metadata?.['quantity'] as number) || 1,
        });
        break;
    }

    // Update embeddings and interaction matrix
    await this.updateUserProfile(profile);
  }

  /**
   * Get personalized recommendations
   */
  async getRecommendations(context: RecommendationContext): Promise<RecommendationResult> {
    const startTime = Date.now();
    const limit = context.limit || 10;
    const excludeIds = new Set(context.excludeIds || []);
    
    let recommendations: Recommendation[] = [];

    // Choose algorithm based on context
    if (context.currentProduct) {
      // Similar items (content-based)
      recommendations = await this.getSimilarProducts(
        context.currentProduct,
        limit * 2,
        excludeIds
      );
    } else if (context.userId) {
      // Personalized (hybrid)
      recommendations = await this.getPersonalizedRecommendations(
        context.userId,
        context,
        limit * 2
      );
    } else if (context.category) {
      // Category-based trending
      recommendations = await this.getCategoryRecommendations(
        context.category,
        limit * 2,
        excludeIds
      );
    } else {
      // Trending/popular items
      recommendations = await this.getTrendingProducts(limit * 2, excludeIds);
    }

    // Apply diversity
    recommendations = this.applyDiversity(recommendations, limit);

    // Filter excluded
    recommendations = recommendations
      .filter(r => !excludeIds.has(r.productId))
      .slice(0, limit);

    return {
      recommendations,
      userId: context.userId,
      sessionId: context.sessionId,
      algorithm: recommendations[0]?.algorithm || 'hybrid',
      processingTimeMs: Date.now() - startTime,
    };
  }

  /**
   * Get similar products (content-based filtering)
   */
  async getSimilarProducts(
    productId: string,
    limit: number,
    excludeIds: Set<string> = new Set()
  ): Promise<Recommendation[]> {
    const product = this.products.get(productId);
    if (!product || !product.embedding) return [];

    const similarities: Array<{ productId: string; similarity: number }> = [];

    for (const [id, embedding] of this.productEmbeddings) {
      if (id === productId || excludeIds.has(id)) continue;
      
      const similarity = cosineSimilarity(product.embedding, embedding);
      if (similarity >= this.minSimilarity) {
        similarities.push({ productId: id, similarity });
      }
    }

    similarities.sort((a, b) => b.similarity - a.similarity);

    return similarities.slice(0, limit).map(({ productId: pid, similarity }) => {
      const p = this.products.get(pid)!;
      return {
        id: `rec_${pid}_${Date.now()}`,
        productId: pid,
        itemId: p.id,
        product: p,
        score: similarity,
        confidence: this.calculateConfidence(similarity, p),
        algorithm: 'similar',
        reason: this.generateSimilarReason(product, p),
        explanationFactors: this.generateExplanationFactors('similar', product, p),
      };
    });
  }

  /**
   * Get personalized recommendations (hybrid)
   */
  async getPersonalizedRecommendations(
    userId: string,
    context: RecommendationContext,
    limit: number
  ): Promise<Recommendation[]> {
    const profile = this.userProfiles.get(userId);
    const userEmbedding = this.userEmbeddings.get(userId);
    
    // Content-based from user embedding
    const contentBased: Recommendation[] = [];
    if (userEmbedding) {
      for (const [productId, embedding] of this.productEmbeddings) {
        const similarity = cosineSimilarity(userEmbedding, embedding);
        if (similarity >= this.minSimilarity) {
          const product = this.products.get(productId)!;
          contentBased.push({
            id: `rec_${productId}_${Date.now()}`,
            productId,
            itemId: product.id,
            product,
            score: similarity,
            confidence: this.calculateConfidence(similarity, product),
            algorithm: 'content',
            reason: 'Based on your preferences',
            explanationFactors: this.generateExplanationFactors('content', undefined, product, profile),
          });
        }
      }
    }

    // Collaborative filtering
    const collaborative = await this.getCollaborativeRecommendations(userId, limit);

    // Merge and weight
    const merged = new Map<string, Recommendation>();
    
    for (const rec of contentBased) {
      merged.set(rec.productId, rec);
    }

    for (const rec of collaborative) {
      const existing = merged.get(rec.productId);
      if (existing) {
        // Combine scores
        existing.score = (existing.score + rec.score) / 2;
        existing.algorithm = 'hybrid';
        existing.reason = 'Recommended based on your activity and similar users';
      } else {
        merged.set(rec.productId, rec);
      }
    }

    // Apply context filters
    let recommendations = Array.from(merged.values());
    
    if (context.category) {
      recommendations = recommendations.filter(
        r => r.product.category === context.category
      );
    }

    // Sort by score
    recommendations.sort((a, b) => b.score - a.score);

    return recommendations.slice(0, limit);
  }

  /**
   * Get collaborative filtering recommendations
   */
  async getCollaborativeRecommendations(
    userId: string,
    limit: number
  ): Promise<Recommendation[]> {
    const userInteractions = this.interactionMatrix.get(userId);
    if (!userInteractions) return [];

    // Find similar users
    const similarUsers: Array<{ userId: string; similarity: number }> = [];
    
    for (const [otherId, otherInteractions] of this.interactionMatrix) {
      if (otherId === userId) continue;
      
      const similarity = this.calculateUserSimilarity(userInteractions, otherInteractions);
      if (similarity > 0) {
        similarUsers.push({ userId: otherId, similarity });
      }
    }

    similarUsers.sort((a, b) => b.similarity - a.similarity);
    const topSimilarUsers = similarUsers.slice(0, 20);

    // Get products liked by similar users but not by current user
    const productScores = new Map<string, number>();
    
    for (const { userId: otherId, similarity } of topSimilarUsers) {
      const otherInteractions = this.interactionMatrix.get(otherId)!;
      
      for (const [productId, score] of otherInteractions) {
        if (!userInteractions.has(productId)) {
          const current = productScores.get(productId) || 0;
          productScores.set(productId, current + score * similarity);
        }
      }
    }

    // Convert to recommendations
    const recommendations: Recommendation[] = [];
    
    for (const [productId, score] of productScores) {
      const product = this.products.get(productId);
      if (!product) continue;
      
      recommendations.push({
        id: `rec_collab_${productId}_${Date.now()}`,
        productId,
        itemId: product.id,
        product,
        score: Math.min(score, 1),
        confidence: Math.min(score * 0.8, 1),
        algorithm: 'collaborative',
        reason: 'Users with similar taste also liked this',
        explanationFactors: [
          {
            factor: 'similar_users',
            weight: 0.8,
            description: `Liked by ${topSimilarUsers.length} users with similar preferences`,
          },
        ],
      });
    }

    recommendations.sort((a, b) => b.score - a.score);
    return recommendations.slice(0, limit);
  }

  /**
   * Get trending products
   */
  async getTrendingProducts(
    limit: number,
    excludeIds: Set<string> = new Set()
  ): Promise<Recommendation[]> {
    const products = Array.from(this.products.values())
      .filter(p => !excludeIds.has(p.id));

    // Calculate trending score based on popularity, rating, and recency
    const scored = products.map(product => {
      const popularityScore = (product.popularity || 0) / 100;
      const ratingScore = ((product.rating || 0) / 5) * (Math.min(product.reviewCount || 0, 100) / 100);
      
      return {
        product,
        score: popularityScore * 0.6 + ratingScore * 0.4,
      };
    });

    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, limit).map(({ product, score }) => ({
      id: `rec_trending_${product.id}_${Date.now()}`,
      productId: product.id,
      itemId: product.id,
      product,
      score,
      confidence: Math.min(score + 0.2, 1),
      algorithm: 'trending',
      reason: 'Trending now',
      explanationFactors: [
        {
          factor: 'popularity',
          weight: 0.6,
          description: `${product.popularity || 0}% popularity score`,
        },
        {
          factor: 'rating',
          weight: 0.4,
          description: `${product.rating || 0}/5 stars from ${product.reviewCount || 0} reviews`,
        },
      ],
    }));
  }

  /**
   * Get category-specific recommendations
   */
  async getCategoryRecommendations(
    category: string,
    limit: number,
    excludeIds: Set<string> = new Set()
  ): Promise<Recommendation[]> {
    const categoryProducts = Array.from(this.products.values())
      .filter(p => p.category === category && !excludeIds.has(p.id));

    // Score by popularity and rating within category
    const scored = categoryProducts.map(product => {
      const score = (
        ((product.popularity || 0) / 100) * 0.5 +
        ((product.rating || 0) / 5) * 0.3 +
        Math.random() * 0.2 // Add some randomness for exploration
      );
      
      return { product, score };
    });

    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, limit).map(({ product, score }) => ({
      id: `rec_cat_${product.id}_${Date.now()}`,
      productId: product.id,
      itemId: product.id,
      product,
      score,
      confidence: score * 0.9,
      algorithm: 'content',
      reason: `Top pick in ${category}`,
    }));
  }

  /**
   * Get complementary products (frequently bought together)
   */
  async getComplementaryProducts(
    productId: string,
    limit: number
  ): Promise<Recommendation[]> {
    const product = this.products.get(productId);
    if (!product) return [];

    // Find products frequently purchased together
    const coPurchases = new Map<string, number>();

    for (const profile of this.userProfiles.values()) {
      const purchased = profile.history.purchased;
      const hasProduct = purchased.some(p => p.productId === productId);
      
      if (hasProduct) {
        for (const { productId: otherId } of purchased) {
          if (otherId !== productId) {
            coPurchases.set(otherId, (coPurchases.get(otherId) || 0) + 1);
          }
        }
      }
    }

    const complementary: Array<{ productId: string; count: number }> = [];
    for (const [pid, count] of coPurchases) {
      complementary.push({ productId: pid, count });
    }

    complementary.sort((a, b) => b.count - a.count);

    return complementary.slice(0, limit).map(({ productId: pid, count }) => {
      const p = this.products.get(pid)!;
      const maxCount = Math.max(...complementary.map(c => c.count));
      const score = count / maxCount;
      
      return {
        id: `rec_comp_${pid}_${Date.now()}`,
        productId: pid,
        itemId: p.id,
        product: p,
        score,
        confidence: Math.min(score + 0.1, 1),
        algorithm: 'complementary',
        reason: 'Frequently bought together',
        explanationFactors: [
          {
            factor: 'co_purchase',
            weight: 1.0,
            description: `Purchased together ${count} times`,
          },
        ],
      };
    });
  }

  // Private helper methods
  private generateUserEmbedding(profile: UserProfile): number[] {
    const embedding = new Array(this.embeddingDimensions).fill(0);
    
    // Weight recent interactions more heavily
    const now = Date.now();
    
    // Add viewed product embeddings
    for (const view of profile.history.viewed.slice(-50)) {
      const productEmbedding = this.productEmbeddings.get(view.productId);
      if (productEmbedding) {
        const age = (now - new Date(view.timestamp).getTime()) / (24 * 60 * 60 * 1000);
        const weight = Math.pow(this.decayFactor, age) * 0.3;
        
        for (let i = 0; i < this.embeddingDimensions; i++) {
          embedding[i] += productEmbedding[i] * weight;
        }
      }
    }

    // Add purchased product embeddings (higher weight)
    for (const purchase of profile.history.purchased.slice(-30)) {
      const productEmbedding = this.productEmbeddings.get(purchase.productId);
      if (productEmbedding) {
        const age = (now - new Date(purchase.timestamp).getTime()) / (24 * 60 * 60 * 1000);
        const weight = Math.pow(this.decayFactor, age) * 0.7;
        
        for (let i = 0; i < this.embeddingDimensions; i++) {
          embedding[i] += productEmbedding[i] * weight;
        }
      }
    }

    // Add search query embeddings
    for (const search of profile.history.searched.slice(-20)) {
      const queryEmbedding = simpleTextEmbedding(search.query, this.embeddingDimensions);
      const age = (now - new Date(search.timestamp).getTime()) / (24 * 60 * 60 * 1000);
      const weight = Math.pow(this.decayFactor, age) * 0.5;
      
      for (let i = 0; i < this.embeddingDimensions; i++) {
        embedding[i] += queryEmbedding[i] * weight;
      }
    }

    // Normalize
    const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    return norm === 0 ? embedding : embedding.map(v => v / norm);
  }

  private updateInteractionMatrix(profile: UserProfile): void {
    const interactions = new Map<string, number>();
    
    // Views = low signal
    for (const view of profile.history.viewed) {
      const current = interactions.get(view.productId) || 0;
      interactions.set(view.productId, Math.min(current + 0.1, 1));
    }

    // Clicks = medium signal
    for (const click of profile.history.clicked) {
      const current = interactions.get(click.productId) || 0;
      interactions.set(click.productId, Math.min(current + 0.3, 1));
    }

    // Purchases = strong signal
    for (const purchase of profile.history.purchased) {
      const current = interactions.get(purchase.productId) || 0;
      interactions.set(purchase.productId, Math.min(current + 0.6, 1));
    }

    this.interactionMatrix.set(profile.id, interactions);
  }

  private calculateUserSimilarity(
    a: Map<string, number>,
    b: Map<string, number>
  ): number {
    // Jaccard-like similarity with weights
    const allProducts = new Set([...a.keys(), ...b.keys()]);
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (const productId of allProducts) {
      const scoreA = a.get(productId) || 0;
      const scoreB = b.get(productId) || 0;
      dotProduct += scoreA * scoreB;
      normA += scoreA * scoreA;
      normB += scoreB * scoreB;
    }

    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    return magnitude === 0 ? 0 : dotProduct / magnitude;
  }

  private calculateConfidence(similarity: number, product: Product): number {
    // Confidence based on similarity and product data quality
    let confidence = similarity;
    
    if (product.rating && product.reviewCount && product.reviewCount > 10) {
      confidence += 0.1;
    }
    
    if (product.popularity && product.popularity > 50) {
      confidence += 0.05;
    }

    return Math.min(confidence, 1);
  }

  private generateSimilarReason(source: Product, target: Product): string {
    if (source.category === target.category && source.brand === target.brand) {
      return `Same brand in ${source.category}`;
    }
    if (source.category === target.category) {
      return `Similar ${source.category} product`;
    }
    if (source.brand === target.brand) {
      return `Also from ${source.brand}`;
    }
    return 'You might also like';
  }

  private generateExplanationFactors(
    algorithm: string,
    source?: Product,
    target?: Product,
    profile?: UserProfile
  ): Array<{ factor: string; weight: number; description: string }> {
    const factors: Array<{ factor: string; weight: number; description: string }> = [];

    if (algorithm === 'similar' && source && target) {
      if (source.category === target.category) {
        factors.push({
          factor: 'category_match',
          weight: 0.4,
          description: `Both in ${source.category}`,
        });
      }
      if (source.brand === target.brand) {
        factors.push({
          factor: 'brand_match',
          weight: 0.3,
          description: `Same brand: ${source.brand}`,
        });
      }
    }

    if (algorithm === 'content' && profile && target) {
      const viewedCount = profile.history.viewed.length;
      const purchasedCount = profile.history.purchased.length;
      
      factors.push({
        factor: 'browsing_history',
        weight: 0.5,
        description: `Based on ${viewedCount} viewed products`,
      });
      
      if (purchasedCount > 0) {
        factors.push({
          factor: 'purchase_history',
          weight: 0.5,
          description: `Based on ${purchasedCount} purchases`,
        });
      }
    }

    return factors;
  }

  private applyDiversity(
    recommendations: Recommendation[],
    limit: number
  ): Recommendation[] {
    if (recommendations.length <= limit) return recommendations;

    const selected: Recommendation[] = [];
    const categories = new Set<string>();
    const brands = new Set<string>();

    // Sort by score first
    recommendations.sort((a, b) => b.score - a.score);

    for (const rec of recommendations) {
      if (selected.length >= limit) break;

      const categoryPenalty = categories.has(rec.product.category) ? this.diversityFactor : 0;
      const brandPenalty = rec.product.brand && brands.has(rec.product.brand) ? this.diversityFactor : 0;

      // Apply diversity penalty
      rec.score = rec.score * (1 - categoryPenalty - brandPenalty);

      selected.push(rec);
      categories.add(rec.product.category);
      if (rec.product.brand) brands.add(rec.product.brand);
    }

    // Re-sort after diversity adjustment
    selected.sort((a, b) => b.score - a.score);

    return selected;
  }
}

// Export legacy interface for backwards compatibility
export interface LegacyRecommendation {
  id: string;
  type: 'product' | 'service' | 'content';
  title: string;
  description: string;
  imageUrl?: string;
  score: number;
  reason?: string;
}

export function getRecommendations(context: { 
  recentQueries: string[]; 
  cartItems?: unknown[]; 
}): LegacyRecommendation[] {
  // Legacy function for backwards compatibility
  // In production, use RecommendationEngine class instead
  const mockRecommendations: LegacyRecommendation[] = [
    {
      id: 'rec1',
      type: 'product',
      title: 'Wireless Noise-Canceling Headphones',
      description: 'Based on your interest in electronics, we recommend these premium headphones.',
      imageUrl: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500&q=80',
      score: 0.95,
      reason: 'You viewed similar products.',
    },
    {
      id: 'rec2',
      type: 'service',
      title: 'Personalized Fitness Coaching',
      description: 'Get matched with a certified coach for your fitness goals.',
      score: 0.88,
      reason: 'You searched for smartwatches and fitness.',
    },
  ];

  const keywords = context.recentQueries.join(' ').toLowerCase();
  const filtered = mockRecommendations.filter(rec =>
    keywords.includes(rec.title.toLowerCase()) ||
    keywords.includes(rec.description.toLowerCase())
  );

  return filtered.length > 0 ? filtered : mockRecommendations;
}

export interface PriceRangeFilter {
  min?: number;
  max?: number;
}

export interface RecommendationOptions {
  userId?: string;
  itemId?: string;
  limit?: number;
  strategy: 'personalized' | 'similar_items' | 'trending' | 'hybrid';
  categoryFilter?: string;
  priceRange?: PriceRangeFilter;
  excludeItems?: string[];
  experimentId?: string;
  metadata?: Record<string, unknown>;
}

export interface UserBehavior {
  type: 'view' | 'purchase' | 'add_to_cart' | 'search';
  itemId: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface MLRecommendationEngineConfig {
  tenantId: string;
  embeddingModel: string;
  embeddingDimensions: number;
  maxCandidates: number;
}

const DEFAULT_ML_CONFIG: MLRecommendationEngineConfig = {
  tenantId: 'default',
  embeddingModel: 'nomic-ai/nomic-embed-text-v1.5',
  embeddingDimensions: 768,
  maxCandidates: 50,
};
export class MLRecommendationEngine {
  private engine = new RecommendationEngine();
  private config: MLRecommendationEngineConfig;
  private behaviorLog: Map<string, UserBehavior[]> = new Map();

  constructor(config: Partial<MLRecommendationEngineConfig> = {}) {
    this.config = { ...DEFAULT_ML_CONFIG, ...config };
  }

  async trackBehavior(userId: string, behavior: UserBehavior): Promise<void> {
    const behaviors = this.behaviorLog.get(userId) || [];
    behaviors.push(behavior);
    this.behaviorLog.set(userId, behaviors.slice(-200));

    await this.engine.recordInteraction(
      userId,
      behavior.itemId,
      this.translateBehavior(behavior.type),
      behavior.metadata,
    );
  }

  async getRecommendations(options: RecommendationOptions): Promise<Recommendation[]> {
    const limit = Math.min(options.limit ?? 10, this.config.maxCandidates);
    const context = this.buildContext(options, limit);
    const result = await this.engine.getRecommendations(context);

    return result.recommendations
      .filter(rec => !options.excludeItems?.includes(rec.productId))
      .filter(rec => this.matchesPriceRange(rec, options.priceRange))
      .filter(rec => !options.categoryFilter || rec.product.category === options.categoryFilter)
      .slice(0, limit);
  }

  private buildContext(options: RecommendationOptions, limit: number): RecommendationContext {
    const context: RecommendationContext = {
      limit: Math.max(limit * 2, this.config.maxCandidates),
    };

    if (options.strategy === 'personalized' && options.userId) {
      context.userId = options.userId;
    }

    if ((options.strategy === 'similar_items' || options.strategy === 'hybrid') && options.itemId) {
      context.currentProduct = options.itemId;
    }

    if (options.strategy === 'hybrid' && options.userId) {
      context.userId = options.userId;
    }

    if (options.categoryFilter) {
      context.category = options.categoryFilter;
    }

    if (options.excludeItems && options.excludeItems.length) {
      context.excludeIds = options.excludeItems;
    }

    return context;
  }

  private matchesPriceRange(rec: Recommendation, range?: PriceRangeFilter): boolean {
    if (!range) return true;
    if (range.min != null && rec.product.price < range.min) return false;
    if (range.max != null && rec.product.price > range.max) return false;
    return true;
  }

  private translateBehavior(type: UserBehavior['type']): 'view' | 'click' | 'cart' | 'purchase' {
    switch (type) {
      case 'purchase':
        return 'purchase';
      case 'add_to_cart':
        return 'cart';
      case 'search':
        return 'view';
      case 'view':
      default:
        return 'view';
    }
  }
}
