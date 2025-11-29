# Database Integration Plan

## Overview

This document outlines the migration from in-memory storage to Supabase/Postgres for all Phase 3 and Phase 4 features.

---

## 1. Database Schema

### Table: `bookings`

```sql
CREATE TABLE IF NOT EXISTS public.bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id TEXT NOT NULL,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_name TEXT NOT NULL,
  user_email TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'cancelled')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  
  -- Indexes for performance
  CONSTRAINT bookings_slot_id_key UNIQUE (slot_id, tenant_id)
);

CREATE INDEX idx_bookings_tenant_id ON public.bookings(tenant_id);
CREATE INDEX idx_bookings_user_id ON public.bookings(user_id);
CREATE INDEX idx_bookings_created_at ON public.bookings(created_at);
CREATE INDEX idx_bookings_status ON public.bookings(status);

-- Row Level Security
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own bookings"
  ON public.bookings FOR SELECT
  USING (auth.uid() = user_id OR tenant_id IN (
    SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can create bookings"
  ON public.bookings FOR INSERT
  WITH CHECK (tenant_id IN (
    SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can cancel their own bookings"
  ON public.bookings FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (status = 'cancelled');
```

### Table: `conversation_scores`

```sql
CREATE TABLE IF NOT EXISTS public.conversation_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  score INTEGER NOT NULL,
  feedback TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_conversation_scores_session_id ON public.conversation_scores(session_id);
CREATE INDEX idx_conversation_scores_tenant_id ON public.conversation_scores(tenant_id);
CREATE INDEX idx_conversation_scores_created_at ON public.conversation_scores(created_at);
CREATE INDEX idx_conversation_scores_score ON public.conversation_scores(score);

-- Row Level Security
ALTER TABLE public.conversation_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all scores"
  ON public.conversation_scores FOR SELECT
  USING (tenant_id IN (
    SELECT tenant_id FROM public.tenant_users 
    WHERE user_id = auth.uid() AND role = 'admin'
  ));
```

### Table: `analytics_metrics`

```sql
CREATE TABLE IF NOT EXISTS public.analytics_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  value NUMERIC NOT NULL,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  tags JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Partition by month for better performance
CREATE TABLE public.analytics_metrics_2025_01 PARTITION OF public.analytics_metrics
  FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');

-- Indexes
CREATE INDEX idx_analytics_metrics_name ON public.analytics_metrics(name);
CREATE INDEX idx_analytics_metrics_tenant_id ON public.analytics_metrics(tenant_id);
CREATE INDEX idx_analytics_metrics_created_at ON public.analytics_metrics(created_at);
CREATE INDEX idx_analytics_metrics_tags ON public.analytics_metrics USING gin(tags);

-- Row Level Security
ALTER TABLE public.analytics_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view metrics"
  ON public.analytics_metrics FOR SELECT
  USING (tenant_id IN (
    SELECT tenant_id FROM public.tenant_users 
    WHERE user_id = auth.uid() AND role = 'admin'
  ));

CREATE POLICY "System can insert metrics"
  ON public.analytics_metrics FOR INSERT
  WITH CHECK (true); -- Will be restricted by service role
```

### Table: `orders`

```sql
CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id TEXT NOT NULL UNIQUE,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  customer_email TEXT,
  items JSONB NOT NULL,
  total NUMERIC(10,2) NOT NULL CHECK (total > 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed', 'cancelled')),
  payment_method TEXT,
  transaction_id TEXT,
  shipping_address JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_orders_tenant_id ON public.orders(tenant_id);
CREATE INDEX idx_orders_user_id ON public.orders(user_id);
CREATE INDEX idx_orders_customer_email ON public.orders(customer_email);
CREATE INDEX idx_orders_status ON public.orders(status);
CREATE INDEX idx_orders_created_at ON public.orders(created_at);

-- Row Level Security
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own orders"
  ON public.orders FOR SELECT
  USING (auth.uid() = user_id OR customer_email = (
    SELECT email FROM auth.users WHERE id = auth.uid()
  ));

CREATE POLICY "Admins can view all orders"
  ON public.orders FOR SELECT
  USING (tenant_id IN (
    SELECT tenant_id FROM public.tenant_users 
    WHERE user_id = auth.uid() AND role = 'admin'
  ));
```

