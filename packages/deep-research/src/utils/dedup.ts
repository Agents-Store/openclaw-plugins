export interface SearchResult {
  url: string;
  title: string;
  snippet: string;
  content?: string;
  publishedDate?: string;
  source: "exa" | "firecrawl" | "perplexity";
  score?: number;
}

export interface MergedResult {
  url: string;
  normalizedUrl: string;
  title: string;
  snippet: string;
  content?: string;
  publishedDate?: string;
  sources: ("exa" | "firecrawl" | "perplexity")[];
  relevanceScore: number;
}

/**
 * Normalize a URL for deduplication: remove trailing slash, www, protocol, query params.
 */
export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    let host = u.hostname.replace(/^www\./, "");
    let path = u.pathname.replace(/\/+$/, "");
    return `${host}${path}`.toLowerCase();
  } catch {
    return url.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/+$/, "");
  }
}

/**
 * Merge results from multiple services, deduplicating by URL.
 * Results found by more services rank higher.
 */
export function mergeResults(results: SearchResult[]): MergedResult[] {
  const map = new Map<string, MergedResult>();

  for (const r of results) {
    const key = normalizeUrl(r.url);
    const existing = map.get(key);

    if (existing) {
      if (!existing.sources.includes(r.source)) {
        existing.sources.push(r.source);
        existing.relevanceScore += 1;
      }
      // Prefer longer content
      if (r.content && (!existing.content || r.content.length > existing.content.length)) {
        existing.content = r.content;
      }
      if (r.snippet && r.snippet.length > existing.snippet.length) {
        existing.snippet = r.snippet;
      }
      if (!existing.publishedDate && r.publishedDate) {
        existing.publishedDate = r.publishedDate;
      }
    } else {
      map.set(key, {
        url: r.url,
        normalizedUrl: key,
        title: r.title || r.url,
        snippet: r.snippet || "",
        content: r.content,
        publishedDate: r.publishedDate,
        sources: [r.source],
        relevanceScore: 1 + (r.score || 0),
      });
    }
  }

  return Array.from(map.values());
}

/**
 * Sort results by relevance: more sources = higher rank.
 */
export function rankByRelevance(results: MergedResult[]): MergedResult[] {
  return results.sort((a, b) => {
    // Primary: number of sources that found it
    if (b.sources.length !== a.sources.length) {
      return b.sources.length - a.sources.length;
    }
    // Secondary: relevance score
    return b.relevanceScore - a.relevanceScore;
  });
}

/**
 * Remove duplicate URLs from an array, keeping the first occurrence.
 */
export function deduplicateUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  return urls.filter((url) => {
    const key = normalizeUrl(url);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
