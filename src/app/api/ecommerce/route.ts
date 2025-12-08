
import { NextResponse } from 'next/server';
import { searchProducts, getProductById } from '@/lib/ecommerce/products';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, payload } = body;

    if (action === 'product_search') {
      const { query } = payload;
      const results = searchProducts(query);
      return NextResponse.json({ results });
    }

    if (action === 'get_product') {
      const { productId } = payload;
      const product = getProductById(productId);
      if (!product) {
        return NextResponse.json({ error: 'Product not found' }, { status: 404 });
      }
      return NextResponse.json({ product });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
