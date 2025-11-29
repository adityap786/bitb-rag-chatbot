# Monitoring Setup Guide

This directory contains production monitoring configuration for the BIT B RAG Chatbot system.

## Contents

- **dashboards/** - Grafana dashboard JSON definitions (4 dashboards)
- **alerts/** - Prometheus alert rules
- **runbooks/** - Incident response procedures

---

## Quick Start

### 1. Prerequisites

- Prometheus server running
- Grafana instance installed
- Application exposing metrics at `/api/metrics`

### 2. Import Dashboards

**Via Grafana UI:**
1. Go to Grafana → Dashboards → Import
2. Upload each JSON file from `dashboards/`
3. Select your Prometheus data source

**Via API:**
```bash
# System Health Dashboard
curl -X POST http://grafana:3000/api/dashboards/db \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d @dashboards/system-health.json

# RAG Pipeline Dashboard
curl -X POST http://grafana:3000/api/dashboards/db \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d @dashboards/rag-pipeline.json

# Security Dashboard
curl -X POST http://grafana:3000/api/dashboards/db \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d @dashboards/security.json

# Business Metrics Dashboard
curl -X POST http://grafana:3000/api/dashboards/db \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d @dashboards/business-metrics.json
```

### 3. Configure Alerts

**Option A: Prometheus**
```bash
# Copy alert rules to Prometheus
cp alerts/production-alerts.yml /etc/prometheus/alerts.d/

# Reload Prometheus config
curl -X POST http://prometheus:9090/-/reload
```

**Option B: Grafana Alerting**
1. Import alert rules in Grafana UI
2. Configure notification channels (Slack, PagerDuty, etc.)

### 4. Setup Notification Channels

**Slack Integration:**
```yaml
# alertmanager.yml
receivers:
  - name: 'slack-critical'
    slack_configs:
      - api_url: 'https://hooks.slack.com/services/YOUR/WEBHOOK/URL'
        channel: '#alerts-critical'
        title: '🚨 {{ .GroupLabels.alertname }}'
        text: |
          *Severity:* {{ .GroupLabels.severity }}
          *Component:* {{ .GroupLabels.component }}
          
          {{ range .Alerts }}
          *Summary:* {{ .Annotations.summary }}
          *Description:* {{ .Annotations.description }}
          *Runbook:* {{ .Annotations.runbook }}
          {{ end }}

  - name: 'slack-warning'
    slack_configs:
      - api_url: 'https://hooks.slack.com/services/YOUR/WEBHOOK/URL'
        channel: '#alerts-warning'
```

**PagerDuty Integration:**
```yaml
receivers:
  - name: 'pagerduty'
    pagerduty_configs:
      - service_key: 'YOUR_PAGERDUTY_INTEGRATION_KEY'
        description: '{{ .GroupLabels.alertname }}: {{ range .Alerts }}{{ .Annotations.description }}{{ end }}'
```

---

## Dashboard Overview

### 1. System Health
**Purpose:** Monitor overall system health and performance

**Key Metrics:**
- HTTP request rate and error rate
- Response time (p50, p95, p99)
- Database connections
- Memory and CPU usage
- Service health status (Database, Redis, Groq, BullMQ)

**Alerts:**
- ✅ High Error Rate (>5% for 5min)
- ✅ High Response Time (p95 >5s)
- ✅ Service Down (health check failing)

**Recommended Refresh:** 30 seconds

---

### 2. RAG Pipeline
**Purpose:** Monitor RAG query performance and LLM usage

**Key Metrics:**
- RAG query rate and latency
- Vector search performance
- LLM generation time
- Cache hit rate
- Token usage (prompt + completion)
- Ingestion queue size
- Circuit breaker status

**Alerts:**
- ✅ High RAG Latency (p95 >5s)
- ✅ Circuit Breaker Open
- ✅ Low Cache Hit Rate (<30%)
- ✅ High Token Usage

**Recommended Refresh:** 30 seconds

---

### 3. Security
**Purpose:** Monitor security events and threats

**Key Metrics:**
- Rate limit violations
- Failed authentication attempts
- PII detection rate
- Injection attempts blocked
- Guardrails triggered
- Tenant isolation status
- Audit log events

**Alerts:**
- ✅ High Rate Limit Violations
- ✅ Suspicious Auth Activity (possible attack)
- ✅ Tenant Isolation Violation (CRITICAL)

**Recommended Refresh:** 30 seconds

---

### 4. Business Metrics
**Purpose:** Track business KPIs and usage

**Key Metrics:**
- Active trials
- Trial conversion rate
- Query volume (total and per tenant)
- User satisfaction (feedback ratings)
- Documents ingested
- Trial workflow completion rates
- LLM cost estimates

**Alerts:**
- ℹ️ Low Trial Signup Rate
- ℹ️ Low Conversion Rate
- ⚠️ High LLM Costs

**Recommended Refresh:** 1 minute

---

## Alert Severity Levels

| Severity | Response Time | Notification | Example |
|----------|---------------|--------------|---------|
| **Critical (P0)** | < 15 min | PagerDuty + Slack | Service down, High error rate |
| **Warning (P1)** | < 2 hours | Slack | High latency, Low cache hit rate |
| **Info (P2)** | < 24 hours | Slack | Low trial signups, High costs |

---

## Prometheus Metrics Reference

### HTTP Metrics
```promql
http_requests_total{job="bitb-chatbot"}               # Total HTTP requests
http_request_duration_seconds_bucket                   # Request latency histogram
```

### RAG Pipeline Metrics
```promql
rag_queries_total                                      # Total RAG queries
rag_query_duration_seconds_bucket                      # RAG query latency
vector_search_duration_seconds_bucket                  # Vector search time
llm_generation_duration_seconds_bucket                 # LLM generation time
rag_cache_hits_total                                   # Cache hits
rag_cache_misses_total                                 # Cache misses
llm_tokens_total{type="prompt"}                        # Prompt tokens
llm_tokens_total{type="completion"}                    # Completion tokens
circuit_breaker_state{breaker="groq"}                  # Circuit breaker status
```

### Security Metrics
```promql
rate_limit_exceeded_total                              # Rate limit violations
auth_attempts_total{status="failed"}                   # Failed auth attempts
pii_detected_total                                     # PII detections
injection_blocked_total                                # Injection attempts blocked
tenant_isolation_violations_total                      # Tenant isolation violations
```

### System Metrics
```promql
health_check_status{service="database"}                # Health checks
supabase_db_connections                                # DB connections
process_resident_memory_bytes                          # Memory usage
process_cpu_seconds_total                              # CPU usage
```

### Business Metrics
```promql
trial_created_total                                    # Trial signups
trial_converted_total                                  # Trial conversions
trial_status{status="active"}                          # Active trials
documents_processed_total                              # Documents processed
```

---

## Testing

### 1. Test Metrics Endpoint

```bash
# Check metrics are being exposed
curl http://localhost:3000/api/metrics

# Should return Prometheus format metrics
# Example:
# # HELP http_requests_total Total HTTP requests
# # TYPE http_requests_total counter
# http_requests_total{method="GET",route="/api/ask",status="200"} 42
```

### 2. Test Prometheus Scraping

```bash
# Check Prometheus targets
curl http://prometheus:9090/api/v1/targets

# Should show your app as UP
```

### 3. Test Alerts

```bash
# Trigger rate limit to test alert
for i in {1..200}; do
  curl http://localhost:3000/api/ask -d '{"query":"test"}' -H "Content-Type: application/json"
done

# Check alert fired in Prometheus
curl http://prometheus:9090/api/v1/alerts
```

### 4. Test Grafana Dashboard

1. Open Grafana
2. Navigate to imported dashboard
3. Verify all panels loading data
4. Check for "No Data" panels (indicates missing metrics)

---

## Troubleshooting

### Dashboard Shows "No Data"

**Cause:** Prometheus not scraping or metrics not being emitted

**Fix:**
```bash
# 1. Check app metrics endpoint
curl http://your-app/api/metrics

# 2. Check Prometheus targets
# Go to Prometheus → Status → Targets
# Ensure your app target is UP

# 3. Check Prometheus config
cat /etc/prometheus/prometheus.yml | grep bitb-chatbot

# 4. Check if metrics exist in Prometheus
# Go to Prometheus → Graph → Execute query
http_requests_total{job="bitb-chatbot"}
```

### Alerts Not Firing

**Cause:** Alert rules not loaded or threshold not met

**Fix:**
```bash
# 1. Check alert rules loaded
curl http://prometheus:9090/api/v1/rules

# 2. Check alert evaluation
# Go to Prometheus → Alerts
# Shows if alert is pending/firing

# 3. Verify query returns data
# Execute alert query in Prometheus UI
```

### Slack Notifications Not Working

**Cause:** Webhook misconfigured or Alertmanager not running

**Fix:**
```bash
# 1. Test webhook manually
curl -X POST https://hooks.slack.com/services/YOUR/WEBHOOK/URL \
  -H 'Content-Type: application/json' \
  -d '{"text":"Test alert"}'

# 2. Check Alertmanager logs
docker logs alertmanager

# 3. Check Alertmanager config
curl http://alertmanager:9093/api/v1/status
```

---

## Production Deployment

### 1. Prometheus Configuration

```yaml
# prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'bitb-chatbot'
    static_configs:
      - targets: ['your-app:3000']
    metrics_path: '/api/metrics'
    
rule_files:
  - '/etc/prometheus/alerts.d/*.yml'

alerting:
  alertmanagers:
    - static_configs:
        - targets: ['alertmanager:9093']
```

### 2. Grafana Configuration

```yaml
# datasources.yml
apiVersion: 1

datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
```

### 3. Docker Compose Example

```yaml
version: '3.8'

services:
  prometheus:
    image: prom/prometheus:latest
    volumes:
      - ./monitoring/alerts:/etc/prometheus/alerts.d
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
    ports:
      - "9090:9090"
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--web.enable-lifecycle'

  grafana:
    image: grafana/grafana:latest
    volumes:
      - ./monitoring/dashboards:/etc/grafana/provisioning/dashboards
      - ./datasources.yml:/etc/grafana/provisioning/datasources/datasources.yml
    ports:
      - "3000:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=your-secure-password
      - GF_INSTALL_PLUGINS=grafana-piechart-panel

  alertmanager:
    image: prom/alertmanager:latest
    volumes:
      - ./alertmanager.yml:/etc/alertmanager/alertmanager.yml
    ports:
      - "9093:9093"
    command:
      - '--config.file=/etc/alertmanager/alertmanager.yml'
```

---

## Maintenance

### Weekly Tasks
- Review alert noise (false positives)
- Check dashboard accuracy
- Update runbooks based on incidents

### Monthly Tasks
- Review and optimize expensive queries
- Update alert thresholds based on growth
- Archive old incident reports

### Quarterly Tasks
- Conduct disaster recovery drill
- Review and update monitoring strategy
- Evaluate new monitoring tools

---

## Support

- **Documentation:** See `runbooks/incident-response.md`
- **Questions:** Contact DevOps team
- **Issues:** File ticket in internal ticketing system

---

## Next Steps

1. ✅ Import all 4 dashboards
2. ✅ Configure alert rules
3. ✅ Setup notification channels
4. ✅ Test end-to-end alert flow
5. ✅ Train team on runbooks
6. ✅ Schedule first on-call rotation

**Monitoring is live! 🎉**