### Table: `phi_detection_events`

```sql
CREATE TABLE IF NOT EXISTS public.phi_detection_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id TEXT,
  phi_type TEXT NOT NULL,
  masked_value TEXT,
  context TEXT,
  action_taken TEXT NOT NULL CHECK (action_taken IN ('masked', 'blocked', 'alerted')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX idx_phi_events_tenant_id ON public.phi_detection_events(tenant_id);
CREATE INDEX idx_phi_events_created_at ON public.phi_detection_events(created_at);
CREATE INDEX idx_phi_events_phi_type ON public.phi_detection_events(phi_type);

-- Row Level Security
ALTER TABLE public.phi_detection_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view PHI events"
  ON public.phi_detection_events FOR SELECT
  USING (tenant_id IN (
    SELECT tenant_id FROM public.tenant_users 
    WHERE user_id = auth.uid() AND role = 'admin'
  ));
```

---

## 2. Migration Scripts

### Create Migration File

```bash
# Create new migration
supabase migration new add_phase3_phase4_tables
```

### Migration Script: `supabase/migrations/YYYYMMDDHHMMSS_add_phase3_phase4_tables.sql`

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Bookings table
CREATE TABLE IF NOT EXISTS public.bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id TEXT NOT NULL,
  tenant_id UUID,
  user_id UUID,
  user_name TEXT NOT NULL,
  user_email TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'cancelled')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  CONSTRAINT bookings_slot_id_key UNIQUE (slot_id, tenant_id)
);

-- Conversation scores table
CREATE TABLE IF NOT EXISTS public.conversation_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  tenant_id UUID,
  user_id UUID,
  score INTEGER NOT NULL,
  feedback TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Analytics metrics table (partitioned by month)
CREATE TABLE IF NOT EXISTS public.analytics_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  value NUMERIC NOT NULL,
  tenant_id UUID,
  tags JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
) PARTITION BY RANGE (created_at);

-- Create initial partition
CREATE TABLE public.analytics_metrics_2025_01 PARTITION OF public.analytics_metrics
  FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');

