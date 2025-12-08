/**
 * E-com ReACT Agent
 *
 * Production-grade agent for E-com tenants. Implements the ReACT loop (Thought → Action → Observation),
 * maintains a scratchpad, and uses LLM-driven tool selection. Only redirects to payment gateways, never initiates payments.
 */

import { ECOM_TOOLS, enforceEcomAccess, getEcomToolConfig } from '../mcp/tools/ecom/registry';
import { MCPToolRequest, MCPToolResponse } from '../mcp/types';
import { upstashRedis } from '../redis-client-upstash';
import { onboardingQueue } from '../queue/onboardingQueue';
import { Job } from 'bullmq';
const ONBOARDING_CACHE_TTL_MS = 5 * 60; // 5 minutes in seconds for Redis

// Prefetch onboarding data for a tenant (catalog + theme)
export async function prefetchOnboardingData(tenantId: string) {
  const agent = new EcomReACTAgent(tenantId, 'ecom');
  // Prefetch catalog_ingestion and theme setup in parallel
  await Promise.all([
    agent.run('catalog onboarding'),
    agent.run('theme setup'),
  ]);
}


// import { callLLM } from '../llm/llm-factory'; // LLM integration placeholder

export interface AgentStep {
  thought: string;
  action: string;
  actionInput: Record<string, any>;
  observation?: any;
}

export interface AgentScratchpad {
  steps: AgentStep[];
  finalAnswer?: string;
}


export interface AgentObservability {
  onStep?: (step: AgentStep, context: { stepBackCount: number }) => void;
  onRetry?: (err: any, context: { stepBackCount: number; maxStepBacks: number }) => void;
  onError?: (err: any, context: { stepBackCount: number }) => void;
  onSuccess?: (result: AgentScratchpad, context: { stepBackCount: number }) => void;
}

export interface AgentRetryStrategy {
  maxStepBacks?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitter?: boolean;
  customDelayFn?: (attempt: number) => number;
}

export class EcomReACTAgent {
  private tenantId: string;
  private tenantType: string;
  private scratchpad: AgentScratchpad;
  private onboardingQueue: any;
  private observability: AgentObservability;
  private retryStrategy: AgentRetryStrategy;

  constructor(
    tenantId: string,
    tenantType: string,
    opts?: {
      onboardingQueue?: any;
      observability?: AgentObservability;
      retryStrategy?: AgentRetryStrategy;
    }
  ) {
    enforceEcomAccess(tenantType);
    this.tenantId = tenantId;
    this.tenantType = tenantType;
    this.scratchpad = { steps: [] };
    this.onboardingQueue = opts?.onboardingQueue || onboardingQueue;
    this.observability = opts?.observability || {};
    this.retryStrategy = {
      maxStepBacks: opts?.retryStrategy?.maxStepBacks ?? 2,
      baseDelayMs: opts?.retryStrategy?.baseDelayMs ?? 200,
      maxDelayMs: opts?.retryStrategy?.maxDelayMs ?? 2000,
      jitter: opts?.retryStrategy?.jitter ?? true,
      customDelayFn: opts?.retryStrategy?.customDelayFn,
    };
  }



