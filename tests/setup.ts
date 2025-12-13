// Test setup file executed before tests run.
// Sets safe defaults for environment variables and lightweight test helpers.

// ========================================================
// DISABLE EXTERNAL NETWORK CALLS DURING TESTS
// This prevents hangs when Supabase/Langfuse/Groq are down
// ========================================================
process.env.LANGFUSE_ENABLED = 'false';
process.env.OTEL_SDK_DISABLED = 'true';
process.env.OPENTELEMETRY_SDK_DISABLED = 'true';

// Ensure we have a deterministic NODE_ENV for test runs
;(process.env as Record<string, string | undefined>).NODE_ENV ||= 'test';

 // Provide safe defaults so tests that check for required env vars don't fail
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-key';
process.env.GROQ_API_KEY = process.env.GROQ_API_KEY || 'test-key';
// Only set REDIS_URL when explicitly opted in.
// Setting this by default makes code think Redis is configured and can
// unintentionally activate BullMQ/Redis-backed flows during unit tests.
if (process.env.TEST_USE_REDIS === '1') {
	process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
}

// Allow tests to opt-in to exercising Redis-backed code paths.
// Some tests mock `ioredis` and expect the code to use Redis when REDIS_URL is present.
// Do NOT enable Redis-backed code paths by default in tests. Tests that
// specifically need the Redis-backed implementation can set
// `TEST_USE_REDIS=1` in their environment/CI configuration.

// Optionally, place any global lightweight mocks here. Keep this file small
// to avoid interfering with tests that set up their own, file-local mocks.

// Example (commented): to stub a global fetch in older Node versions
// if (!globalThis.fetch) {
//   // lightweight fetch shim if tests need it
//   // import('node-fetch').then(m => { globalThis.fetch = m.default as any; });
// }

// Provide lightweight global mocks for `ioredis` and `bullmq` so unit tests
// don't attempt real network connections. Tests that need real services
// should opt-in by setting environment variables and removing these mocks.
import { vi } from 'vitest';

// ========================================================
// GLOBAL SUPABASE MOCK — prevents network calls during test
// Supabase on maintenance or offline should not block tests
// ========================================================
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    rpc: vi.fn().mockImplementation((fn: string) => {
      if (fn === 'set_tenant_context') return Promise.resolve({ error: null });
      if (fn === 'match_embeddings_by_tenant') return Promise.resolve({ data: [], error: null });
      return Promise.resolve({ error: null });
    }),
    from: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    count: 2,
    then: function (cb: (arg: any) => any) { return cb(this); },
    catch: function () { return this; },
  })),
}));

