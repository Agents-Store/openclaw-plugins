export interface ParallelResults<E = any, F = any, P = any> {
  exa: E | null;
  firecrawl: F | null;
  perplexity: P | null;
  errors: string[];
}

/**
 * Execute all 3 services in parallel with graceful degradation.
 * If one service fails, the others continue and the error is collected.
 */
export async function parallelServices<E = any, F = any, P = any>(calls: {
  exa: () => Promise<E>;
  firecrawl: () => Promise<F>;
  perplexity: () => Promise<P>;
}): Promise<ParallelResults<E, F, P>> {
  const errors: string[] = [];

  const [exaResult, firecrawlResult, perplexityResult] = await Promise.all([
    safeCall(calls.exa, 120_000).catch((e) => {
      errors.push(`[Exa] ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }),
    safeCall(calls.firecrawl, 120_000).catch((e) => {
      errors.push(`[Firecrawl] ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }),
    safeCall(calls.perplexity, 180_000).catch((e) => {
      errors.push(`[Perplexity] ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }),
  ]);

  return {
    exa: exaResult as E | null,
    firecrawl: firecrawlResult as F | null,
    perplexity: perplexityResult as P | null,
    errors,
  };
}

/**
 * Wrap an async call with a timeout. Returns null if the timeout is exceeded.
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
 * Process items in parallel batches to avoid overwhelming APIs.
 */
export async function batchProcess<T, R>(
  items: T[],
  batchSize: number,
  processor: (item: T) => Promise<R>
): Promise<(R | null)[]> {
  const results: (R | null)[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map((item) =>
        processor(item).catch(() => null)
      )
    );
    results.push(...batchResults);
  }
  return results;
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
