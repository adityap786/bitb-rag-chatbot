# Phase 1: Usage Monitoring - API Quick Reference

## Quick Start Guide

### 1. Track a New Operation

```typescript
import { trackUsage } from '@/lib/trial/usage-tracker';
import { enforceQuota } from '@/lib/trial/quota-enforcer';

// Create tracker
const tracker = trackUsage(tenantId, 'chat_message', { session_id });

// Check quota first
const quota = await enforceQuota(tenantId, 'tokens', estimatedTokens);
if (!quota.allowed) {
  await tracker.recordRateLimit();
  return error(429, 'Quota exceeded');
}

// Do work...
const result = await processMessage();

// Record success
await tracker.recordSuccess({
  tokens_used: result.tokens,
  response_time_ms: elapsed,
  status_code: 200
});
```

---

### 2. Audit a Tenant Action

```typescript
import { TrialAudit, KBaudit, ConfigAudit } from '@/lib/trial/audit-logger';

// Trial events
await TrialAudit.created(tenantId, { email, businessName, businessType });
await TrialAudit.upgraded(tenantId, 'trial', 'starter');
await TrialAudit.extended(tenantId, 7, newExpiryDate);

// KB events
await KBaudit.uploaded(tenantId, kbId, 'docs.pdf', 2048000);
await KBaudit.crawled(tenantId, jobId, 'https://example.com', 45);
await KBaudit.manualAdded(tenantId, kbId, 3);

// Config events
await ConfigAudit.brandingUpdated(tenantId, configId, { 
  primary_color: '#6366f1',
  chat_tone: 'friendly'
});
await ConfigAudit.toolsAssigned(tenantId, configId, ['email', 'calendar']);

// Error events
await ErrorAudit.apiError(tenantId, '/api/chat', 500, 'Connection timeout');
await ErrorAudit.quotaExceeded(tenantId, 'tokens', 10000, 9850);
```

---

### 3. Query Usage Data

```typescript
import { 
  getTenantUsage, 
  getTodayUsage, 
  getTopConsumers,
  getTenantEvents 
} from '@/lib/trial/usage-tracker';

// Today's stats
const today = await getTodayUsage(tenantId);
console.log(`Tokens used today: ${today.total_tokens_used}`);
console.log(`Cost: $${today.estimated_cost_usd}`);
console.log(`Quota remaining: ${today.quota_remaining}`);

// Historical metrics (last 30 days)
const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
const metrics = await getTenantUsage(tenantId, thirtyDaysAgo, new Date(), 'daily');
metrics.forEach(m => {
  console.log(`${m.period_start}: ${m.api_calls_total} calls, ${m.total_tokens_used} tokens`);
});

// Top consumers (admin view)
const topByTokens = await getTopConsumers('tokens', 'daily', 10);
topByTokens.forEach(t => {
  console.log(`${t.tenant_id}: ${t.total_tokens_used} tokens`);
});

// Specific event types
const chatEvents = await getTenantEvents(tenantId, thirtyDaysAgo, new Date(), 'chat_message', 100);
console.log(`Chat events in last 30 days: ${chatEvents.length}`);
```

---

### 4. Check & Manage Quotas

```typescript
import { 
  enforceQuota, 
  getQuotaStatus, 
  setCustomQuota 
} from '@/lib/trial/quota-enforcer';

// Check single quota type
const allowed = await enforceQuota(tenantId, 'tokens', 500);
if (allowed.allowed) {
  // Process request
} else {
  console.log(`Quota limit: ${allowed.quota_limit}`);
  console.log(`Remaining: ${allowed.tokens_remaining}`);
}

// Check multiple quotas at once
const multi = await enforceMultipleQuotas(tenantId, [
  { type: 'tokens', amount: 500 },
  { type: 'api_calls', amount: 1 },
  { type: 'chat_messages', amount: 1 }
]);

if (!multi.allowed) {
  const failures = Object.entries(multi.results)
    .filter(([_, r]) => !r.allowed)
    .map(([type]) => type);
  console.log(`Exceeded quotas: ${failures.join(', ')}`);
}

// Get full quota status
const status = await getQuotaStatus(tenantId);
console.log(`Plan: ${status.plan}`);
console.log(`Tokens: ${status.quotas.tokens.used}/${status.quotas.tokens.limit}`);
console.log(`Usage: ${status.quotas.tokens.percentage}%`);

// Admin: Set custom quota
await setCustomQuota(tenantId, 'tokens', 50000); // Override to 50k tokens/day
```

---

### 5. Generate Reports

