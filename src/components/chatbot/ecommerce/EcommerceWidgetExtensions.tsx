
import React, { useState, useEffect } from 'react';
import { ShoppingBag, X } from 'lucide-react';
import { Product } from '@/lib/ecommerce/products';
import { ProductCard } from './ProductCard';

interface EcommerceWidgetExtensionsProps {
  onSendMessage: (message: string) => void;
  tenantId: string;
  lastMessageMetadata?: any;
}

export function EcommerceWidgetExtensions({ onSendMessage, tenantId, lastMessageMetadata }: EcommerceWidgetExtensionsProps) {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [cart, setCart] = useState<Product[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);

  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [orderComplete, setOrderComplete] = useState<any>(null);

  // Sync with chat metadata
  useEffect(() => {
    if (lastMessageMetadata?.productResults) {
      setProducts(lastMessageMetadata.productResults);
    }
  }, [lastMessageMetadata]);

  const addToCart = (product: Product) => {
    setCart(prev => [...prev, product]);
  };

  const removeFromCart = (index: number) => {
    setCart(prev => prev.filter((_, i) => i !== index));
  };

  const handleCheckout = async () => {
    setIsCheckingOut(true);
    try {
      const response = await fetch('/api/ecommerce/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cart,
          total: cartTotal,
          currency: 'USD',
          customerEmail: 'guest@example.com' // Mock email
        }),
      });
      const data = await response.json();
      if (data.success) {
        setOrderComplete(data.order);
        setCart([]);
        setIsCartOpen(false);
        onSendMessage(`Order placed successfully! Order ID: ${data.order.orderId}`);
      } else {
        alert('Checkout failed: ' + data.error);
      }
    } catch (error) {
      console.error('Checkout error', error);
      alert('An error occurred during checkout.');
    } finally {
      setIsCheckingOut(false);
    }
  };

  const cartTotal = cart.reduce((sum, item) => sum + item.price, 0);

  return (
    <div className="flex flex-col gap-2">
      {/* Order Confirmation */}
      {orderComplete && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-md mb-2">
          <h4 className="text-sm font-bold text-green-800">Order Confirmed!</h4>
          <p className="text-xs text-green-700">Order #{orderComplete.orderId}</p>
          <p className="text-xs text-green-700">Total: ${orderComplete.total.toFixed(2)}</p>
        </div>
      )}

      {/* Product Carousel */}
      {products && products.length > 0 && (
        <div className="w-full overflow-x-auto pb-2 custom-scrollbar">
          <div className="flex gap-3 px-1">
            {products.map(product => (
              <ProductCard 
                key={product.id} 
                product={product} 
                onAddToCart={addToCart} 
              />
            ))}
          </div>
        </div>
      )}

      {/* Cart Summary / Toggle */}
      {cart.length > 0 && (
        <div className="mt-2 border-t border-gray-200 pt-2">
          <button 
            onClick={() => setIsCartOpen(!isCartOpen)}
            className="flex items-center justify-between w-full px-3 py-2 bg-blue-50 text-blue-700 rounded-md hover:bg-blue-100 transition-colors"
          >
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-4 h-4" />
              <span className="text-sm font-medium">{cart.length} items in cart</span>
            </div>
            <span className="text-sm font-bold">${cartTotal.toFixed(2)}</span>
          </button>

          {/* Cart Details */}
          {isCartOpen && (
            <div className="mt-2 bg-white border border-gray-200 rounded-md shadow-sm p-3">
              <div className="flex justify-between items-center mb-2">
                <h5 className="text-sm font-semibold">Your Cart</h5>
                <button onClick={() => setIsCartOpen(false)}><X className="w-4 h-4 text-gray-400" /></button>
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {cart.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center text-sm">
                    <span className="truncate max-w-[140px]">{item.name}</span>
                    <div className="flex items-center gap-2">
                      <span>${item.price.toFixed(2)}</span>
                      <button onClick={() => removeFromCart(idx)} className="text-red-500 hover:text-red-700">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <button 
                className="w-full mt-3 bg-blue-600 text-white py-2 rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                onClick={handleCheckout}
                disabled={isCheckingOut}
              >
                {isCheckingOut ? 'Processing...' : 'Checkout'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
