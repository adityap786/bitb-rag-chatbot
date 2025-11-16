// Tool assignment logic and unit tests
export function assignTools(businessType: string): string[] {
  const rules: Record<string, string[]> = {
    Service: ['book_appointment', 'qualify_lead', 'escalate_to_human'],
    ECommerce: ['add_to_cart', 'initiate_checkout', 'order_tracking', 'returns_and_refunds', 'product_detail'],
    SaaS: ['search_knowledge_base', 'subscription_and_replenishment', 'analytics_insight_generator']
  };
  return rules[businessType] || [];
}

// Unit tests
function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(msg);
}

assert(assignTools('Service').includes('book_appointment'), 'Service should include book_appointment');
assert(assignTools('ECommerce').includes('add_to_cart'), 'ECommerce should include add_to_cart');
assert(assignTools('SaaS').includes('analytics_insight_generator'), 'SaaS should include analytics_insight_generator');