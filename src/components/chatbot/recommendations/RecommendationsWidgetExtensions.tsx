
import React, { useEffect, useState } from 'react';
import { Recommendation } from '@/lib/recommendations/engine';

interface RecommendationsWidgetExtensionsProps {
  recentQueries: string[];
  cartItems?: any[];
}

export function RecommendationsWidgetExtensions({ recentQueries, cartItems }: RecommendationsWidgetExtensionsProps) {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);

  useEffect(() => {
    async function fetchRecommendations() {
      const res = await fetch('/api/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recentQueries, cartItems })
      });
      const data = await res.json();
      setRecommendations(data.recommendations || []);
    }
    fetchRecommendations();
  }, [recentQueries, cartItems]);

  if (recommendations.length === 0) return null;

  return (
    <div className="p-3 bg-white/5 border-t border-gray-200 rounded-md mt-2">
      <h4 className="text-sm font-bold mb-2">Recommended for you</h4>
      <div className="flex flex-col gap-2">
        {recommendations.map(rec => (
          <div key={rec.id} className="flex items-center gap-3 p-2 border rounded bg-slate-900/30">
            {rec.imageUrl && (
              <img src={rec.imageUrl} alt={rec.title} className="w-12 h-12 object-cover rounded" />
            )}
            <div>
              <div className="text-sm font-semibold">{rec.title}</div>
              <div className="text-xs text-gray-400">{rec.description}</div>
              {rec.reason && <div className="text-xs text-blue-500 mt-1">{rec.reason}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
