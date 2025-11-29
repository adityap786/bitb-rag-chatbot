
export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  category: string;
  imageUrl: string;
  inStock: boolean;
  rating: number;
}

const MOCK_PRODUCTS: Product[] = [
  {
    id: 'p1',
    name: 'Wireless Noise-Canceling Headphones',
    description: 'Premium over-ear headphones with active noise cancellation and 30-hour battery life.',
    price: 299.99,
    currency: 'USD',
    category: 'Electronics',
    imageUrl: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500&q=80',
    inStock: true,
    rating: 4.8
  },
  {
    id: 'p2',
    name: 'Smart Fitness Watch',
    description: 'Track your health, workouts, and sleep with this advanced smartwatch.',
    price: 199.50,
    currency: 'USD',
    category: 'Electronics',
    imageUrl: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=500&q=80',
    inStock: true,
    rating: 4.5
  },
  {
    id: 'p3',
    name: 'Ergonomic Office Chair',
    description: 'High-back mesh chair with lumbar support and adjustable armrests.',
    price: 249.00,
    currency: 'USD',
    category: 'Furniture',
    imageUrl: 'https://images.unsplash.com/photo-1592078615290-033ee584e267?w=500&q=80',
    inStock: true,
    rating: 4.7
  },
  {
    id: 'p4',
    name: 'Organic Cotton T-Shirt',
    description: 'Soft, breathable, and sustainable 100% organic cotton tee.',
    price: 29.99,
    currency: 'USD',
    category: 'Clothing',
    imageUrl: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=500&q=80',
    inStock: true,
    rating: 4.3
  },
  {
    id: 'p5',
    name: 'Stainless Steel Water Bottle',
    description: 'Double-wall vacuum insulated bottle keeps drinks cold for 24 hours.',
    price: 35.00,
    currency: 'USD',
    category: 'Accessories',
    imageUrl: 'https://images.unsplash.com/photo-1602143407151-01114192003b?w=500&q=80',
    inStock: true,
    rating: 4.9
  }
];

export function searchProducts(query: string, options?: { limit?: number }): Product[] {
  const q = query.toLowerCase();
  const limit = options?.limit || 5;
  
  return MOCK_PRODUCTS.filter(p => 
    p.name.toLowerCase().includes(q) || 
    p.description.toLowerCase().includes(q) ||
    p.category.toLowerCase().includes(q)
  ).slice(0, limit);
}

export function getProductById(id: string): Product | undefined {
  return MOCK_PRODUCTS.find(p => p.id === id);
}
