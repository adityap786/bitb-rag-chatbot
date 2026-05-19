import { describe, it, expect } from 'vitest';
import { pluginRegistry } from '../../src/plugins/registry';
import { loadPluginsForTenant } from '../../src/plugins/loadPluginsForTenant';
import { invokePluginsOfType } from '../../src/plugins/invokePluginsOfType';

// Mock tenant and plugin config
const tenantId = 'test-tenant-1';

// Register a test plugin
pluginRegistry.register({
  meta: {
    id: 'test-plugin',
    name: 'Test Plugin',
    type: 'llm-tool',
    version: '1.0.0',
    tenantScoped: true,
  },
  async handle(input, ctx) {
    return { result: `Handled: ${input}` };
  },
});

pluginRegistry.enableForTenant('test-plugin', tenantId);

describe('Multi-Tenant Plugin System', () => {
  it('should invoke enabled plugin for tenant', async () => {
    const results = await invokePluginsOfType(tenantId, 'llm-tool', 'hello');
    expect(results[0]).toEqual({ result: 'Handled: hello' });
  });
});
