
import { describe, it, expect } from 'vitest';
import { processPayment, createOrder } from '../src/lib/ecommerce/checkout';

describe('Checkout utils', () => {
  it('processPayment returns success for valid amount', async () => {
    const result = await processPayment(100, 'USD', 'pm_123');
    expect(result.success).toBe(true);
    expect(result.transactionId).toBeDefined();
  });

  it('processPayment returns failure for invalid amount', async () => {
    const result = await processPayment(0, 'USD', 'pm_123');
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('createOrder creates a valid order object', () => {
    const items = [{ id: 'p1', price: 10 }];
    const order = createOrder(items, 10, 'test@example.com');
    expect(order.orderId).toBeDefined();
    expect(order.status).toBe('completed');
    expect(order.total).toBe(10);
    expect(order.customerEmail).toBe('test@example.com');
  });
});