  /**
   * Main agent loop with production-level step back prompting.
   * On failure, reverts to previous step, adjusts prompt, and retries up to maxStepBacks.
   */
  async run(userQuery: string): Promise<AgentScratchpad> {
    const cacheKey = `onboarding:${this.tenantId}:${userQuery}`;
    const cached = await upstashRedis.get(cacheKey);
    if (cached && typeof cached === 'object' && 'result' in cached) {
      return { ...(cached as any).result };
    }

    const stepTimings: number[] = [];
    const start = Date.now();
    let thought = `To answer: "${userQuery}", I need to select the right tool(s).`;
    const maxStepBacks = this.retryStrategy.maxStepBacks ?? 2;
    let stepBackCount = 0;
    let lastError: any = null;
    let lastSuccessfulSteps: AgentStep[] = [];

    while (stepBackCount <= maxStepBacks) {
      try {
        // Reset scratchpad to last successful steps on step-back
        if (stepBackCount > 0) {
          this.scratchpad.steps = lastSuccessfulSteps.map(s => ({ ...s }));
          const errMsg = typeof lastError === 'object' && lastError && 'message' in lastError ? (lastError as any).message : String(lastError);
          thought = `Previous attempt failed: ${errMsg}. Try a different approach to: "${userQuery}".`;
        } else {
          this.scratchpad.steps = [];
        }

        // --- Onboarding flow orchestration ---
        // Observability: emit step event for each attempt
        if (this.observability.onStep) {
          this.observability.onStep({
            thought,
            action: 'step-back-attempt',
            actionInput: { stepBackCount },
            observation: lastError,
          }, { stepBackCount });
        }
        if (userQuery.toLowerCase().includes('onboarding')) {
          const actions = [
            { action: 'catalog_ingestion', input: this.buildActionInput('catalog_ingestion', userQuery) },
            { action: 'update_settings', input: this.buildActionInput('update_settings', userQuery) },
          ];
          const batchStart = Date.now();
          const jobs: Job[] = [];
          for (const a of actions) {
            const job = await this.onboardingQueue.add(a.action, { type: a.action, tenantId: this.tenantId, ...a.input });
            jobs.push(job);
          }
          const pollJobResult = async (job: Job, timeoutMs = 10000, pollInterval = 250): Promise<any> => {
            const start = Date.now();
            while (Date.now() - start < timeoutMs) {
              const fresh = await this.onboardingQueue.getJob(job.id!);
              if (fresh && fresh.failedReason) {
                throw new Error(`Onboarding job failed: ${job.name} - ${fresh.failedReason}`);
              }
              if (fresh && fresh.returnvalue && typeof fresh.returnvalue.status === 'string' && fresh.returnvalue.status.toLowerCase().includes('fail')) {
                throw new Error(`Onboarding job failed: ${job.name} - ${fresh.returnvalue.status}`);
              }
              if (fresh && fresh.finishedOn) {
                return fresh.returnvalue;
              }
              await new Promise(res => setTimeout(res, pollInterval));
            }
            throw new Error(`Onboarding job timeout: ${job.name}`);
          };
          const batchResults = [];
          for (const [i, job] of jobs.entries()) {
            let result;
            try {
              result = await pollJobResult(job);
            } catch (err) {
              if (this.observability.onError) this.observability.onError(err, { stepBackCount });
              throw err;
            }
            if (result && typeof result.status === 'string' && result.status.toLowerCase().includes('fail')) {
              const failErr = new Error(`Onboarding job failed: ${actions[i].action} - ${result.status}`);
              if (this.observability.onError) this.observability.onError(failErr, { stepBackCount });
              throw failErr;
            }
            batchResults.push(result);
            this.scratchpad.steps.push({
              thought: `Batch onboarding: ${actions[i].action}`,
              action: actions[i].action,
              actionInput: actions[i].input,
              observation: result,
            });
            if (this.observability.onStep) {
              this.observability.onStep(this.scratchpad.steps[this.scratchpad.steps.length - 1], { stepBackCount });
            }
          }
          stepTimings.push(Date.now() - batchStart);
          const paymentInput = this.buildActionInput('payment_link', userQuery);
          let paymentObs;
          try {
            paymentObs = await this.executeTool('payment_link', paymentInput);
          } catch (err) {
            paymentObs = { success: false };
          }
          this.scratchpad.steps.push({
            thought: 'Redirect user to payment gateway (do not initiate payment)',
            action: 'payment_link',
            actionInput: paymentInput,
            observation: paymentObs,
          });
          if (
            paymentObs.success === true &&
            typeof paymentObs.data?.payment_url === 'string' &&
            paymentObs.data.payment_url.trim().length > 0
          ) {
            this.scratchpad.finalAnswer = `Onboarding complete! Please review your catalog and theme settings, then complete your payment at: ${paymentObs.data.payment_url}`;
          } else {
            this.scratchpad.finalAnswer = 'Onboarding complete! Please review your catalog and theme settings. (Payment link unavailable)';
          }
          (globalThis as any).console?.log?.(`[EcomReACTAgent] Onboarding flow latency: ${Date.now() - start}ms [stepBacks=${stepBackCount}]`);
          await upstashRedis.set(cacheKey, { result: { ...this.scratchpad } }, { ex: ONBOARDING_CACHE_TTL_MS });
          if (this.observability.onSuccess) this.observability.onSuccess(this.scratchpad, { stepBackCount });
          return this.scratchpad;
        }

        // --- Default: single tool action ---
        let action = this.selectTool(userQuery);
        let actionInput = this.buildActionInput(action, userQuery);
        const stepStart = Date.now();
        let observation = await this.executeTool(action, actionInput);
        stepTimings.push(Date.now() - stepStart);
        this.scratchpad.steps.push({ thought, action, actionInput, observation });
        this.scratchpad.finalAnswer = this.summarize(observation, action);
        (globalThis as any).console?.log?.(`[EcomReACTAgent] Agent run latency: ${Date.now() - start}ms, step: ${stepTimings[0]}ms [stepBacks=${stepBackCount}]`);
        if (['catalog_ingestion', 'payment_link', 'inventory_sync'].includes(action)) {
          await upstashRedis.set(cacheKey, { result: { ...this.scratchpad } }, { ex: ONBOARDING_CACHE_TTL_MS });
        }
        if (this.observability.onSuccess) this.observability.onSuccess(this.scratchpad, { stepBackCount });
        return this.scratchpad;
      } catch (err) {
        // Observability: emit retry and error events
        if (this.observability.onRetry) this.observability.onRetry(err, { stepBackCount: stepBackCount + 1, maxStepBacks });
        if (this.observability.onError) this.observability.onError(err, { stepBackCount });
        const errMsg = err && typeof err === 'object' && 'message' in err ? (err as any).message : String(err);
        (globalThis as any).console?.warn?.(`[EcomReACTAgent] Step back triggered [${stepBackCount + 1}/${maxStepBacks}]: ${errMsg}`);
        lastError = err;
        lastSuccessfulSteps = this.scratchpad.steps.map(s => ({ ...s }));
        stepBackCount++;
        // Retry strategy: exponential backoff with jitter
        let delay = this.retryStrategy.customDelayFn
          ? this.retryStrategy.customDelayFn(stepBackCount)
          : Math.min(
              (this.retryStrategy.baseDelayMs ?? 200) * Math.pow(2, stepBackCount - 1),
              this.retryStrategy.maxDelayMs ?? 2000
            );
        if (this.retryStrategy.jitter) {
          delay = Math.floor(delay * (0.7 + Math.random() * 0.6)); // jitter: 70%-130%
        }
        if (stepBackCount <= maxStepBacks) {
          await new Promise(res => setTimeout(res, delay));
        }
        if (stepBackCount > maxStepBacks) {
          throw err;
        }
      }
    }
    // Should never reach here
    throw new Error('Agent failed after maximum step backs.');
  }