-- Orders table
CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id TEXT NOT NULL UNIQUE,
  tenant_id UUID,
  user_id UUID,
  customer_email TEXT,
  items JSONB NOT NULL,
  total NUMERIC(10,2) NOT NULL CHECK (total > 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed', 'cancelled')),
  payment_method TEXT,
  transaction_id TEXT,
  shipping_address JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- PHI detection events table
CREATE TABLE IF NOT EXISTS public.phi_detection_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,
  user_id UUID,
  session_id TEXT,
  phi_type TEXT NOT NULL,
  masked_value TEXT,
  context TEXT,
  action_taken TEXT NOT NULL CHECK (action_taken IN ('masked', 'blocked', 'alerted')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create indexes
CREATE INDEX idx_bookings_tenant_id ON public.bookings(tenant_id);
CREATE INDEX idx_bookings_user_id ON public.bookings(user_id);
CREATE INDEX idx_bookings_created_at ON public.bookings(created_at);
CREATE INDEX idx_bookings_status ON public.bookings(status);

CREATE INDEX idx_conversation_scores_session_id ON public.conversation_scores(session_id);
CREATE INDEX idx_conversation_scores_tenant_id ON public.conversation_scores(tenant_id);
CREATE INDEX idx_conversation_scores_created_at ON public.conversation_scores(created_at);
CREATE INDEX idx_conversation_scores_score ON public.conversation_scores(score);

CREATE INDEX idx_analytics_metrics_name ON public.analytics_metrics(name);
CREATE INDEX idx_analytics_metrics_tenant_id ON public.analytics_metrics(tenant_id);
CREATE INDEX idx_analytics_metrics_created_at ON public.analytics_metrics(created_at);
CREATE INDEX idx_analytics_metrics_tags ON public.analytics_metrics USING gin(tags);

CREATE INDEX idx_orders_tenant_id ON public.orders(tenant_id);
CREATE INDEX idx_orders_user_id ON public.orders(user_id);
CREATE INDEX idx_orders_customer_email ON public.orders(customer_email);
CREATE INDEX idx_orders_status ON public.orders(status);
CREATE INDEX idx_orders_created_at ON public.orders(created_at);

CREATE INDEX idx_phi_events_tenant_id ON public.phi_detection_events(tenant_id);
CREATE INDEX idx_phi_events_created_at ON public.phi_detection_events(created_at);
CREATE INDEX idx_phi_events_phi_type ON public.phi_detection_events(phi_type);

-- Enable Row Level Security
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phi_detection_events ENABLE ROW LEVEL SECURITY;

-- Comments
COMMENT ON TABLE public.bookings IS 'Appointment booking records';
COMMENT ON TABLE public.conversation_scores IS 'Conversation quality scores for analytics';
COMMENT ON TABLE public.analytics_metrics IS 'Time-series metrics data (partitioned by month)';
COMMENT ON TABLE public.orders IS 'E-commerce order records';
COMMENT ON TABLE public.phi_detection_events IS 'HIPAA PHI detection audit log';
```

---

## 3. Code Migration Guide

### Booking System

**Before** (`src/lib/booking/calendar.ts`):
```typescript
const BOOKINGS: Booking[] = [];

export function bookAppointment(...) {
  BOOKINGS.push(booking);
  return booking;
}
```

**After**:
```typescript
import { createClient } from '@/lib/supabase/server';

export async function bookAppointment(...) {
  const supabase = createClient();
  
  // Check if slot is available
  const { data: existing } = await supabase
    .from('bookings')
    .select('id')
    .eq('slot_id', slotId)
    .eq('status', 'confirmed')
    .eq('tenant_id', options?.tenantId)
    .single();
    
  if (existing) {
    throw new BookingError('Slot unavailable', 'SLOT_UNAVAILABLE');
  }
  
  // Create booking
  const { data, error } = await supabase
    .from('bookings')
    .insert({
      slot_id: slotId,
      tenant_id: options?.tenantId,
      user_id: userDetails.userId,
      user_name: userDetails.name,
      user_email: userDetails.email,
      status: 'confirmed'
    })
    .select()
    .single();
    
  if (error) throw new BookingError('DB error', 'DB_ERROR', error);
  
  return data;
}
```

### Analytics Scoring

**Before** (`src/lib/analytics/scoring.ts`):
```typescript
const CONVERSATION_SCORES: ConversationScore[] = [];

export function scoreConversation(...) {
  CONVERSATION_SCORES.push(result);
  return result;
}
```

**After**:
```typescript
import { createClient } from '@/lib/supabase/server';

export async function scoreConversation(...) {
  const supabase = createClient();
  
  // Calculate score (existing logic)
  const score = calculateScore(messages, feedback);
  
  // Insert into database
  const { data, error } = await supabase
    .from('conversation_scores')
    .insert({
      session_id: sessionId,
      tenant_id: options?.tenantId,
      user_id: options?.userId,
      score,
      feedback,
      metadata: {
        message_count: messages.length,
        error_count: errorCount
      }
    })
    .select()
    .single();
    
  if (error) throw new ScoringError('DB error', 'DB_ERROR', error);
  
  return data;
}
```

### Analytics Metrics

**Before** (`src/lib/analytics/metrics.ts`):
```typescript
const METRICS: AnalyticsMetric[] = [];

export function recordMetric(...) {
  METRICS.push({ name, value, timestamp });
}
```

**After**:
```typescript
import { createClient } from '@/lib/supabase/server';

export async function recordMetric(...) {
  const supabase = createClient();
  
  const { error } = await supabase
    .from('analytics_metrics')
    .insert({
      name: name.toLowerCase().trim(),
      value,
      tenant_id: options?.tenantId,
      tags: options?.tags
    });
    
  if (error) throw new MetricsError('DB error', 'DB_ERROR', error);
}
```

### E-commerce Orders

**Before** (`src/lib/ecommerce/checkout.ts`):
```typescript
export function createOrder(...): Order {
  return {
    orderId: `ord_${Date.now()}`,
    items,
    total,
    status: 'completed',
    ...
  };
}
```

**After**:
```typescript
import { createClient } from '@/lib/supabase/server';

export async function createOrder(...): Promise<Order> {
  const supabase = createClient();
  
  const { data, error } = await supabase
    .from('orders')
    .insert({
      order_id: `ord_${Date.now()}_${generateId()}`,
      tenant_id: options?.tenantId,
      user_id: options?.userId,
      customer_email: customerEmail,
      items,
      total,
      currency: 'USD',
      status: 'completed',
      payment_method: options?.paymentMethod,
      shipping_address: options?.shippingAddress
    })
    .select()
    .single();
    
  if (error) throw new CheckoutError('DB error', 'DB_ERROR', error);
  
  return data;
}
```

---

## 4. Deployment Steps

### Step 1: Run Migration
```bash
# Apply migration locally
supabase migration up

# OR apply in production
supabase db push
```

### Step 2: Update Code
1. Replace all in-memory arrays with Supabase queries
2. Update function signatures to be async
3. Update test mocks to use Supabase test client
4. Update API routes to handle async operations

### Step 3: Test
```bash
# Run unit tests
npm test

# Run integration tests
npm run test:integration

# Test database locally
npm run test:db
```

### Step 4: Deploy
```bash
# Deploy to staging
vercel --prod --env staging

# Smoke test
npm run test:e2e

# Deploy to production
vercel --prod
```

---

## 5. Rollback Plan

### If Migration Fails
```sql
-- Drop tables in reverse order
DROP TABLE IF EXISTS public.phi_detection_events CASCADE;
DROP TABLE IF EXISTS public.orders CASCADE;
DROP TABLE IF EXISTS public.analytics_metrics CASCADE;
DROP TABLE IF EXISTS public.conversation_scores CASCADE;
DROP TABLE IF EXISTS public.bookings CASCADE;
```

### If Code Fails in Production
1. Revert deployment to previous version
2. In-memory storage will work as fallback
3. Data created during deployment will be lost

---

## 6. Performance Optimization

### Caching Strategy
```typescript
// Redis cache for frequently accessed bookings
const cacheKey = `bookings:${date}:${tenantId}`;
const cached = await redis.get(cacheKey);

if (cached) return JSON.parse(cached);

const slots = await supabase.from('bookings')...;

await redis.setex(cacheKey, 300, JSON.stringify(slots)); // 5 min TTL
return slots;
```

### Query Optimization
```typescript
// Use select() to fetch only needed columns
const { data } = await supabase
  .from('bookings')
  .select('id, slot_id, status')  // Don't fetch all columns
  .eq('tenant_id', tenantId);
  
// Use indexes effectively
const { data } = await supabase
  .from('analytics_metrics')
  .select('*')
  .eq('name', metricName)  // Uses idx_analytics_metrics_name
  .gte('created_at', startTime)  // Uses idx_analytics_metrics_created_at
  .limit(1000);
```

---

## 7. Monitoring

### Key Metrics to Track
- Query latency (p50, p95, p99)
- Error rate by table
- Connection pool utilization
- Row count growth rate
- Index usage statistics

### Alerts
- Query latency > 1s
- Error rate > 5%
- Connection pool exhausted
- Table size > 10GB (consider partitioning)

---

## Conclusion

This migration plan provides:
✅ Complete database schema
✅ Migration scripts
✅ Code migration guide
✅ Deployment steps
✅ Rollback plan
✅ Performance optimization
✅ Monitoring strategy

**Estimated Migration Time**: 1-2 days  
**Risk Level**: Medium (requires code changes)  
**Rollback Difficulty**: Low (schema drop, code revert)
