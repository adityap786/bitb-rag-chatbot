# BullMQ Tenant-Aware Job Queues

## Overview
All pipeline jobs are queued and processed per tenant using BullMQ. Queues are **logically partitioned** by tenant (via job tagging and isolation logic) for high throughput. While currently sharing a distributed queue infrastructure, the system design supports migration to physically sharded Redis instances if needed.

## Features
- Add jobs with tenantId tagging
- Queue sharding/partitioning for high-throughput tenants
- Distributed worker pool
- All infra is open source or free

---

This enables fast, scalable, and reliable pipeline processing for all tenants.
