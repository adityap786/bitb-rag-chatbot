
import { describe, it, expect } from 'vitest';
import { searchProducts, getProductById } from '../src/lib/ecommerce/products';

describe('Ecommerce utils', () => {
  it('searchProducts returns matching products', () => {
    const results = searchProducts('headphones');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].name).toContain('Headphones');
  });

  it('searchProducts is case insensitive', () => {
    const results = searchProducts('HEADPHONES');
    expect(results.length).toBeGreaterThan(0);
  });

  it('getProductById returns correct product', () => {
    const product = getProductById('p1');
    expect(product).toBeDefined();
    expect(product?.id).toBe('p1');
  });

  it('getProductById returns undefined for invalid id', () => {
    const product = getProductById('invalid-id');
    expect(product).toBeUndefined();
  });
});
