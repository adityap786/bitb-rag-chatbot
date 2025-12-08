# Monitoring & Alerting Setup for BiTB RAG Chatbot

## Overview
This system exposes Prometheus-compatible metrics for real-time monitoring and alerting. Metrics cover API call volume, latency, error rates, and quota events. Integrate with Prometheus, Grafana, or Datadog for dashboards and alerts.

## Metrics Endpoint
- **Path:** `/api/monitoring`
- **Format:** Prometheus exposition (text/plain)
- **Metrics:**
  - `api_calls_total{path,status}`: Total API calls by endpoint/status
  - `api_latency_ms{path}`: Average response latency (ms) by endpoint
  - `api_errors_total{path,status}`: Total API errors by endpoint/status

## Instrumented Endpoints
- `/api/widget/chat` (streaming and normal)
- All future MCP endpoints should call `recordApiCall()`

## Setup Steps
1. **Prometheus**: Add scrape config for `/api/monitoring` endpoint.
2. **Grafana**: Create dashboards for API volume, latency, error rate.
3. **Datadog**: Use HTTP check or custom integration to ingest metrics.
4. **Alerting**: Configure alerts for high latency, error spikes, quota events.

## Example Prometheus Scrape Config
```yaml
scrape_configs:
  - job_name: 'bitb-chatbot'
    metrics_path: '/api/monitoring'
    static_configs:
      - targets: ['your-server-host:443']
```

## Extending Metrics
- Add more counters/gauges in `src/lib/monitoring.ts` as needed.
- Instrument MCP tool handlers and ingestion endpoints for full coverage.

## Troubleshooting
- If metrics are missing, check logs for errors in `recordApiCall` or `/api/monitoring`.
- Ensure endpoint is reachable from Prometheus/Grafana/Datadog.

---
For questions, contact the BiTB engineering team.