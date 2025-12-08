# Prometheus + Grafana Integration Guide

## 1. Prometheus Setup

- Install Prometheus: https://prometheus.io/download/
- Add a scrape config for your app:

```yaml
scrape_configs:
  - job_name: 'bitb-chatbot'
    metrics_path: '/api/monitoring'
    static_configs:
      - targets: ['your-app-host:443']
```
- Start Prometheus and verify it scrapes your metrics endpoint.

## 2. Grafana Setup

- Install Grafana: https://grafana.com/grafana/download
- Add Prometheus as a data source in Grafana.
- Import or create dashboards for:
  - API call volume
  - Latency
  - Error rates
  - Quota usage
  - Redis health (if using Redis Exporter)

## 3. Example Prometheus Queries

- API Calls: `api_calls_total`
- Latency: `api_latency_ms`
- Errors: `api_errors_total`
- Redis Memory: `redis_memory_bytes`

## 4. Alerts

- Configure alerts in Grafana for:
  - High error rate
  - High latency
  - Quota exceeded
  - Redis memory usage

## 5. Security

- Protect Prometheus and Grafana endpoints with authentication.
- Use HTTPS for all dashboards and metric endpoints.

---

For more details, see `docs/MONITORING_SETUP.md` and Prometheus/Grafana official docs.
