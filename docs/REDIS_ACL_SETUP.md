## Redis ACL Setup (8.2+)

1. Create dedicated Redis users for each subsystem:
   ```
   ACL SETUSER langcache on >yourpassword ~langcache:* +get +set +del
   ACL SETUSER ratelimiter on >yourpassword ~ratelimit:* +eval +zadd +zcard +zremrangebyscore +pexpire
   ```

2. Update your connection strings to use these users:
   ```
   rediss://langcache:yourpassword@host:port
   ```

3. Restrict commands and key patterns for least-privilege access.

4. Rotate passwords regularly and monitor ACL logs for anomalies.

5. Ensure Redis is configured for persistence and TLS:
   - In `redis.conf`:
     ```
     appendonly yes
     save 900 1 300 10 60 10000
     tls-port 6379
     tls-cert-file /etc/redis/server.crt
     tls-key-file /etc/redis/server.key
     tls-ca-cert-file /etc/redis/ca.crt
     requirepass yourpassword
     ```
   - Use `rediss://` in all connection strings.

6. Monitor Redis health and keyspace via Prometheus Redis Exporter and `/api/health/rag-pipeline` endpoint.
