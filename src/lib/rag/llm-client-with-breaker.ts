import Groq from 'groq-sdk';
import { circuitBreaker, CircuitBreakerPolicy, CircuitState, SamplingBreaker, handleAll } from 'cockatiel';
import type { ICircuitBreakerOptions } from 'cockatiel';
import {
  recordLLMBreakerFailure,
  recordLLMBreakerRequest,
  recordLLMBreakerState,
  recordLLMBreakerSuccess,
} from '../monitoring/metrics';
import type { BreakerStateLabel } from '../monitoring/metrics';
import { logger } from '../observability/logger';


interface LLMRequest {
  messages: Array<{ role: string; content: string }>;
  temperature?: number;
  maxTokens?: number;
  model?: string;
}


interface LLMResponse {
  content: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model: string;
  finishReason: string;
}


const BREAKER_OPTIONS: ICircuitBreakerOptions = {
  halfOpenAfter: 30_000,
  breaker: new SamplingBreaker({
    threshold: 0.5,
    minimumRps: 10,
    duration: 60_000,
  }),
};

const CIRCUIT_STATE_LABELS: Record<CircuitState, BreakerStateLabel> = {
  [CircuitState.Closed]: 'closed',
  [CircuitState.Open]: 'open',
  [CircuitState.HalfOpen]: 'half_open',
  [CircuitState.Isolated]: 'isolated',
};

export class GroqClientWithBreaker {
  private client: Groq;
  private breaker: CircuitBreakerPolicy;
  private defaultModel: string;
  private lastStateChangeAt = Date.now();
  private lastStateLabel: BreakerStateLabel = 'closed';
  private lastSuccessAt?: number;
  private lastFailureAt?: number;
  private lastFailureMessage?: string;

  constructor(apiKey?: string, model: string = 'mixtral-8x7b-32768') {
    const key = apiKey || process.env.GROQ_API_KEY;
    if (!key) {
      throw new Error('GROQ_API_KEY is required');
    }

    this.client = new Groq({ apiKey: key });
    this.defaultModel = model;
    this.breaker = circuitBreaker(handleAll, BREAKER_OPTIONS);

    this.breaker.onBreak(() => {
      logger.error('Circuit breaker opened - Groq calls suspended', {
        model: this.defaultModel,
      });
    });

    this.breaker.onReset(() => {
      logger.info('Circuit breaker reset', {
        model: this.defaultModel,
      });
    });

    this.breaker.onHalfOpen(() => {
      logger.info('Circuit breaker half-open', {
        model: this.defaultModel,
      });
    });

    this.breaker.onStateChange((state) => this.handleStateChange(state));
    this.handleStateChange(this.breaker.state);
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    recordLLMBreakerRequest(this.defaultModel);
    try {
      const response = await this.breaker.execute(async () => {
        const startTime = Date.now();
        try {
          const completion = await this.client.chat.completions.create({
            model: request.model || this.defaultModel,
            messages: request.messages as any,
            temperature: request.temperature ?? 0.7,
            max_tokens: request.maxTokens ?? 2048,
          });

          const choice = completion.choices[0];
          if (!choice || !choice.message) {
            throw new Error('Invalid LLM response structure');
          }

          const usage = completion.usage || {
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0,
          };

          logger.info('LLM completion succeeded', {
            model: completion.model,
            latencyMs: Date.now() - startTime,
            promptTokens: usage.prompt_tokens,
            completionTokens: usage.completion_tokens,
          });

          return {
            content: choice.message.content || '',
            usage: {
              promptTokens: usage.prompt_tokens,
              completionTokens: usage.completion_tokens,
              totalTokens: usage.total_tokens,
            },
            model: completion.model,
            finishReason: choice.finish_reason || 'stop',
          };
        } catch (error) {
          logger.error('LLM completion failed', {
            model: request.model || this.defaultModel,
            error: error instanceof Error ? error.message : String(error),
            latencyMs: Date.now() - startTime,
          });
          throw error;
        }
      });
      recordLLMBreakerSuccess(this.defaultModel);
      this.lastSuccessAt = Date.now();
      this.lastFailureMessage = undefined;
      return response;
    } catch (error) {
      recordLLMBreakerFailure(this.defaultModel);
      this.lastFailureAt = Date.now();
      this.lastFailureMessage = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  getBreakerState() {
    return {
      state: this.lastStateLabel,
      numericState: this.breaker.state,
      lastStateChangeAt: this.lastStateChangeAt,
      lastSuccessAt: this.lastSuccessAt,
      lastFailureAt: this.lastFailureAt,
      lastFailureMessage: this.lastFailureMessage,
    };
  }

  private handleStateChange(state: CircuitState) {
    const label = CIRCUIT_STATE_LABELS[state] ?? 'closed';
    this.lastStateLabel = label;
    this.lastStateChangeAt = Date.now();
    recordLLMBreakerState(this.defaultModel, label);
  }
}

let groqClientInstance: GroqClientWithBreaker | null = null;

export function getGroqClient(apiKey?: string, model?: string) {
  if (!groqClientInstance) {
    groqClientInstance = new GroqClientWithBreaker(apiKey, model);
  }
  return groqClientInstance;
}
