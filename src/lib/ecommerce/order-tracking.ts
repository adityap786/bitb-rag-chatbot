/**
 * Order Tracking Service
 * 
 * Real-time order tracking with platform webhooks.
 * Features:
 * - Multi-platform order aggregation
 * - Real-time status updates
 * - Shipment tracking
 * - Customer notifications
 * - Event-driven architecture
 */

import { EventEmitter } from 'events';

// Order status flow
export type OrderStatus = 
  | 'pending'
  | 'confirmed'
  | 'processing'
  | 'on_hold'
  | 'packed'
  | 'shipped'
  | 'in_transit'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled'
  | 'refunded'
  | 'failed';

export type ShipmentStatus =
  | 'label_created'
  | 'picked_up'
  | 'in_transit'
  | 'out_for_delivery'
  | 'delivered'
  | 'exception'
  | 'returned';

export interface OrderItem {
  id: string;
  productId: string;
  variantId?: string;
  sku?: string;
  name: string;
  quantity: number;
  price: number;
  discount?: number;
  imageUrl?: string;
  properties?: Record<string, string>;
}

export interface ShippingAddress {
  name: string;
  company?: string;
  address1: string;
  address2?: string;
  city: string;
  province: string;
  postalCode: string;
  country: string;
  phone?: string;
}

export interface Shipment {
  id: string;
  carrier: string;
  carrierCode?: string;
  trackingNumber: string;
  trackingUrl: string;
  status: ShipmentStatus;
  estimatedDelivery?: Date;
  actualDelivery?: Date;
  events: ShipmentEvent[];
}

export interface ShipmentEvent {
  timestamp: Date;
  status: ShipmentStatus;
  location?: string;
  description: string;
}

export interface Payment {
  id: string;
  method: string;
  status: 'pending' | 'authorized' | 'captured' | 'partially_refunded' | 'refunded' | 'failed';
  amount: number;
  currency: string;
  transactionId?: string;
  last4?: string;
  cardBrand?: string;
}

export interface Order {
  id: string;
  externalId: string;
  platform: string;
  tenantId: string;
  customerId: string;
  customerEmail: string;
  customerPhone?: string;
  status: OrderStatus;
  items: OrderItem[];
  subtotal: number;
  discount: number;
  shipping: number;
  tax: number;
  total: number;
  currency: string;
  shippingAddress: ShippingAddress;
  billingAddress?: ShippingAddress;
  shipments: Shipment[];
  payment: Payment;
  notes?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
  confirmedAt?: Date;
  shippedAt?: Date;
  deliveredAt?: Date;
  cancelledAt?: Date;
}

export interface OrderEvent {
  id: string;
  orderId: string;
  type: string;
  status?: OrderStatus;
  shipmentId?: string;
  data?: Record<string, unknown>;
  timestamp: Date;
}

// Carrier integrations
interface CarrierTrackingResult {
  status: ShipmentStatus;
  estimatedDelivery?: Date;
  events: ShipmentEvent[];
}

export class OrderTrackingService extends EventEmitter {
  private orders: Map<string, Order> = new Map();
  private orderEvents: Map<string, OrderEvent[]> = new Map();
  private pollingIntervals: Map<string, ReturnType<typeof setInterval>> = new Map();

  constructor() {
    super();
  }

  /**
   * Create or update an order from platform webhook
   */
  async processOrderWebhook(
    platform: string,
    event: string,
    payload: Record<string, unknown>
  ): Promise<Order | null> {
    switch (event) {
      case 'orders/create':
      case 'order.created':
        return this.createOrder(platform, payload);
      case 'orders/updated':
      case 'order.updated':
        return this.updateOrder(platform, payload);
      case 'orders/fulfilled':
      case 'order.fulfilled':
        return this.handleFulfillment(platform, payload);
      case 'orders/cancelled':
      case 'order.cancelled':
        return this.cancelOrder(platform, payload);
      case 'orders/paid':
      case 'order.paid':
        return this.handlePayment(platform, payload);
      default:
        console.log(`Unknown order event: ${event}`);
        return null;
    }
  }

  /**
   * Create a new order
   */
  async createOrder(
    platform: string,
    data: Record<string, unknown>
  ): Promise<Order> {
    const order = this.mapPlatformOrder(platform, data);
    this.orders.set(order.id, order);
    
    this.addOrderEvent(order.id, {
      id: this.generateId(),
      orderId: order.id,
      type: 'order_created',
      status: order.status,
      timestamp: new Date(),
    });

    this.emit('order:created', order);
    return order;
  }

