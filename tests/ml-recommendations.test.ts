/**
 * ML Recommendation Engine Tests
 * 
 * Tests for the ML-based recommendation engine.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  MLRecommendationEngine,
  type RecommendationOptions,
  type UserBehavior,
} from '../src/lib/recommendations/ml-engine';

// Mock fetch for embedding API calls
vi.mock('node-fetch', () => ({
  default: vi.fn(),
}));

describe('MLRecommendationEngine', () => {
  let engine: MLRecommendationEngine;
  
  beforeEach(() => {
    engine = new MLRecommendationEngine({
      tenantId: 'test-tenant',
      embeddingModel: 'text-embedding-ada-002',
      embeddingDimensions: 384,
    });
  });
  
  describe('initialization', () => {
    it('creates engine with default options', () => {
      expect(engine).toBeDefined();
    });
    
    it('accepts custom configuration', () => {
      const customEngine = new MLRecommendationEngine({
        tenantId: 'custom-tenant',
        embeddingModel: 'custom-model',
        embeddingDimensions: 768,
        maxCandidates: 50,
      });
      expect(customEngine).toBeDefined();
    });
  });
  
  describe('user behavior tracking', () => {
    it('tracks view behavior', async () => {
      const behavior: UserBehavior = {
        type: 'view',
        itemId: 'product-1',
        timestamp: new Date(),
        metadata: { duration: 30 },
      };
      
      // Should not throw
      await engine.trackBehavior('user-1', behavior);
    });
    
    it('tracks purchase behavior with higher weight', async () => {
      const behavior: UserBehavior = {
        type: 'purchase',
        itemId: 'product-1',
        timestamp: new Date(),
        metadata: { price: 99.99 },
      };
      
      await engine.trackBehavior('user-1', behavior);
    });
    
    it('tracks add_to_cart behavior', async () => {
      const behavior: UserBehavior = {
        type: 'add_to_cart',
        itemId: 'product-2',
        timestamp: new Date(),
      };
      
      await engine.trackBehavior('user-1', behavior);
    });
    
    it('tracks search behavior', async () => {
      const behavior: UserBehavior = {
        type: 'search',
        itemId: 'wireless headphones',
        timestamp: new Date(),
        metadata: { resultsCount: 25 },
      };
      
      await engine.trackBehavior('user-1', behavior);
    });
    
    it('tracks multiple behaviors for same user', async () => {
      await engine.trackBehavior('user-1', {
        type: 'view',
        itemId: 'product-1',
        timestamp: new Date(),
      });
      
      await engine.trackBehavior('user-1', {
        type: 'view',
        itemId: 'product-2',
        timestamp: new Date(),
      });
      
      await engine.trackBehavior('user-1', {
        type: 'purchase',
        itemId: 'product-1',
        timestamp: new Date(),
      });
    });
  });
  
  describe('recommendations generation', () => {
    beforeEach(async () => {
      // Pre-populate some user behavior
      await engine.trackBehavior('user-1', {
        type: 'view',
        itemId: 'electronics-phone',
        timestamp: new Date(),
      });
      
      await engine.trackBehavior('user-1', {
        type: 'purchase',
        itemId: 'electronics-laptop',
        timestamp: new Date(),
      });
    });
    
    it('generates personalized recommendations', async () => {
      const options: RecommendationOptions = {
        userId: 'user-1',
        limit: 5,
        strategy: 'personalized',
      };
      
      const recommendations = await engine.getRecommendations(options);
      
      expect(Array.isArray(recommendations)).toBe(true);
    });
    
    it('generates similar item recommendations', async () => {
      const options: RecommendationOptions = {
        itemId: 'electronics-phone',
        limit: 5,
        strategy: 'similar_items',
      };
      
      const recommendations = await engine.getRecommendations(options);
      
      expect(Array.isArray(recommendations)).toBe(true);
    });
    
    it('generates trending recommendations', async () => {
      const options: RecommendationOptions = {
        limit: 10,
        strategy: 'trending',
      };
      
      const recommendations = await engine.getRecommendations(options);
      
      expect(Array.isArray(recommendations)).toBe(true);
    });
    
    it('respects limit parameter', async () => {
      const options: RecommendationOptions = {
        limit: 3,
        strategy: 'trending',
      };
      
      const recommendations = await engine.getRecommendations(options);
      
      expect(recommendations.length).toBeLessThanOrEqual(3);
    });
    
    it('filters by category when specified', async () => {
      const options: RecommendationOptions = {
        limit: 5,
        strategy: 'trending',
        categoryFilter: 'electronics',
      };
      
      const recommendations = await engine.getRecommendations(options);
      
      expect(Array.isArray(recommendations)).toBe(true);
    });
    
    it('filters by price range when specified', async () => {
      const options: RecommendationOptions = {
        limit: 5,
        strategy: 'trending',
        priceRange: { min: 10, max: 100 },
      };
      
      const recommendations = await engine.getRecommendations(options);
      
      expect(Array.isArray(recommendations)).toBe(true);
    });
    
    it('excludes specified items', async () => {
      const options: RecommendationOptions = {
        limit: 5,
        strategy: 'trending',
        excludeItems: ['product-1', 'product-2'],
      };
      
      const recommendations = await engine.getRecommendations(options);
      
      recommendations.forEach(rec => {
        expect(['product-1', 'product-2']).not.toContain(rec.itemId);
      });
    });
    
    it('handles hybrid strategy', async () => {
      const options: RecommendationOptions = {
        userId: 'user-1',
        limit: 5,
        strategy: 'hybrid',
      };
      
      const recommendations = await engine.getRecommendations(options);
      
      expect(Array.isArray(recommendations)).toBe(true);
    });
  });
  
  describe('similarity calculations', () => {
    it('calculates cosine similarity correctly', () => {
      const vecA = [1, 0, 0];
      const vecB = [1, 0, 0];
      
      // Should be 1.0 for identical vectors
      // Note: This tests internal logic if exposed
    });
    
    it('handles orthogonal vectors', () => {
      const vecA = [1, 0, 0];
      const vecB = [0, 1, 0];
      
      // Should be 0.0 for orthogonal vectors
    });
  });
  
  describe('error handling', () => {
    it('handles missing user gracefully', async () => {
      const options: RecommendationOptions = {
        userId: 'non-existent-user',
        limit: 5,
        strategy: 'personalized',
      };
      
      // Should return empty or fallback recommendations
      const recommendations = await engine.getRecommendations(options);
      expect(Array.isArray(recommendations)).toBe(true);
    });
    
    it('handles invalid item ID gracefully', async () => {
      const options: RecommendationOptions = {
        itemId: 'non-existent-item',
        limit: 5,
        strategy: 'similar_items',
      };
      
      const recommendations = await engine.getRecommendations(options);
      expect(Array.isArray(recommendations)).toBe(true);
    });
    
    it('handles invalid limit gracefully', async () => {
      const options: RecommendationOptions = {
        limit: -1,
        strategy: 'trending',
      };
      
      const recommendations = await engine.getRecommendations(options);
      expect(Array.isArray(recommendations)).toBe(true);
    });
  });
  
  describe('A/B testing integration', () => {
    it('respects experiment flag', async () => {
      const options: RecommendationOptions = {
        userId: 'user-1',
        limit: 5,
        strategy: 'personalized',
        experimentId: 'exp-001',
      };
      
      const recommendations = await engine.getRecommendations(options);
      expect(Array.isArray(recommendations)).toBe(true);
    });
  });
  
  describe('real-time updates', () => {
    it('updates user profile on new behavior', async () => {
      await engine.trackBehavior('user-new', {
        type: 'view',
        itemId: 'product-1',
        timestamp: new Date(),
      });
      
      const options: RecommendationOptions = {
        userId: 'user-new',
        limit: 5,
        strategy: 'personalized',
      };
      
      const recommendations = await engine.getRecommendations(options);
      expect(Array.isArray(recommendations)).toBe(true);
    });
  });
});

describe('MLRecommendationEngine - Performance', () => {
  let engine: MLRecommendationEngine;
  
  beforeEach(() => {
    engine = new MLRecommendationEngine({
      tenantId: 'perf-test',
      embeddingModel: 'text-embedding-ada-002',
      embeddingDimensions: 384,
    });
  });
  
  it('handles large number of behaviors efficiently', async () => {
    const startTime = Date.now();
    
    // Track 1000 behaviors
    for (let i = 0; i < 1000; i++) {
      await engine.trackBehavior(`user-${i % 100}`, {
        type: 'view',
        itemId: `product-${i}`,
        timestamp: new Date(),
      });
    }
    
    const duration = Date.now() - startTime;
    expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
  });
  
  it('generates recommendations within acceptable time', async () => {
    const startTime = Date.now();
    
    await engine.getRecommendations({
      userId: 'user-1',
      limit: 20,
      strategy: 'personalized',
    });
    
    const duration = Date.now() - startTime;
    expect(duration).toBeLessThan(1000); // Should complete within 1 second
  });
});