```typescript
import { 
  generateAuditReport, 
  getTenantAuditTrail,
  getFailedOperations,
  getSecurityEvents 
} from '@/lib/trial/audit-logger';

// Compliance report
const startDate = new Date('2025-11-01');
const endDate = new Date('2025-11-30');
const report = await generateAuditReport(tenantId, startDate, endDate);

console.log(`Total events: ${report.total_events}`);
console.log(`Success rate: ${(report.success_count / report.total_events * 100).toFixed(2)}%`);
console.log(`Events by type:`, report.events_by_type);

// Audit trail (last 7 days)
const trail = await getTenantAuditTrail(tenantId, 7);
trail.forEach(e => {
  console.log(`[${e.action}] ${e.event_type} - ${e.result}`);
});

// Failed operations (debugging)
const failures = await getFailedOperations(tenantId, 30);
failures.forEach(f => {
  console.log(`Failed: ${f.event_type} - ${f.error_message}`);
});

// Security violations
const security = await getSecurityEvents(tenantId, 90);
console.log(`Security events in 90 days: ${security.length}`);
```

---

### 6. Admin Dashboard Queries

```bash
# Get all usage stats (multi-tenant)
curl -H "Authorization: Bearer $TOKEN" \
  https://yourapp.com/api/admin/usage

# Get specific tenant usage
curl -H "Authorization: Bearer $TOKEN" \
  https://yourapp.com/api/admin/usage?tenantId=tenant-123

# Get top consumers by tokens
curl -H "Authorization: Bearer $TOKEN" \
  https://yourapp.com/api/admin/usage?metric=tokens

# Get top consumers by cost
curl -H "Authorization: Bearer $TOKEN" \
  https://yourapp.com/api/admin/usage?metric=cost

# Get monthly stats
curl -H "Authorization: Bearer $TOKEN" \
  https://yourapp.com/api/admin/usage?period=monthly

# Get stats for date range
curl -H "Authorization: Bearer $TOKEN" \
  "https://yourapp.com/api/admin/usage?startDate=2025-11-01&endDate=2025-11-30"

# Trigger aggregation (cron job)
curl -X POST \
  -H "x-cron-secret: $CRON_SECRET" \
  https://yourapp.com/api/admin/metrics/aggregate

# Check aggregation status
curl https://yourapp.com/api/admin/metrics/aggregate
```

---

## Integration Patterns

### Pattern A: Minimal Tracking (Fire & Forget)

```typescript
// Just track events, don't enforce quota
const tracker = trackUsage(tenantId, 'search');
try {
  const results = await search(query);
  await tracker.recordSuccess({ tokens_used: 50 });
} catch (error) {
  await tracker.recordFailure(error);
}
```

### Pattern B: Quota-Enforced (Recommended)

```typescript
// Check quota first, fail if exceeded
const quota = await enforceQuota(tenantId, 'tokens', 200);
if (!quota.allowed) {
  return error(429, { quota_remaining: quota.tokens_remaining });
}

const tracker = trackUsage(tenantId, 'embedding');
try {
  const result = await generateEmbedding(text);
  await tracker.recordSuccess({ tokens_used: result.tokens });
} catch (error) {
  await tracker.recordFailure(error, 500);
}
```

### Pattern C: Comprehensive (Full Audit Trail)

```typescript
import { trackUsage } from '@/lib/trial/usage-tracker';
import { enforceQuota } from '@/lib/trial/quota-enforcer';
import { ChatAudit, ErrorAudit } from '@/lib/trial/audit-logger';

export async function POST(req: NextRequest) {
  const { tenantId, sessionId, message } = await req.json();
  const tracker = trackUsage(tenantId, 'chat_message', { session_id: sessionId });
  
  try {
    // 1. Quota check
    const quota = await enforceQuota(tenantId, 'tokens', 150);
    if (!quota.allowed) {
      await tracker.recordRateLimit();
      await ErrorAudit.quotaExceeded(tenantId, 'tokens', quota.quota_limit || 0, 150);
      return error(429);
    }
    
    // 2. Audit incoming
    await ChatAudit.messageReceived(tenantId, sessionId, message.length);
    
    // 3. Process
    const start = Date.now();
    const response = await generateResponse(message);
    const elapsed = Date.now() - start;
    
    // 4. Estimate tokens
    const tokens = Math.ceil((message.length + response.length) / 4);
    
    // 5. Audit outgoing
    await ChatAudit.responseSent(tenantId, sessionId, tokens);
    
    // 6. Record success
    await tracker.recordSuccess({
      tokens_used: tokens,
      response_time_ms: elapsed,
      status_code: 200
    });
    
    return success({ reply: response });
  } catch (error) {
    await tracker.recordFailure(error, 500);
    await ErrorAudit.apiError(tenantId, '/api/chat', 500, error.message);
    throw error;
  }
}
```

---

## Cost Calculation Examples

**OpenAI Ada-002 (Embeddings)**: $0.02 per 1M tokens  
**OpenAI GPT-4 (Completions)**: ~$0.10 per 1M tokens

