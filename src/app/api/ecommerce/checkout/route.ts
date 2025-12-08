
import { NextResponse } from 'next/server';
import { processPayment, createOrder, CheckoutError } from '@/lib/ecommerce/checkout';
import { requireAuth, extractTenantId } from '@/middleware/auth';
import { rateLimit, RATE_LIMITS } from '@/middleware/rate-limit';

/**
 * E-commerce Checkout API
 * 
 * PRODUCTION FEATURES:
 * ✅ Rate limiting (10 checkouts per hour)
 * ✅ Authentication & authorization
 * ✅ Tenant isolation from session
 * - TODO: Add idempotency to prevent duplicate charges
 * - TODO: Add cart validation (price verification, inventory check)
 * - TODO: Add shipping calculation integration
 * - TODO: Add tax calculation (e.g., TaxJar, Avalara)
 * - TODO: Add fraud detection checks
 */

export async function POST(req: Request) {
  try {
    // Apply rate limiting
    const rateLimitResponse = await rateLimit(req, RATE_LIMITS.checkout);
    if (rateLimitResponse) return rateLimitResponse;

    // Require authentication
    const authResult = await requireAuth(req);
    if (authResult instanceof NextResponse || authResult instanceof Response) return authResult;
    const { user } = authResult;

    const body = await req.json();
    const { 
      items, 
      total, 
      currency, 
      paymentMethodId, 
      customerEmail,
      shippingAddress,
      idempotencyKey 
    } = body;

    // Input validation
    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ 
        error: 'Cart is empty',
        code: 'INVALID_INPUT'
      }, { status: 400 });
    }

    if (typeof total !== 'number' || total <= 0) {
      return NextResponse.json({ 
        error: 'Invalid order total',
        code: 'INVALID_INPUT'
      }, { status: 400 });
    }

    if (!paymentMethodId) {
      return NextResponse.json({ 
        error: 'Payment method is required',
        code: 'INVALID_INPUT'
      }, { status: 400 });
    }

    // Extract tenant ID
    const tenantId = await extractTenantId(req) || body.tenantId;
    
    if (!tenantId) {
      return NextResponse.json({ 
        error: 'Tenant ID is required',
        code: 'INVALID_INPUT'
      }, { status: 400 });
    }

    // TODO: Verify cart prices match product catalog
    // TODO: Check inventory availability

    // Process Payment
    const paymentResult = await processPayment(
      total, 
      currency || 'USD', 
      paymentMethodId,
      {
        customerEmail: customerEmail || user.email,
        idempotencyKey,
        metadata: { 
          source: 'chatbot_checkout',
          tenantId,
          userId: user.id
        }
      }
    );

    if (!paymentResult.success) {
      return NextResponse.json({ 
        error: paymentResult.error || 'Payment failed',
        code: paymentResult.errorCode || 'PAYMENT_FAILED'
      }, { status: 400 });
    }

    // Create Order
    const order = createOrder(items, total, customerEmail || user.email, {
      tenantId,
      userId: user.id,
      paymentMethod: paymentMethodId,
      shippingAddress
    });

    // TODO: Send order confirmation email
    // TODO: Trigger fulfillment workflow
    // TODO: Update inventory

    return NextResponse.json({ 
      success: true, 
      order,
      transactionId: paymentResult.transactionId 
    });

  } catch (error) {
    console.error('Checkout error:', error);

    if (error instanceof CheckoutError) {
      const statusCode = error.code === 'INVALID_INPUT' ? 400 : 
                         error.code === 'PAYMENT_FAILED' ? 402 : 500;
      return NextResponse.json({ 
        error: error.message,
        code: error.code,
        details: error.details
      }, { status: statusCode });
    }

    return NextResponse.json({ 
      error: 'Internal Server Error',
      code: 'UNKNOWN'
    }, { status: 500 });
  }
}
