// Acceptance criteria for onboarding steps
export const acceptanceCriteria = {
  kbUpload: {
    fileType: ['pdf', 'docx', 'txt', 'md', 'csv'],
    maxSizeMB: 20,
    relevanceThreshold: 0.7,
    smokeQuery: 'What is your refund policy?'
  },
  websiteCrawl: {
    maxPages: 50,
    maxDepth: 2,
    rateLimitPerTenant: 1,
    concurrentCrawls: 2,
    relevanceThreshold: 0.6,
    homepageQuery: 'What does your company do?'
  },
  manualInput: {
    minLength: 100,
    retrievable: true
  },
  branding: {
    colorPicker: true,
    toneOptions: ['Friendly', 'Professional', 'Playful', 'Concise', 'Empathetic'],
    previewLive: true,
    toneMatchThreshold: 0.8
  },
  toolAssignment: {
    rules: {
      Service: ['book_appointment', 'qualify_lead', 'escalate_to_human'],
      ECommerce: ['add_to_cart', 'initiate_checkout', 'order_tracking', 'returns_and_refunds', 'product_detail'],
      SaaS: ['search_knowledge_base', 'subscription_and_replenishment', 'analytics_insight_generator']
    }
  },
  ragPipeline: {
    vectorsIndexed: true,
    supabaseIntegration: true,
    widgetSnippetReady: true
  },
  widget: {
    sessionCreated: true,
    secureScript: true,
    noCspCorsErrors: true
  },
  trialLifecycle: {
    startTracked: true,
    expiryTracked: true,
    notificationsSent: true,
    dataRetention: 'ephemeralUnlessOptIn'
  }
};