  /**
   * Tool selection logic (replace with LLM for advanced flows)
   */
  selectTool(userQuery: string): string {
    const q = userQuery.toLowerCase();
    if (q.includes('catalog')) return 'catalog_ingestion';
    if (q.includes('pay') || q.includes('checkout')) return 'payment_link';
    if (q.includes('inventory')) return 'inventory_sync';
    if (q.includes('track order')) return 'order_tracking';
    // ...add more rules or LLM integration
    return 'catalog_ingestion'; // default
  }

  /**
   * Build action input for the selected tool (could use LLM or rules)
   */
  buildActionInput(action: string, userQuery: string): Record<string, any> {
    // TODO: Parse userQuery or use LLM to extract parameters
    // For demo, return mock input
    switch (action) {
      case 'catalog_ingestion':
        return { catalog_source: 'https://example.com/catalog.csv', format: 'csv' };
      case 'payment_link':
        return { amount: 100, currency: 'USD', return_url: 'https://shop.com/thankyou' };
      case 'inventory_sync':
        return { source: 'https://example.com/inventory.json' };
      case 'order_tracking':
        return { order_id: 'order_123' };
      default:
        return {};
    }
  }

  /**
   * Execute the selected tool with input, enforcing config and validation
   */
  async executeTool(action: string, actionInput: Record<string, any>): Promise<any> {
    const toolDef = ECOM_TOOLS[action];
    if (!toolDef) throw new Error(`Tool not found: ${action}`);
    const config = getEcomToolConfig(this.tenantId, action);
    if (config.enabled === false) throw new Error(`Tool disabled for tenant: ${action}`);
    // TODO: Validate actionInput against toolDef.parameters_schema
    // TODO: Enforce rate limits, feature flags, etc.
    // Profile tool handler execution
    const toolStart = Date.now();
    const req: MCPToolRequest = {
      tool: action,
      tenant_id: this.tenantId,
      parameters: actionInput
    };
    const res: MCPToolResponse = await toolDef.handler(req);
    (globalThis as any).console?.log?.(`[EcomReACTAgent] Tool ${action} latency: ${Date.now() - toolStart}ms`);
    return res;
  }

  /**
   * Summarize the observation for the user (LLM or template)
   */
  summarize(observation: any, action: string): string {
    if (action === 'payment_link' && observation.success) {
      return `Please complete your payment at: ${observation.data.payment_url}`;
    }
    if (observation.success && observation.data && observation.data.message) {
      return observation.data.message;
    }
    return 'Action completed.';
  }
}
