const BASE_URL = "https://api.firecrawl.dev/v2";

export interface FirecrawlScrapeOptions {
  formats?: ("markdown" | "html" | "rawHtml" | "summary" | "links" | "json")[];
  onlyMainContent?: boolean;
  includeTags?: string[];
  excludeTags?: string[];
  waitFor?: number;
  timeout?: number;
  location?: { country?: string; languages?: string[] };
}

export interface FirecrawlSearchOptions {
  limit?: number;
  tbs?: string;
  location?: string;
  country?: string;
  scrapeOptions?: FirecrawlScrapeOptions;
}

export interface FirecrawlMapOptions {
  search?: string;
  limit?: number;
  includeSubdomains?: boolean;
  ignoreQueryParameters?: boolean;
}

export interface FirecrawlExtractOptions {
  prompt?: string;
  schema?: Record<string, any>;
  enableWebSearch?: boolean;
  scrapeOptions?: FirecrawlScrapeOptions;
}

export interface FirecrawlCrawlOptions {
  maxDiscoveryDepth?: number;
  limit?: number;
  includePaths?: string[];
  excludePaths?: string[];
  scrapeOptions?: FirecrawlScrapeOptions;
  allowSubdomains?: boolean;
}

export interface FirecrawlSearchResult {
  url: string;
  title?: string;
  description?: string;
  markdown?: string;
  html?: string;
  metadata?: Record<string, any>;
}

export interface FirecrawlScrapeResult {
  markdown?: string;
  html?: string;
  rawHtml?: string;
  summary?: string;
  links?: string[];
  metadata?: {
    title?: string;
    description?: string;
    publishedDate?: string;
    [key: string]: any;
  };
}

export interface FirecrawlMapResult {
  links: { url: string; title?: string; description?: string }[];
}

export type Logger = {
  debug?: (...args: any[]) => void;
  info?: (...args: any[]) => void;
  warn?: (...args: any[]) => void;
  error?: (...args: any[]) => void;
};

export class FirecrawlClient {
  constructor(private apiKey: string, private logger?: Logger) {}

  private async request<T>(endpoint: string, body: Record<string, any>): Promise<T> {
    this.logger?.debug?.(`[Firecrawl] POST ${endpoint}`, JSON.stringify(body).slice(0, 500));

    const res = await fetch(`${BASE_URL}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      const msg = `Firecrawl API ${endpoint} failed (${res.status}): ${errText.slice(0, 500)}`;
      this.logger?.error?.(`[Firecrawl] ${msg}`);
      throw new Error(msg);
    }

    const json = await res.json() as T;
    this.logger?.debug?.(`[Firecrawl] ${endpoint} OK`);
    return json;
  }

  async search(
    query: string,
    options: FirecrawlSearchOptions = {}
  ): Promise<{ success: boolean; data: FirecrawlSearchResult[] }> {
    const body: Record<string, any> = {
      query,
      limit: options.limit ?? 20,
    };

    if (options.tbs) body.tbs = options.tbs;
    if (options.location) body.location = options.location;
    if (options.country) body.country = options.country;
    if (options.scrapeOptions) body.scrapeOptions = options.scrapeOptions;

    return this.request("/search", body);
  }

  async scrape(
    url: string,
    options: FirecrawlScrapeOptions = {}
  ): Promise<{ success: boolean; data: FirecrawlScrapeResult }> {
    const body: Record<string, any> = {
      url,
      formats: options.formats ?? ["markdown", "summary"],
    };

    if (options.onlyMainContent !== undefined) body.onlyMainContent = options.onlyMainContent;
    if (options.includeTags) body.includeTags = options.includeTags;
    if (options.excludeTags) body.excludeTags = options.excludeTags;
    if (options.waitFor) body.waitFor = options.waitFor;
    if (options.timeout) body.timeout = options.timeout;
    if (options.location) body.location = options.location;

    return this.request("/scrape", body);
  }

  async map(
    url: string,
    options: FirecrawlMapOptions = {}
  ): Promise<{ success: boolean; links: { url: string; title?: string; description?: string }[] }> {
    const body: Record<string, any> = { url };

    if (options.search) body.search = options.search;
    if (options.limit) body.limit = options.limit;
    if (options.includeSubdomains !== undefined) body.includeSubdomains = options.includeSubdomains;
    if (options.ignoreQueryParameters !== undefined) body.ignoreQueryParameters = options.ignoreQueryParameters;

    return this.request("/map", body);
  }

  async extract(
    urls: string[],
    options: FirecrawlExtractOptions = {}
  ): Promise<{ success: boolean; data: Record<string, any> }> {
    const body: Record<string, any> = { urls };

    if (options.prompt) body.prompt = options.prompt;
    if (options.schema) body.schema = options.schema;
    if (options.enableWebSearch !== undefined) body.enableWebSearch = options.enableWebSearch;
    if (options.scrapeOptions) body.scrapeOptions = options.scrapeOptions;

    return this.request("/extract", body);
  }

  async crawl(
    url: string,
    options: FirecrawlCrawlOptions = {}
  ): Promise<{ success: boolean; id: string }> {
    const body: Record<string, any> = {
      url,
      limit: options.limit ?? 50,
    };

    if (options.maxDiscoveryDepth) body.maxDiscoveryDepth = options.maxDiscoveryDepth;
    if (options.includePaths) body.includePaths = options.includePaths;
    if (options.excludePaths) body.excludePaths = options.excludePaths;
    if (options.scrapeOptions) body.scrapeOptions = options.scrapeOptions;
    if (options.allowSubdomains !== undefined) body.allowSubdomains = options.allowSubdomains;

    return this.request("/crawl", body);
  }

  async getCrawlStatus(crawlId: string): Promise<{
    status: string;
    total: number;
    completed: number;
    data: FirecrawlScrapeResult[];
  }> {
    const res = await fetch(`${BASE_URL}/crawl/${crawlId}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });

    if (!res.ok) {
      throw new Error(`Firecrawl crawl status failed (${res.status})`);
    }

    return res.json() as any;
  }
}
