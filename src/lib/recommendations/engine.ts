
export interface Recommendation {
  id: string;
  type: 'product' | 'service' | 'content';
  title: string;
  description: string;
  imageUrl?: string;
  score: number;
  reason?: string;
}

const MOCK_RECOMMENDATIONS: Recommendation[] = [
  {
    id: 'rec1',
    type: 'product',
    title: 'Wireless Noise-Canceling Headphones',
    description: 'Based on your interest in electronics, we recommend these premium headphones.',
    imageUrl: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500&q=80',
    score: 0.95,
    reason: 'You viewed similar products.'
  },
  {
    id: 'rec2',
    type: 'service',
    title: 'Personalized Fitness Coaching',
    description: 'Get matched with a certified coach for your fitness goals.',
    imageUrl: '',
    score: 0.88,
    reason: 'You searched for smartwatches and fitness.'
  },
  {
    id: 'rec3',
    type: 'content',
    title: 'How to Choose the Best Office Chair',
    description: 'Read our guide to ergonomic seating for productivity.',
    imageUrl: '',
    score: 0.82,
    reason: 'You viewed office furniture.'
  }
];

export function getRecommendations(context: { recentQueries: string[]; cartItems?: any[]; }): Recommendation[] {
  // Simple collaborative filtering stub: recommend based on keywords
  const keywords = context.recentQueries.join(' ').toLowerCase();
  return MOCK_RECOMMENDATIONS.filter(rec =>
    keywords.includes(rec.title.toLowerCase()) ||
    keywords.includes(rec.description.toLowerCase()) ||
    (rec.reason && keywords.includes(rec.reason.toLowerCase()))
  ).length > 0
    ? MOCK_RECOMMENDATIONS.filter(rec =>
        keywords.includes(rec.title.toLowerCase()) ||
        keywords.includes(rec.description.toLowerCase()) ||
        (rec.reason && keywords.includes(rec.reason.toLowerCase()))
      )
    : MOCK_RECOMMENDATIONS.slice(0, 2);
}
