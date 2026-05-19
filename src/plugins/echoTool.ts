import { Plugin, pluginRegistry } from './registry';

// Example plugin: LLM tool that echoes input
export const echoTool: Plugin = {
  meta: {
    id: 'echo-tool',
    name: 'Echo Tool',
    description: 'Returns the input as output',
    type: 'llm-tool',
    version: '1.0.0',
    tenantScoped: true,
  },
  async handle(input, ctx) {
    return { echo: input };
  },
};

pluginRegistry.register(echoTool);
