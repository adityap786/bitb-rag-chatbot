/**
 * Lightweight LLM resolver
 *
 * Provides a single place to determine which model should be used for a tenant.
 * Uses open-source models via Groq (free tier) - no paid APIs.
 * The AI reflection modules built on top of the `ai` package call this helper.
 */

import { createGroq } from '@ai-sdk/groq';
import type { LanguageModel } from 'ai';

const DEFAULT_MODEL =
  process.env.BITB_LLM_MODEL ||
  process.env.LLM_MODEL ||
  process.env.GROQ_MODEL ||
  'llama-3.3-70b-versatile';

const sanitizeTenantId = (tenantId: string) =>
  tenantId
    .replace(/[^a-zA-Z0-9]/g, '_')
    .toUpperCase();

const getOverrideForTenant = (tenantId: string): string | undefined => {
  const normalized = sanitizeTenantId(tenantId || 'default');
  const envNames = [
    `BITB_LLM_MODEL_${normalized}`,
    `LLM_MODEL_${normalized}`,
  ];

  for (const name of envNames) {
    if (process.env[name]) {
      return process.env[name]!;
    }
  }

  return undefined;
};

/**
 * Get the model ID string for a tenant
 */
export function getModelId(tenantId: string): string {
  if (!tenantId || tenantId === 'default') {
    return getOverrideForTenant('default') ?? DEFAULT_MODEL;
  }

  return getOverrideForTenant(tenantId) ?? DEFAULT_MODEL;
}

/**
 * Get a LanguageModel instance for the given tenant
 * Uses Groq API with free tier open-source models
 */
export function getLLM(tenantId: string): LanguageModel {
  const modelId = getModelId(tenantId);
  const groq = createGroq({
    apiKey: process.env.GROQ_API_KEY,
  });
  return groq(modelId);
}