```typescript
// For embeddings (current cost calculation)
const tokens = 50000;
const costUsd = (tokens / 1_000_000) * 0.02;  // = $0.001

// For completions (would need different rate)
const completionTokens = 500000;
const completionCost = (completionTokens / 1_000_000) * 0.10;  // = $0.05
```

---

## Dashboard Views (Expected Output)

### Admin Dashboard - Multi-Tenant Summary
```json
{
  "period": "daily",
  "summary": {
    "total_tenants": 127,
    "total_api_calls": 45230,
    "total_tokens": 15000000,
    "total_cost": 300.00,
    "avg_latency_ms": 245
  },
  "topConsumers": [
    { "tenant_id": "acme-corp", "total_tokens_used": 5000000 },
    { "tenant_id": "startup-xyz", "total_tokens_used": 3500000 },
    ...
  ],
  "exceedingQuota": [
    { "tenant_id": "overuse-inc", "quota_exceeded_count": 12 }
  ]
}
```

### Tenant Dashboard - Single Tenant
```json
{
  "tenantId": "acme-corp",
  "period": "daily",
  "usage": [
    {
      "period_start": "2025-11-16T00:00:00Z",
      "api_calls_total": 542,
      "api_latency_p95_ms": 1250,
      "chat_messages_sent": 127,
      "embeddings_generated": 32,
      "total_tokens_used": 125000,
      "estimated_cost_usd": 2.50,
      "error_rate": 2.3
    }
  ],
  "quota": {
    "plan": "pro",
    "quotas": {
      "tokens": { "limit": 500000, "used": 125000, "remaining": 375000, "percentage": 25 },
      "api_calls": { "limit": 120, "used": 4, "remaining": 116, "percentage": 3 }
    },
    "anyExceeded": false
  },
  "recentEvents": [
    { "timestamp": "2025-11-16T14:32:15Z", "event_type": "chat_message", "action": "create", "result": "success" }
  ]
}
```

---

## Monitoring & Alerting (Recommended)

Set up alerts for:

| Alert | Threshold | Action |
|-------|-----------|--------|
| Quota exceeded | > 0 events/day | Send email to tenant + ops |
| High latency | p99 > 5000ms | Page on-call engineer |
| High error rate | > 5% | Create incident ticket |
| Cost anomaly | > 2x moving avg | Review tenant activity |
| Aggregation failure | Cron doesn't complete | Alert ops |

---

## Testing Your Implementation

```bash
# 1. Check database tables exist
psql -c "SELECT * FROM tenant_usage_metrics LIMIT 1;"
psql -c "SELECT * FROM audit_events LIMIT 1;"

# 2. Verify functions exist
psql -c "SELECT * FROM pg_proc WHERE proname = 'aggregate_usage_metrics';"

# 3. Test tracking
# Make a chat request, then query:
SELECT COUNT(*) FROM tenant_usage_realtime WHERE tenant_id = 'test-tenant';

# 4. Test quota enforcement
# Simulate high usage:
INSERT INTO tenant_usage_metrics (tenant_id, period_type, total_tokens_used, quota_limit) 
VALUES ('test', 'daily', 9999, 10000);

# 5. Run aggregation
curl -X POST \
  -H "x-cron-secret: test-secret" \
  http://localhost:3000/api/admin/metrics/aggregate

# 6. Verify aggregation
SELECT COUNT(*) FROM tenant_usage_metrics WHERE period_type = 'daily';
```

---

## Troubleshooting

### Issue: "Quota check always returns allowed=true"
**Cause**: No metric row exists for today  
**Fix**: Create initial metric row when trial starts, or use `NULL` quota_limit for unlimited

### Issue: "Usage not appearing in dashboard"
**Cause**: Aggregation hasn't run yet  
**Fix**: Manually trigger aggregation cron or wait for scheduled run

### Issue: "Cost calculation looks wrong"
**Cause**: Token estimation formula too simple  
**Fix**: Use actual token counts from LLM API responses instead of length-based estimate

### Issue: "Audit events growing too fast"
**Cause**: Every operation creates audit entry  
**Fix**: Consider batch inserts or sampling for very high-traffic tenants

---

## Performance Tuning

**For high-volume usage**:
1. Batch insert realtime events (buffer 100, flush every 10s)
2. Use materialized views for dashboard queries
3. Partition audit_events by tenant_id + timestamp
4. Archive events >30 days to cold storage

**Example batch insert**:
```typescript
const buffer: UsageEventPayload[] = [];

export function trackUsageBatched(payload: UsageEventPayload) {
  buffer.push(payload);
  if (buffer.length >= 100 || timeUntilFlush > 10000) {
    flushBuffer();
  }
}

async function flushBuffer() {
  await supabase.from('tenant_usage_realtime').insert(buffer);
  buffer.length = 0;
}
```

