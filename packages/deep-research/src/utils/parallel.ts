export interface ParallelResults<E = any, F = any, P = any> {
  exa: E | null;
  firecrawl: F | null;
  perplexity: P | null;
  errors: string[];
}

export type Logger = {
  debug?: (...args: any[]) => void;
  info?: (...args: any[]) => void;
  warn?: (...args: any[]) => void;
  error?: (...args: any[]) => void;
};

/**
 * Execute all 3 services in parallel with graceful degradation.
 * If one service fails, the others continue and the error is collected.
 * Logger is optional — when provided, all calls are logged.
 */
export async function parallelServices<E = any, F = any, P = any>(
  calls: {
    exa: () => Promise<E>;
    firecrawl: () => Promise<F>;
    perplexity: () => Promise<P>;
  },
  logger?: Logger
): Promise<ParallelResults<E, F, P>> {
  const errors: string[] = [];

  logger?.debug?.("[parallel] Starting 3 services in parallel...");

  const [exaResult, firecrawlResult, perplexityResult] = await Promise.all([
    safeCall(calls.exa, 120_000).catch((e) => {
      const msg = `[Exa] ${e instanceof Error ? e.message : String(e)}`;
      errors.push(msg);
      logger?.error?.(`[parallel] ${msg}`);
      return null;
    }),
    safeCall(calls.firecrawl, 120_000).catch((e) => {
      const msg = `[Firecrawl] ${e instanceof Error ? e.message : String(e)}`;
      errors.push(msg);
      logger?.error?.(`[parallel] ${msg}`);
      return null;
    }),
    safeCall(calls.perplexity, 180_000).catch((e) => {
      const msg = `[Perplexity] ${e instanceof Error ? e.message : String(e)}`;
      errors.push(msg);
      logger?.error?.(`[parallel] ${msg}`);
      return null;
    }),
  ]);

  const succeeded = [exaResult !== null, firecrawlResult !== null, perplexityResult !== null].filter(Boolean).length;
  logger?.info?.(`[parallel] Done — ${succeeded}/3 services succeeded${errors.length ? `, ${errors.length} failed` : ""}`);

  return {
    exa: exaResult as E | null,
    firecrawl: firecrawlResult as F | null,
    perplexity: perplexityResult as P | null,
    errors,
  };
}

/**
 * Wrap an async call with a timeout. Rejects if timeout is exceeded.
 */
export async function safeCall<T>(
  fn: () => Promise<T>,
  timeoutMs: number
): Promise<T | null> {
  return Promise.race([
    fn(),
    new Promise<null>((_, reject) =>
      setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);
}

/**
 * Process items in parallel batches. Collects errors instead of swallowing them.
 */
export async function batchProcess<T, R>(
  items: T[],
  batchSize: number,
  processor: (item: T) => Promise<R>,
  logger?: Logger
): Promise<{ results: (R | null)[]; errors: string[] }> {
  const results: (R | null)[] = [];
  const errors: string[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    logger?.debug?.(`[batch] Processing batch ${batchNum} (${batch.length} items)`);

    const batchResults = await Promise.all(
      batch.map((item, idx) =>
        processor(item).catch((e) => {
          const msg = `Batch item ${i + idx}: ${e instanceof Error ? e.message : String(e)}`;
          errors.push(msg);
          logger?.warn?.(`[batch] ${msg}`);
          return null;
        })
      )
    );
    results.push(...batchResults);
  }

  return { results, errors };
}

/**
 * Chunk an array into smaller arrays of specified size.
 */
export function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}
