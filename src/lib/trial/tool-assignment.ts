import type { KBAnalysis, ToolAssignmentRules } from '../../types/trial';

export const TOOL_ASSIGNMENT_MATRIX: Record<string, ToolAssignmentRules> = {
  service: {
    businessType: 'service',
    mandatoryTools: ['faq_search', 'contact_form'],
    optionalTools: ['booking_calendar', 'lead_qualifier'],
    promptModifiers: {
      tone: 'Focus on consultation and building trust.',
      cta: 'Guide users to book a consultation or request a quote.',
    },
  },
  ecommerce: {
    businessType: 'ecommerce',
    mandatoryTools: ['product_search', 'order_tracking', 'cart_assistant'],
    optionalTools: ['recommendation_engine', 'discount_finder'],
    promptModifiers: {
      tone: 'Be concise and action-oriented. Highlight products.',
      cta: 'Drive users toward product pages and checkout.',
    },
  },
  saas: {
    businessType: 'saas',
    mandatoryTools: ['docs_search', 'feature_guide', 'onboarding_assistant'],
    optionalTools: ['integration_helper', 'billing_support'],
    promptModifiers: {
      tone: 'Technical but friendly. Focus on unblocking users.',
      cta: 'Help users complete setup or discover features.',
    },
  },
  other: {
    businessType: 'other',
    mandatoryTools: ['faq_search', 'contact_form'],
    optionalTools: [],
    promptModifiers: {
      tone: 'Adaptive and helpful.',
      cta: 'Understand user needs and route appropriately.',
    },
  },
};

export function assignTools(businessType: string, kbAnalysis: KBAnalysis): string[] {
  const rules = TOOL_ASSIGNMENT_MATRIX[businessType] || TOOL_ASSIGNMENT_MATRIX.other;
  const tools = [...rules.mandatoryTools];

  // Heuristic-based optional tool assignment
  if (kbAnalysis.hasSchedulingKeywords && rules.optionalTools.includes('booking_calendar')) {
    tools.push('booking_calendar');
  }

  if (kbAnalysis.hasProductCatalog && rules.optionalTools.includes('product_search')) {
    tools.push('product_search');
  }

  if (kbAnalysis.hasApiDocs && rules.optionalTools.includes('integration_helper')) {
    tools.push('integration_helper');
  }

  return tools;
}

export function analyzeKnowledgeBase(documents: string[]): KBAnalysis {
  if (documents.length === 0) {
    return {
      hasSchedulingKeywords: false,
      hasProductCatalog: false,
      hasApiDocs: false,
      averageDocLength: 0,
      topicClusters: [],
    };
  }

  const allText = documents.join(' ').toLowerCase();

  return {
    hasSchedulingKeywords: /\b(book|appointment|schedule|calendar|meeting|consultation)\b/i.test(allText),
    hasProductCatalog: /\b(price|buy|add to cart|sku|product|shop|order|browse|cart|checkout)\b/i.test(allText),
    hasApiDocs: /\b(endpoint|api|curl|authentication|request|response|json)\b/i.test(allText),
    averageDocLength: documents.reduce((sum, d) => sum + d.length, 0) / documents.length,
    topicClusters: [], // Placeholder - use ML clustering in production
  };
}

export function generatePromptTemplate(businessType: string, tools: string[]): string {
  const rules = TOOL_ASSIGNMENT_MATRIX[businessType] || TOOL_ASSIGNMENT_MATRIX.other;
  
  return `You are a helpful AI assistant for a ${businessType} business.

${rules.promptModifiers.tone}

Available tools: ${tools.join(', ')}

${rules.promptModifiers.cta}

Use the provided context from the knowledge base to answer questions accurately. If you don't know the answer, politely say so and offer to connect the user with a human representative.

Always be:
- Clear and concise
- Professional yet approachable
- Focused on solving the user's problem
- Proactive in offering relevant information`;
}
