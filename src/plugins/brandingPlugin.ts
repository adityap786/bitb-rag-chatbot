import { Plugin, pluginRegistry } from './registry';

// Example plugin: Branding injector
export const brandingPlugin: Plugin = {
  meta: {
    id: 'branding-injector',
    name: 'Branding Injector',
    description: 'Injects branding metadata into responses',
    type: 'branding',
    version: '1.0.0',
    tenantScoped: true,
    configSchema: {
      type: 'object',
      properties: {
        logoUrl: { type: 'string' },
        color: { type: 'string' },
      },
      required: ['logoUrl', 'color'],
    },
  },
  async handle(input, ctx) {
    return {
      ...input,
      branding: {
        logoUrl: ctx.config.logoUrl,
        color: ctx.config.color,
      },
    };
  },
};

pluginRegistry.register(brandingPlugin);