// Mock `ioredis` with an in-memory store supporting the operations used by
// the codebase and tests (script LOAD, evalsha token-bucket, hmget/hmset, del, keys, ping, quit).
vi.mock('ioredis', () => {
	class MockRedis {
		private store = new Map<string, any>();
		private scriptStore = new Map<string, string>();
		public status: string = 'ready';
		private handlers = new Map<string, Function[]>();

		constructor(..._args: any[]) {
			// Simulate ready state
			setTimeout(() => this.emit('connect'), 0);
		}

		on(event: string, handler: Function) {
			if (!this.handlers.has(event)) this.handlers.set(event, []);
			this.handlers.get(event)!.push(handler);
			if (event === 'connect') setTimeout(() => handler(), 0);
		}

		emit(event: string, ...args: any[]) {
			const hs = this.handlers.get(event) || [];
			for (const h of hs) h(...args);
		}

		async connect() {
			this.status = 'ready';
			return;
		}

		async quit() {
			this.status = 'end';
			this.emit('close');
			return 'OK';
		}

		async script(command: string, script: string): Promise<string> {
			if (command === 'LOAD') {
				const sha = 'sha-' + Math.random().toString(36).slice(2, 10);
				this.scriptStore.set(sha, script);
				return sha;
			}
			throw new Error('Unknown script command');
		}

		async evalsha(sha: string, numKeys: number, key: string, ...args: string[]): Promise<any> {
			// Token bucket simulation used by rate-limiter scripts.
			const max_tokens = parseFloat(args[0]);
			const refill_rate = parseFloat(args[1]);
			const current_time = parseFloat(args[2]);
			const window_ms = parseFloat(args[3]);

			let bucket = this.store.get(key);
			if (!bucket) {
				bucket = {
					tokens: max_tokens,
					last_refill: current_time,
					max_tokens,
					refill_rate,
				};
			} else {
				const elapsed = current_time - bucket.last_refill;
				const tokens_to_add = elapsed * bucket.refill_rate;
				bucket.tokens = Math.min(max_tokens, bucket.tokens + tokens_to_add);
				bucket.last_refill = current_time;
			}

			const allowed = bucket.tokens >= 1 ? 1 : 0;
			if (allowed === 1) bucket.tokens -= 1;

			const reset_at = current_time + window_ms;
			const retry_after_ms = allowed === 0 ? Math.ceil((1 - bucket.tokens) / bucket.refill_rate) : 0;

			this.store.set(key, bucket);

			return [allowed, Math.floor(bucket.tokens), reset_at, retry_after_ms];
		}

		async hmget(key: string, ...fields: string[]): Promise<(string | null)[]> {
			const bucket = this.store.get(key);
			if (!bucket) return fields.map(() => null);
			return fields.map(f => (bucket[f] !== undefined ? String(bucket[f]) : null));
		}

		async hmset(key: string, ...args: any[]): Promise<string> {
			const bucket = this.store.get(key) || {};
			for (let i = 0; i < args.length; i += 2) {
				bucket[args[i]] = args[i + 1];
			}
			this.store.set(key, bucket);
			return 'OK';
		}

		async del(...keys: string[]): Promise<number> {
			let count = 0;
			for (const k of keys) if (this.store.delete(k)) count++;
			return count;
		}

		async keys(pattern: string): Promise<string[]> {
			const regex = new RegExp('^' + pattern.replace('*', '.*') + '$');
			return Array.from(this.store.keys()).filter(k => regex.test(k));
		}

		async ping(): Promise<string> {
			return 'PONG';
		}

		async pexpire(_key: string, _ms: number): Promise<number> {
			return 1;
		}
	}

	return { default: MockRedis };
});

	// ========================================================
	// GLOBAL MOCKS: LangCache, Groq, LLM and Tenant Config Loader
	// Provide deterministic, fast responses for tests that need LLM or langcache
	// ========================================================

	// LangCache SaaS API: return empty search and successful set by default
	vi.mock('@/lib/langcache-api', () => ({
		langCacheSearch: vi.fn(async (prompt: string) => ({ response: null })),
		langCacheSet: vi.fn(async (_prompt: string, _response: any) => ({ ok: true }))
	}));

	// GROQ SDK (default GroqClient wrapper) — simple fake that returns deterministic completions
	vi.mock('groq-sdk', () => {
		class MockGroq {
			chat: any;
			constructor(_opts?: any) {
				this.chat = {
					completions: {
						create: vi.fn(async (opts: any) => ({
							choices: [{ message: { content: `fake completion for model=${opts.model || 'default'}` } }],
							usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
							model: opts.model || 'test-model',
						})),
					},
				};
			}
		}
		return { default: MockGroq };
	});

	// @ai-sdk/groq createGroq wrapper — returns a language model that supports `complete` (compat)
	vi.mock('@ai-sdk/groq', () => ({
		createGroq: () => {
			return (model: string) => ({
				complete: vi.fn(async (_opts: any) => ({ text: `fake: ${model}`, usage: {} })),
				chat: { completions: { create: vi.fn(async (_opts: any) => ({ choices: [{ message: { content: `fake chat: ${model}` } }], usage: {}, model })) } },
				model,
			});
		}
	}));

	// Tenant config loader: return a minimal valid config so tests don't need files on disk
	vi.mock('@/lib/config/tenant-config-loader', () => ({
		getTenantConfig: (tenantId: string) => ({
			id: tenantId || 'tn_testtenant0000000000000000000000',
			name: 'Test Tenant',
			vector_store: 'supabase',
			embedding_provider: 'nomic',
			embedding_model: 'nomic-ai/nomic-embed-text-v1.5',
			chunk_size: 1024,
			chunk_overlap: 128,
			features: {},
			prompts: {},
		}),
		reloadTenantConfig: vi.fn(),
		clearTenantConfigCache: vi.fn(),
	}));

	// Default embedding generator mock to return 768-dim vectors for tests unless explicitly mocked per-file
	vi.mock('@/lib/trial/embeddings', () => ({
		generateEmbeddings: vi.fn(async (texts: string[]) => {
			return texts.map(() => Array(768).fill(0.5));
		}),
	}));

	// LlamaIndex embedding wrapper mock
	vi.mock('@/lib/rag/llamaindex-embeddings', () => ({
		LlamaIndexEmbeddingService: {
			getInstance: () => ({
				embed: vi.fn(async (_text: string) => Array(768).fill(0.5)),
				embedBatch: vi.fn(async (texts: string[]) => texts.map(() => Array(768).fill(0.5))),
			}),
		},
	}));

	// Mock the LLM factory to return a deterministic adapter that does not hit network
	vi.mock('@/lib/rag/llm-factory', () => ({
		createLlm: vi.fn(async (_opts?: any) => ({
			invoke: vi.fn(async (prompt: string) => `mocked llm response for: ${String(prompt).slice(0, 100)}`),
		})),
	}));