  /**
   * Update an existing order
   */
  async updateOrder(
    platform: string,
    data: Record<string, unknown>
  ): Promise<Order | null> {
    const externalId = data['id'] as string;
    const order = this.findByExternalId(externalId, platform);
    
    if (!order) return null;

    const updatedData = this.mapPlatformOrder(platform, data);
    const previousStatus = order.status;
    
    Object.assign(order, updatedData, { id: order.id, updatedAt: new Date() });

    if (previousStatus !== order.status) {
      this.addOrderEvent(order.id, {
        id: this.generateId(),
        orderId: order.id,
        type: 'status_changed',
        status: order.status,
        data: { previousStatus },
        timestamp: new Date(),
      });

      this.emit('order:status_changed', order, previousStatus);
    }

    this.emit('order:updated', order);
    return order;
  }

  /**
   * Handle order fulfillment
   */
  async handleFulfillment(
    platform: string,
    data: Record<string, unknown>
  ): Promise<Order | null> {
    const externalId = data['order_id'] as string || data['id'] as string;
    const order = this.findByExternalId(externalId, platform);
    
    if (!order) return null;

    // Extract shipment information
    const shipment = this.mapPlatformShipment(platform, data);
    if (shipment) {
      order.shipments.push(shipment);
      
      this.addOrderEvent(order.id, {
        id: this.generateId(),
        orderId: order.id,
        type: 'shipment_created',
        shipmentId: shipment.id,
        data: { trackingNumber: shipment.trackingNumber, carrier: shipment.carrier },
        timestamp: new Date(),
      });

      // Start tracking
      this.startShipmentTracking(order.id, shipment.id);
    }

    order.status = 'shipped';
    order.shippedAt = new Date();
    order.updatedAt = new Date();

    this.emit('order:shipped', order, shipment);
    return order;
  }

  /**
   * Cancel an order
   */
  async cancelOrder(
    platform: string,
    data: Record<string, unknown>
  ): Promise<Order | null> {
    const externalId = data['id'] as string;
    const order = this.findByExternalId(externalId, platform);
    
    if (!order) return null;

    order.status = 'cancelled';
    order.cancelledAt = new Date();
    order.updatedAt = new Date();

    this.addOrderEvent(order.id, {
      id: this.generateId(),
      orderId: order.id,
      type: 'order_cancelled',
      status: 'cancelled',
      data: { reason: data['cancel_reason'] },
      timestamp: new Date(),
    });

    this.emit('order:cancelled', order);
    return order;
  }

  /**
   * Handle payment events
   */
  async handlePayment(
    platform: string,
    data: Record<string, unknown>
  ): Promise<Order | null> {
    const externalId = data['order_id'] as string || data['id'] as string;
    const order = this.findByExternalId(externalId, platform);
    
    if (!order) return null;

    order.payment.status = 'captured';
    order.status = 'confirmed';
    order.confirmedAt = new Date();
    order.updatedAt = new Date();

    this.addOrderEvent(order.id, {
      id: this.generateId(),
      orderId: order.id,
      type: 'payment_captured',
      data: { amount: order.total },
      timestamp: new Date(),
    });

    this.emit('order:paid', order);
    return order;
  }

  /**
   * Get order by ID
   */
  getOrder(orderId: string): Order | undefined {
    return this.orders.get(orderId);
  }

