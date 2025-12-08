const Redis = require('ioredis');

const redis = new Redis('rediss://default:CQKL3Q2giMdD3WuFtvbMLRgOsMzS6RGB@redis-14163.c330.asia-south1-1.gce.cloud.redislabs.com:14163', {
  tls: { rejectUnauthorized: true },
  family: 4
});

redis.ping()
  .then(console.log)
  .catch(console.error)
  .finally(() => redis.disconnect());
