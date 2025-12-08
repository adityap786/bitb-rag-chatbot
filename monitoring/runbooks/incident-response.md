# Incident Response Runbook

## Table of Contents
- [High Error Rate](#high-error-rate)
- [Service Down](#service-down)
- [Circuit Breaker Open](#circuit-breaker-open)
- [Database Connection Issues](#database-connection-issues)
- [Auth Attack / Suspicious Activity](#auth-attack--suspicious-activity)
- [Tenant Isolation Violation](#tenant-isolation-violation)
- [High RAG Latency](#high-rag-latency)
- [Low Availability](#low-availability)

---

## High Error Rate

**Alert:** `HighErrorRate`  
**Severity:** Critical (P0)  
**Threshold:** >5% error rate for 5 minutes

### Symptoms
- Users experiencing 5xx errors
- Increased error rate in logs
- Dashboard shows spike in error metric

### Investigation Steps

1. **Check error distribution by endpoint**
   ```promql
   rate(http_requests_total{status=~"5..",job="bitb-chatbot"}[5m])
   ```

2. **Review recent deployments**
   - Check if error rate increased after deployment
   - Review git history for recent changes

3. **Check service dependencies**
   - Database health: `/api/health/database`
   - Redis health: `/api/health/redis`
   - Groq API health: `/api/health/groq`
   - BullMQ health: `/api/health/queue`

4. **Check logs for error patterns**
   ```bash
   # If using centralized logging
   tail -f /var/log/bitb-chatbot/error.log | grep "ERROR"
   ```

### Remediation

**Immediate (< 5 min):**
- If isolated to specific endpoint, disable feature flag if available
- If widespread, consider rollback to last known good version

**Short-term (< 30 min):**
- Fix identified bug and deploy hotfix
- Scale up instances if related to load

**Long-term:**
- Add missing error handling
- Improve input validation
- Add integration tests for failure scenario

### Escalation
- **P0:** Page on-call engineer immediately
- **No improvement after 15 min:** Escalate to engineering lead

---

## Service Down

**Alert:** `ServiceDown`  
**Severity:** Critical (P0)  
**Threshold:** Health check failing for 2 minutes

### Symptoms
- Health check endpoint returning 503
- Specific service (database, Redis, Groq, BullMQ) unreachable

### Investigation Steps

1. **Identify which service is down**
   ```bash
   curl https://your-domain.com/api/health/database
   curl https://your-domain.com/api/health/redis
   curl https://your-domain.com/api/health/groq
   curl https://your-domain.com/api/health/queue
   ```

2. **Check service-specific health**
   - **Database:** Check Supabase dashboard, connection pool
   - **Redis:** Verify Redis instance is running, check memory usage
   - **Groq:** Check Groq status page, API key validity
   - **BullMQ:** Check Redis connection, queue processing

3. **Review recent changes**
   - Configuration changes
   - Infrastructure changes
   - Network changes

### Remediation

**Database Down:**
```bash
# Check Supabase connection
psql $DATABASE_URL -c "SELECT 1;"

# Check connection pool
# Review active connections in Supabase dashboard
```

**Redis Down:**
```bash
# Check Redis connection
redis-cli -u $REDIS_URL ping

# Restart Redis if needed (varies by hosting)
```

**Groq API Down:**
- Check Groq status page: https://status.groq.com
- Verify API key: `curl https://api.groq.com/openai/v1/models -H "Authorization: Bearer $GROQ_API_KEY"`
- Fallback: Consider switching to OpenAI temporarily

**BullMQ Down:**
- Usually caused by Redis issues - follow Redis troubleshooting
- Check worker processes are running

### Escalation
- **P0:** Page on-call immediately
- **External service down:** Contact vendor support

---

## Circuit Breaker Open

**Alert:** `CircuitBreakerOpen`  
**Severity:** Critical (P0)  
**Threshold:** Circuit breaker open for 5 minutes

### Symptoms
- Requests to protected service failing fast
- Circuit breaker dashboard shows OPEN state
- Users receiving error messages about service unavailability

### Investigation Steps

1. **Check which circuit breaker is open**
   - Groq API circuit breaker most common

2. **Review failure metrics**
   ```promql
   rate(circuit_breaker_failures_total{breaker="groq"}[5m])
   ```

3. **Check protected service health**
   - For Groq: Check Groq API status
   - Review error logs for failure reasons

4. **Check recent traffic patterns**
   - Sudden spike in requests?
   - DDoS or abuse attempt?

### Remediation

**Groq Circuit Breaker:**
```typescript
// Circuit breaker will automatically attempt to close after timeout
// Monitor half-open state transitions

// If Groq API is healthy but breaker stuck:
// 1. Verify Groq API key is valid
// 2. Check rate limits on Groq side
// 3. Consider increasing circuit breaker threshold if traffic legitimately increased
```

**Manual Reset (use with caution):**
- Circuit breakers self-heal - manual reset usually not recommended
- If absolutely necessary, restart application (forces breaker reset)

### Prevention
- Monitor failure rate trends
- Implement better retry logic
- Add request throttling before circuit breaker

### Escalation
- **P0 if users affected:** Page on-call
- **P1 if fallback working:** Notify engineering team

---

## Database Connection Issues

**Alert:** `DatabaseConnectionPoolExhausted`  
**Severity:** Critical (P0)  
**Threshold:** >90 active connections for 5 minutes

### Symptoms
- Slow database queries
- Connection timeout errors
- "Pool exhausted" errors in logs

### Investigation Steps

1. **Check current connection count**
   ```sql
   SELECT count(*) FROM pg_stat_activity WHERE state = 'active';
   ```

2. **Identify long-running queries**
   ```sql
   SELECT pid, now() - query_start AS duration, query 
   FROM pg_stat_activity 
   WHERE state = 'active' AND now() - query_start > interval '1 minute'
   ORDER BY duration DESC;
   ```

3. **Check for connection leaks**
   - Review code for missing connection releases
   - Check if Supavisor (connection pooling) is enabled

### Remediation

**Immediate:**
```sql
-- Kill long-running queries (carefully!)
SELECT pg_terminate_backend(pid) 
FROM pg_stat_activity 
WHERE state = 'active' AND now() - query_start > interval '5 minutes';
```

**Short-term:**
- Enable Supavisor connection pooling (if not already)
- Increase connection pool size temporarily
- Add connection timeout limits

**Long-term:**
- Implement connection pooling properly
- Add query optimization
- Add database replica for read queries

### Prevention
```typescript
// Ensure proper connection handling
const client = await supabase.from('table')...
// Always use .single() or .limit() to prevent unbounded queries
```

### Escalation
- **P0:** Page database admin and on-call engineer
- **Persistent issue:** Contact Supabase support

---

## Auth Attack / Suspicious Activity

**Alert:** `SuspiciousAuthActivity`  
**Severity:** Critical (P0)  
**Threshold:** >5 failed auth attempts/sec for 5 minutes

### Symptoms
- High rate of failed authentication attempts
- Specific IP or tenant with unusual activity
- Rate limiting being triggered excessively

### Investigation Steps

1. **Identify attack source**
   ```promql
   topk(10, rate(auth_attempts_total{status="failed"}[5m])) by (ip, tenant_id)
   ```

2. **Check for patterns**
   - Credential stuffing (many different usernames)
   - Brute force (same username, many passwords)
   - Distributed attack (many IPs)

3. **Review audit logs**
   ```sql
   SELECT * FROM audit_logs 
   WHERE event_type = 'auth_failure' 
   AND created_at > NOW() - INTERVAL '1 hour'
   ORDER BY created_at DESC
   LIMIT 100;
   ```

### Remediation

**Immediate:**
```typescript
// Block specific IP temporarily
// Add to rate limiter with very restrictive limits

// If Redis rate limiter available:
await rateLimiter.clearRateLimit('ip:attacker-ip');
// Then manually set very low limit for that IP
```

**Short-term:**
- Enable CAPTCHA for failed auth attempts
- Implement progressive delays
- Notify affected users

**Long-term:**
- Implement account lockout after N failures
- Add behavioral analysis
- Integrate with WAF (Web Application Firewall)

### Escalation
- **P0:** Page security team and on-call engineer
- **Large-scale attack:** Engage DDoS mitigation service

---

## Tenant Isolation Violation

**Alert:** `TenantIsolationViolation`  
**Severity:** Critical (P0)  
**Threshold:** >0 violations

### Symptoms
- Audit log shows cross-tenant data access
- User reporting seeing another tenant's data
- **THIS IS THE MOST CRITICAL ALERT**

### Investigation Steps

1. **STOP:** This is a security incident - follow security protocol

2. **Preserve evidence**
   ```sql
   -- Export violation logs immediately
   SELECT * FROM audit_logs 
   WHERE event_type = 'tenant_isolation_violation'
   ORDER BY created_at DESC;
   ```

3. **Identify scope**
   - Which tenants affected?
   - What data was accessed?
   - How many violations?

4. **Root cause analysis**
   - Review recent code changes
   - Check RLS policies
   - Review query patterns

### Remediation

**IMMEDIATE (< 5 min):**
- **HALT DEPLOYMENTS**
- Enable emergency maintenance mode if needed
- Rollback to last known good version

**Within 1 hour:**
- Fix RLS policy or code bug
- Thoroughly test fix
- Deploy hotfix

**Within 24 hours:**
- Notify affected customers (legal/compliance requirement)
- Conduct full security audit
- Document incident for post-mortem

### Prevention
```sql
-- All queries MUST filter by tenant_id
-- Example RLS policy:
CREATE POLICY tenant_isolation ON documents
  FOR ALL
  USING (tenant_id = current_setting('app.tenant_id')::text);
```

### Escalation
- **P0 - IMMEDIATE:** Page CTO, Security Lead, Legal
- **Required:** File security incident report
- **Required:** Customer notification (within regulatory timeframe)

---

## High RAG Latency

**Alert:** `HighRAGLatency`  
**Severity:** Warning (P1)  
**Threshold:** p95 > 5 seconds for 10 minutes

### Symptoms
- Slow query responses
- User complaints about response time
- Timeout errors

### Investigation Steps

1. **Identify bottleneck**
   ```promql
   # Vector search latency
   histogram_quantile(0.95, rate(vector_search_duration_seconds_bucket[5m]))
   
   # LLM generation latency
   histogram_quantile(0.95, rate(llm_generation_duration_seconds_bucket[5m]))
   ```

2. **Check database performance**
   ```sql
   -- Check slow queries
   SELECT query, mean_exec_time, calls 
   FROM pg_stat_statements 
   ORDER BY mean_exec_time DESC 
   LIMIT 10;
   ```

3. **Check LLM API latency**
   - Groq API status
   - Model being used (some models slower)

4. **Check cache hit rate**
   ```promql
   rate(rag_cache_hits_total[5m]) / (rate(rag_cache_hits_total[5m]) + rate(rag_cache_misses_total[5m]))
   ```

### Remediation

**Vector Search Slow:**
- Check pgvector index health
- Consider reducing similarity_top_k
- Add query result caching

**LLM Generation Slow:**
- Switch to faster model temporarily
- Reduce max_tokens if possible
- Check Groq API status

**Database Slow:**
- Analyze and optimize slow queries
- Add missing indexes
- Scale up database if needed

**Low Cache Hit Rate:**
- Review cache strategy
- Increase cache size
- Improve cache key generation

### Prevention
- Set appropriate timeouts
- Implement request queueing
- Add response streaming for better UX

### Escalation
- **P1:** Notify engineering team
- **Persistent >10s:** Escalate to P0

---

## Low Availability

**Alert:** `APIAvailabilityLow`  
**Severity:** Critical (P0)  
**Threshold:** <99.9% availability for 5 minutes

### Symptoms
- SLA breach
- High error rate
- Service intermittently unavailable

### Investigation Steps

1. **Check error types**
   ```promql
   sum by (status) (rate(http_requests_total{status=~"5.."}[5m]))
   ```

2. **Identify affected endpoints**
   ```promql
   topk(5, rate(http_requests_total{status=~"5.."}[5m])) by (route)
   ```

3. **Check infrastructure health**
   - Server CPU/memory
   - Network connectivity
   - Load balancer health

4. **Review incident timeline**
   - When did availability drop?
   - Correlation with deployments or traffic?

### Remediation

**High Load:**
- Scale up instances
- Enable rate limiting more aggressively
- Cache more aggressively

**Specific Endpoint Failing:**
- Disable feature flag
- Route traffic away from failing endpoint
- Deploy fix

**Infrastructure Issue:**
- Restart unhealthy instances
- Contact hosting provider
- Failover to backup region if available

### Prevention
- Load testing before major releases
- Gradual rollout (canary deployments)
- Circuit breakers on all external calls
- Implement graceful degradation

### Escalation
- **P0:** Page SRE team and on-call engineer
- **SLA breach:** Notify leadership and prepare customer communication

---

## General Incident Response Process

### 1. Acknowledge (< 5 min)
- Acknowledge alert in alerting system
- Post in incident channel: "Investigating [Alert Name]"

### 2. Assess (< 15 min)
- Determine severity (P0/P1/P2)
- Identify affected users/services
- Establish incident commander if P0

### 3. Mitigate (< 30 min for P0)
- Apply immediate fix or rollback
- Communicate status to stakeholders
- Monitor metrics for improvement

### 4. Resolve (< 4 hours for P0)
- Deploy permanent fix
- Verify metrics returned to normal
- Update status page

### 5. Post-Mortem (within 48 hours)
- Document timeline
- Identify root cause
- Create action items
- Share learnings

---

## Contact Information

- **On-Call Engineer:** PagerDuty rotation
- **Security Team:** security@bitb.ai
- **Infrastructure Team:** infra@bitb.ai
- **Customer Support:** support@bitb.ai

## External Resources

- Supabase Status: https://status.supabase.com
- Groq Status: https://status.groq.com
- Internal Wiki: https://wiki.bitb.ai
- Monitoring Dashboards: https://grafana.bitb.ai

## Status Page

Update status page for all P0 incidents:
- https://status.bitb.ai

Template:
```
[Investigating] We are investigating reports of [issue description].
[Update] We have identified the issue and are working on a fix.
[Resolved] The issue has been resolved. All services are operational.
```