  /**
   * Get orders for a customer
   */
  getCustomerOrders(customerId: string): Order[] {
    return Array.from(this.orders.values())
      .filter(order => order.customerId === customerId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * Get orders for a tenant
   */
  getTenantOrders(tenantId: string, options?: {
    status?: OrderStatus;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }): Order[] {
    let orders = Array.from(this.orders.values())
      .filter(order => order.tenantId === tenantId);

    if (options?.status) {
      orders = orders.filter(order => order.status === options.status);
    }

    if (options?.startDate) {
      orders = orders.filter(order => order.createdAt >= options.startDate!);
    }

    if (options?.endDate) {
      orders = orders.filter(order => order.createdAt <= options.endDate!);
    }

    orders.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    if (options?.limit) {
      orders = orders.slice(0, options.limit);
    }

    return orders;
  }

  /**
   * Get order timeline
   */
  getOrderTimeline(orderId: string): OrderEvent[] {
    return this.orderEvents.get(orderId) || [];
  }

  /**
   * Track shipment with carrier API
   */
  async trackShipment(carrier: string, trackingNumber: string): Promise<CarrierTrackingResult | null> {
    // Implementation for different carriers
    switch (carrier.toLowerCase()) {
      case 'ups':
        return this.trackUPS(trackingNumber);
      case 'fedex':
        return this.trackFedEx(trackingNumber);
      case 'usps':
        return this.trackUSPS(trackingNumber);
      case 'dhl':
        return this.trackDHL(trackingNumber);
      default:
        console.log(`Unsupported carrier: ${carrier}`);
        return null;
    }
  }

  /**
   * Start polling for shipment updates
   */
  startShipmentTracking(orderId: string, shipmentId: string): void {
    const key = `${orderId}:${shipmentId}`;
    
    if (this.pollingIntervals.has(key)) return;

    // Poll every 30 minutes
    const interval = setInterval(async () => {
      await this.updateShipmentStatus(orderId, shipmentId);
    }, 30 * 60 * 1000);

    this.pollingIntervals.set(key, interval);

    // Initial check
    this.updateShipmentStatus(orderId, shipmentId);
  }

  /**
   * Stop shipment tracking
   */
  stopShipmentTracking(orderId: string, shipmentId: string): void {
    const key = `${orderId}:${shipmentId}`;
    const interval = this.pollingIntervals.get(key);
    
    if (interval) {
      clearInterval(interval);
      this.pollingIntervals.delete(key);
    }
  }

  /**
   * Update shipment status from carrier
   */
  private async updateShipmentStatus(orderId: string, shipmentId: string): Promise<void> {
    const order = this.orders.get(orderId);
    if (!order) return;

    const shipment = order.shipments.find(s => s.id === shipmentId);
    if (!shipment) return;

    const tracking = await this.trackShipment(shipment.carrier, shipment.trackingNumber);
    if (!tracking) return;

    const previousStatus = shipment.status;
    shipment.status = tracking.status;
    shipment.events = tracking.events;
    
    if (tracking.estimatedDelivery) {
      shipment.estimatedDelivery = tracking.estimatedDelivery;
    }

    if (previousStatus !== tracking.status) {
      this.addOrderEvent(orderId, {
        id: this.generateId(),
        orderId,
        type: 'shipment_status_changed',
        shipmentId,
        data: { previousStatus, newStatus: tracking.status },
        timestamp: new Date(),
      });

      this.emit('shipment:status_changed', order, shipment, previousStatus);

      // Update order status
      if (tracking.status === 'delivered') {
        order.status = 'delivered';
        order.deliveredAt = new Date();
        shipment.actualDelivery = new Date();
        this.stopShipmentTracking(orderId, shipmentId);
        this.emit('order:delivered', order);
      } else if (tracking.status === 'out_for_delivery') {
        order.status = 'out_for_delivery';
        this.emit('order:out_for_delivery', order);
      } else if (tracking.status === 'in_transit') {
        order.status = 'in_transit';
      }
    }

    order.updatedAt = new Date();
  }

  /**
   * Cleanup all polling intervals
   */
  shutdown(): void {
    for (const [key, interval] of this.pollingIntervals) {
      clearInterval(interval);
    }
    this.pollingIntervals.clear();
  }

  // Carrier-specific tracking implementations (stubs - would call actual APIs)
  private async trackUPS(_trackingNumber: string): Promise<CarrierTrackingResult | null> {
    // Would call UPS Tracking API
    // https://developer.ups.com/api/reference?loc=en_US#operation/getSingleTrackResponseUsingGET
    return null;
  }

  private async trackFedEx(_trackingNumber: string): Promise<CarrierTrackingResult | null> {
    // Would call FedEx Track API
    // https://developer.fedex.com/api/en-us/catalog/track.html
    return null;
  }

  private async trackUSPS(_trackingNumber: string): Promise<CarrierTrackingResult | null> {
    // Would call USPS Web Tools API
    // https://www.usps.com/business/web-tools-apis/track-and-confirm-api.htm
    return null;
  }

  private async trackDHL(_trackingNumber: string): Promise<CarrierTrackingResult | null> {
    // Would call DHL Shipment Tracking API
    // https://developer.dhl.com/api-reference/shipment-tracking
    return null;
  }

  // Helper methods
  private findByExternalId(externalId: string, platform: string): Order | undefined {
    return Array.from(this.orders.values())
      .find(order => order.externalId === externalId && order.platform === platform);
  }

  private addOrderEvent(orderId: string, event: OrderEvent): void {
    if (!this.orderEvents.has(orderId)) {
      this.orderEvents.set(orderId, []);
    }
    this.orderEvents.get(orderId)!.push(event);
  }

  private generateId(): string {
    return `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  private mapPlatformOrder(platform: string, data: Record<string, unknown>): Order {
    // Map platform-specific order format to unified Order type
    switch (platform) {
      case 'shopify':
        return this.mapShopifyOrder(data);
      case 'woocommerce':
        return this.mapWooCommerceOrder(data);
      default:
        return this.mapGenericOrder(platform, data);
    }
  }

  private mapShopifyOrder(data: Record<string, unknown>): Order {
    const lineItems = (data['line_items'] as Array<Record<string, unknown>>) || [];
    const shippingAddr = (data['shipping_address'] as Record<string, string>) || {};
    const customer = (data['customer'] as Record<string, unknown>) || {};
    const paymentGateways = Array.isArray(data['payment_gateway_names'])
      ? (data['payment_gateway_names'] as string[])
      : [];
    const paymentGateway = paymentGateways[0] || '';

    return {
      id: this.generateId(),
      externalId: String(data['id']),
      platform: 'shopify',
      tenantId: '', // Set from context
      customerId: String(customer['id'] || ''),
      customerEmail: String(data['email'] || customer['email'] || ''),
      customerPhone: String(data['phone'] || customer['phone'] || ''),
      status: this.mapShopifyStatus(String(data['financial_status']), String(data['fulfillment_status'])),
      items: lineItems.map(item => ({
        id: String(item['id']),
        productId: String(item['product_id']),
        variantId: String(item['variant_id']),
        sku: String(item['sku'] || ''),
        name: String(item['title']),
        quantity: Number(item['quantity']),
        price: parseFloat(String(item['price'])),
        discount: parseFloat(String(item['total_discount'] || 0)),
      })),
      subtotal: parseFloat(String(data['subtotal_price'] || 0)),
      discount: parseFloat(String(data['total_discounts'] || 0)),
      shipping: (() => {
        const priceSet = data['total_shipping_price_set'] as Record<string, unknown> | undefined;
        const shopMoney = priceSet?.['shop_money'] as Record<string, unknown> | undefined;
        return parseFloat(String(shopMoney?.['amount'] || 0));
      })(),
      tax: parseFloat(String(data['total_tax'] || 0)),
      total: parseFloat(String(data['total_price'] || 0)),
      currency: String(data['currency']),
      shippingAddress: {
        name: `${shippingAddr['first_name'] || ''} ${shippingAddr['last_name'] || ''}`.trim(),
        company: shippingAddr['company'],
        address1: shippingAddr['address1'] || '',
        address2: shippingAddr['address2'],
        city: shippingAddr['city'] || '',
        province: shippingAddr['province'] || '',
        postalCode: shippingAddr['zip'] || '',
        country: shippingAddr['country'] || '',
        phone: shippingAddr['phone'],
      },
      shipments: [],
      payment: {
        id: String(data['checkout_id'] || ''),
          method: paymentGateway,
        status: this.mapShopifyPaymentStatus(String(data['financial_status'])),
        amount: parseFloat(String(data['total_price'] || 0)),
        currency: String(data['currency']),
      },
      tags: (data['tags'] as string)?.split(',').map(t => t.trim()) || [],
      createdAt: new Date(String(data['created_at'])),
      updatedAt: new Date(String(data['updated_at'])),
    };
  }

  private mapWooCommerceOrder(data: Record<string, unknown>): Order {
    const lineItems = (data['line_items'] as Array<Record<string, unknown>>) || [];
    const shipping = (data['shipping'] as Record<string, string>) || {};
    const billing = (data['billing'] as Record<string, string>) || {};

    return {
      id: this.generateId(),
      externalId: String(data['id']),
      platform: 'woocommerce',
      tenantId: '',
      customerId: String(data['customer_id'] || ''),
      customerEmail: billing['email'] || '',
      customerPhone: billing['phone'],
      status: this.mapWooCommerceStatus(String(data['status'])),
      items: lineItems.map(item => ({
        id: String(item['id']),
        productId: String(item['product_id']),
        variantId: String(item['variation_id'] || ''),
        sku: String(item['sku'] || ''),
        name: String(item['name']),
        quantity: Number(item['quantity']),
        price: parseFloat(String(item['price'])),
      })),
      subtotal: parseFloat(String(data['subtotal'] || 0)),
      discount: parseFloat(String(data['discount_total'] || 0)),
      shipping: parseFloat(String(data['shipping_total'] || 0)),
      tax: parseFloat(String(data['total_tax'] || 0)),
      total: parseFloat(String(data['total'] || 0)),
      currency: String(data['currency']),
      shippingAddress: {
        name: `${shipping['first_name'] || ''} ${shipping['last_name'] || ''}`.trim(),
        company: shipping['company'],
        address1: shipping['address_1'] || '',
        address2: shipping['address_2'],
        city: shipping['city'] || '',
        province: shipping['state'] || '',
        postalCode: shipping['postcode'] || '',
        country: shipping['country'] || '',
        phone: shipping['phone'],
      },
      shipments: [],
      payment: {
        id: String(data['transaction_id'] || ''),
        method: String(data['payment_method_title'] || ''),
        status: data['date_paid'] ? 'captured' : 'pending',
        amount: parseFloat(String(data['total'] || 0)),
        currency: String(data['currency']),
      },
      createdAt: new Date(String(data['date_created'])),
      updatedAt: new Date(String(data['date_modified'])),
    };
  }

  private mapGenericOrder(platform: string, data: Record<string, unknown>): Order {
    return {
      id: this.generateId(),
      externalId: String(data['id']),
      platform,
      tenantId: '',
      customerId: String(data['customer_id'] || ''),
      customerEmail: String(data['email'] || ''),
      status: 'pending',
      items: [],
      subtotal: 0,
      discount: 0,
      shipping: 0,
      tax: 0,
      total: parseFloat(String(data['total'] || 0)),
      currency: String(data['currency'] || 'USD'),
      shippingAddress: {
        name: '',
        address1: '',
        city: '',
        province: '',
        postalCode: '',
        country: '',
      },
      shipments: [],
      payment: {
        id: '',
        method: '',
        status: 'pending',
        amount: 0,
        currency: 'USD',
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  private mapPlatformShipment(platform: string, data: Record<string, unknown>): Shipment | null {
    const trackingInfo = data['tracking_info'] as Record<string, unknown> || data;
    const trackingNumber = String(trackingInfo['number'] || trackingInfo['tracking_number'] || '');
    const carrier = String(trackingInfo['company'] || trackingInfo['carrier'] || '');

    if (!trackingNumber) return null;

    return {
      id: this.generateId(),
      carrier,
      trackingNumber,
      trackingUrl: String(trackingInfo['url'] || trackingInfo['tracking_url'] || ''),
      status: 'label_created',
      events: [],
    };
  }

  private mapShopifyStatus(financial: string, fulfillment: string | null): OrderStatus {
    if (financial === 'refunded') return 'refunded';
    if (financial === 'voided') return 'cancelled';
    if (fulfillment === 'fulfilled') return 'shipped';
    if (fulfillment === 'partial') return 'processing';
    if (financial === 'paid') return 'confirmed';
    return 'pending';
  }

  private mapShopifyPaymentStatus(status: string): Payment['status'] {
    const map: Record<string, Payment['status']> = {
      pending: 'pending',
      authorized: 'authorized',
      paid: 'captured',
      partially_paid: 'captured',
      partially_refunded: 'partially_refunded',
      refunded: 'refunded',
      voided: 'failed',
    };
    return map[status] || 'pending';
  }

  private mapWooCommerceStatus(status: string): OrderStatus {
    const map: Record<string, OrderStatus> = {
      pending: 'pending',
      processing: 'processing',
      'on-hold': 'on_hold',
      completed: 'delivered',
      cancelled: 'cancelled',
      refunded: 'refunded',
      failed: 'failed',
    };
    return map[status] || 'pending';
  }
}

export { OrderTrackingService as default };
