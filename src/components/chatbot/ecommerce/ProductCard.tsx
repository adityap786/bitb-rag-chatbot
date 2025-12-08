
import React from 'react';
import { ShoppingCart, Star } from 'lucide-react';
import { Product } from '@/lib/ecommerce/products';

interface ProductCardProps {
  product: Product;
  onAddToCart: (product: Product) => void;
}

export function ProductCard({ product, onAddToCart }: ProductCardProps) {
  return (
    <div className="flex flex-col bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm hover:shadow-md transition-shadow w-48 flex-shrink-0">
      <div className="h-32 overflow-hidden bg-gray-100 relative">
        <img 
          src={product.imageUrl} 
          alt={product.name} 
          className="w-full h-full object-cover"
        />
      </div>
      <div className="p-3 flex flex-col flex-grow">
        <h4 className="text-sm font-semibold text-gray-900 line-clamp-2 mb-1" title={product.name}>
          {product.name}
        </h4>
        <div className="flex items-center mb-2">
          <Star className="w-3 h-3 text-yellow-400 fill-current" />
          <span className="text-xs text-gray-500 ml-1">{product.rating}</span>
        </div>
        <div className="mt-auto flex items-center justify-between">
          <span className="text-sm font-bold text-gray-900">
            {product.currency === 'USD' ? '$' : product.currency}
            {product.price.toFixed(2)}
          </span>
          <button 
            onClick={() => onAddToCart(product)}
            className="p-1.5 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors"
            title="Add to Cart"
          >
            <ShoppingCart className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
