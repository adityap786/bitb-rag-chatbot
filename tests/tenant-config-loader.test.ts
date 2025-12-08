import { describe, it, expect } from 'vitest';
import path from 'path';
import { loadTenantConfig, TenantConfigSchema } from '../src/lib/config/loader';

const validConfigPath = path.join(__dirname, '../config/tenant.example.yaml');
const invalidConfigPath = path.join(__dirname, './invalid-tenant.yaml');

describe('Tenant YAML Config Loader', () => {
  it('loads and validates a correct config', () => {
    const config = loadTenantConfig(validConfigPath);
    expect(config).toBeDefined();
    expect(config.id).toBe('tn_example');
    expect(config.features.hybrid_search).toBe(true);
    expect(config.prompts.greeting).toBeDefined();
  });

  it('throws on missing file', () => {
    expect(() => loadTenantConfig('./notfound.yaml')).toThrow();
  });

  it('throws on invalid config', () => {
    // Write a minimal invalid YAML for test
    const fs = require('fs');
    fs.writeFileSync(invalidConfigPath, 'id: 123\nfeatures: not_a_map');
    expect(() => loadTenantConfig(invalidConfigPath)).toThrow();
    fs.unlinkSync(invalidConfigPath);
  });

  it('matches schema with Zod', () => {
    const config = loadTenantConfig(validConfigPath);
    const result = TenantConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
  });
});