// Mock `bullmq` with an in-memory queue so tests can enqueue and observe job status
vi.mock('bullmq', () => {
	type JobRecord = {
		id: string;
		name?: string;
		data: any;
		state: string;
		progress: number | null;
		returnvalue: any;
		failedReason: string | null;
		attemptsMade: number;
		timestamp: number;
		processedOn: number | null;
		finishedOn: number | null;
	};

	const QUEUES = new Map<string, {
		jobs: Map<string, JobRecord>;
		workers: Set<any>;
		scheduler?: any;
	}>();

	function ensureQueue(name: string) {
		if (!QUEUES.has(name)) QUEUES.set(name, { jobs: new Map(), workers: new Set() });
		return QUEUES.get(name)!;
	}

	class Queue {
		name: string;
		opts: any;
		constructor(name: string, opts?: any) {
			this.name = name;
			this.opts = opts;
			ensureQueue(this.name);
		}

		async add(jobName: string, data: any, _opts?: any) {
			const q = ensureQueue(this.name);
			const id = (Math.floor(Math.random() * 1e9)).toString();
			const job: JobRecord = {
				id,
				name: jobName,
				data,
				state: 'waiting',
				progress: null,
				returnvalue: null,
				failedReason: null,
				attemptsMade: 0,
				timestamp: Date.now(),
				processedOn: null,
				finishedOn: null,
			};
			q.jobs.set(id, job);

			// If a worker exists, schedule processing
			setTimeout(async () => {
				const workers = Array.from(q.workers);
				if (workers.length > 0) {
					const worker = workers[0];
					job.state = 'active';
					job.processedOn = Date.now();
					try {
						const result = await worker._process(job as any);
						job.returnvalue = result;
						job.state = 'completed';
						job.finishedOn = Date.now();
						// emit completed
						worker._emit('completed', { id: job.id, data: job.data });
					} catch (err) {
						job.state = 'failed';
						job.failedReason = err instanceof Error ? err.message : String(err);
						job.finishedOn = Date.now();
						worker._emit('failed', { id: job.id, data: job.data }, err);
					}
				}
			}, 20);

			return {
				id,
				getState: async () => q.jobs.get(id)?.state || 'not_found',
				progress: 0,
				returnvalue: null,
				failedReason: null,
				attemptsMade: 0,
				timestamp: job.timestamp,
				finishedOn: null,
				processedOn: null,
				data,
			};
		}

		async getJob(id: string) {
			const q = ensureQueue(this.name);
			const job = q.jobs.get(id);
			if (!job) return null;
			return {
				id: job.id,
				data: job.data,
				progress: job.progress,
				returnvalue: job.returnvalue,
				failedReason: job.failedReason,
				attemptsMade: job.attemptsMade,
				timestamp: job.timestamp,
				finishedOn: job.finishedOn,
				processedOn: job.processedOn,
				getState: async () => job.state,
			} as any;
		}

		async getJobCounts() {
			const q = ensureQueue(this.name);
			const counts: Record<string, number> = { waiting: 0, active: 0, completed: 0, failed: 0 };
			for (const job of q.jobs.values()) counts[job.state] = (counts[job.state] || 0) + 1;
			return counts;
		}

		async close() {
			return;
		}
	}

	class QueueScheduler {
		constructor(_name: string, _opts?: any) {}
	}

	class Worker {
		name: string;
		_process: (job: any) => Promise<any>;
		handlers = new Map<string, Function[]>();
		constructor(name: string, processFn: (job: any) => Promise<any>, _opts?: any) {
			this.name = name;
			this._process = processFn;
			const q = ensureQueue(this.name);
			q.workers.add(this);
		}

		isRunning() {
			return true;
		}

		on(event: string, handler: Function) {
			if (!this.handlers.has(event)) this.handlers.set(event, []);
			this.handlers.get(event)!.push(handler);
		}

		_emit(event: string, ...args: any[]) {
			const hs = this.handlers.get(event) || [];
			for (const h of hs) h(...args);
		}
	}

	return { Queue, Worker, QueueScheduler };
});
