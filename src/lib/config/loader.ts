import fs from 'fs';
import yaml from 'js-yaml';
import { z } from 'zod';
import { logger } from '../observability/logger';


export interface MCPToolConfig {
  name: string;
  enabled: boolean;
  endpoint: string;
  params?: Record<string, any>;
}

export interface TenantConfig {
  id: string;
  name: string;
  vector_store: string;
  embedding_provider: string;
  embedding_model: string;
  chunk_size: number;
  chunk_overlap: number;
  features: Record<string, boolean>;
  prompts: Record<string, string>;
  mcp_tools?: MCPToolConfig[];
  prompt_versions?: Record<string, Record<string, string>>;
  feature_flags?: Record<string, boolean>;
  rollout?: {
    current_prompt_version?: string;
    staged_features?: Array<{ name: string; rollout: string }>;
    canary_users?: string[];
  };
}

// Zod schema for validation
export const TenantConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  vector_store: z.string(),
  embedding_provider: z.string(),
  embedding_model: z.string(),
  chunk_size: z.number(),
  chunk_overlap: z.number(),
  features: z.record(z.string(), z.boolean()),
  prompts: z.record(z.string(), z.string()),
  mcp_tools: z.array(z.object({
    name: z.string(),
    enabled: z.boolean(),
    endpoint: z.string(),
    params: z.record(z.string(), z.any()).optional(),
  })).optional(),
  prompt_versions: z.record(z.string(), z.record(z.string(), z.string())).optional(),
  feature_flags: z.record(z.string(), z.boolean()).optional(),
  rollout: z.object({
    current_prompt_version: z.string().optional(),
    staged_features: z.array(z.object({
      name: z.string(),
      rollout: z.string(),
    })).optional(),
    canary_users: z.array(z.string()).optional(),
  }).optional(),
});


export function loadTenantConfig(path: string): TenantConfig {
  let file: string;
  try {
    file = fs.readFileSync(path, 'utf8');
  } catch (err) {
    logger?.error?.('Failed to read tenant config file', { path, error: err });
    throw new Error(`Failed to read tenant config file: ${path}`);
  }
  let parsed: unknown;
  try {
    parsed = yaml.load(file);
  } catch (err) {
    logger?.error?.('Failed to parse YAML', { path, error: err });
    throw new Error(`Failed to parse YAML in config: ${path}`);
  }
  const result = TenantConfigSchema.safeParse(parsed);
  if (!result.success) {
    // Zod v4 exposes `issues` instead of `errors` for the error details
    const issues = (result.error as any).issues ?? (result.error as any).errors ?? [];
    logger?.error?.('Tenant config validation failed', { path, issues });
    throw new Error(`Tenant config validation failed: ${JSON.stringify(issues)}`);
  }
  return result.data;
}
