const BASE_URL = "https://api.exa.ai";

export interface ExaSearchOptions {
  numResults?: number;
  type?: "neural" | "fast" | "auto" | "deep";
  includeDomains?: string[];
  excludeDomains?: string[];
  startPublishedDate?: string;
  endPublishedDate?: string;
  startCrawlDate?: string;
  endCrawlDate?: string;
  includeText?: string;
  excludeText?: string;
  category?: "company" | "research paper" | "news" | "tweet" | "personal site" | "financial report";
  text?: boolean | { maxCharacters?: number; includeHtmlTags?: boolean };
  highlights?: boolean | { numSentences?: number; highlightsPerUrl?: number; query?: string };
  summary?: boolean | { query?: string };
}

export interface ExaSearchResult {
  title: string;
  url: string;
  publishedDate?: string;
  author?: string;
  text?: string;
  highlights?: string[];
  summary?: string;
  score?: number;
}

export interface ExaSearchResponse {
  results: ExaSearchResult[];
  requestId?: string;
}

export interface ExaFindSimilarOptions {
  numResults?: number;
  includeDomains?: string[];
  excludeDomains?: string[];
  startPublishedDate?: string;
  endPublishedDate?: string;
  text?: boolean | { maxCharacters?: number };
  highlights?: boolean;
  summary?: boolean | { query?: string };
}

export interface ExaContentsOptions {
  text?: boolean | { maxCharacters?: number };
  highlights?: boolean | { numSentences?: number; query?: string };
  summary?: boolean | { query?: string };
}

export interface ExaAnswerResponse {
  answer: string;
  citations: ExaSearchResult[];
}

export type Logger = {
  debug?: (...args: any[]) => void;
  info?: (...args: any[]) => void;
  warn?: (...args: any[]) => void;
  error?: (...args: any[]) => void;
};

export class ExaClient {
  constructor(private apiKey: string, private logger?: Logger) {}

  private async request<T>(endpoint: string, body: Record<string, any>): Promise<T> {
    this.logger?.debug?.(`[Exa] POST ${endpoint}`, JSON.stringify(body).slice(0, 500));

    const res = await fetch(`${BASE_URL}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      const msg = `Exa API ${endpoint} failed (${res.status}): ${errText.slice(0, 500)}`;
      this.logger?.error?.(`[Exa] ${msg}`);
      throw new Error(msg);
    }

    const json = await res.json() as T;
    const resultCount = Array.isArray((json as any)?.results) ? (json as any).results.length : "?";
    this.logger?.debug?.(`[Exa] ${endpoint} OK — ${resultCount} results`);
    return json;
  }

  async search(query: string, options: ExaSearchOptions = {}): Promise<ExaSearchResponse> {
    const body: Record<string, any> = {
      query,
      numResults: options.numResults ?? 20,
      type: options.type ?? "auto",
    };

    if (options.includeDomains?.length) body.includeDomains = options.includeDomains;
    if (options.excludeDomains?.length) body.excludeDomains = options.excludeDomains;
    if (options.startPublishedDate) body.startPublishedDate = options.startPublishedDate;
    if (options.endPublishedDate) body.endPublishedDate = options.endPublishedDate;
    if (options.startCrawlDate) body.startCrawlDate = options.startCrawlDate;
    if (options.endCrawlDate) body.endCrawlDate = options.endCrawlDate;
    if (options.includeText) body.includeText = options.includeText;
    if (options.excludeText) body.excludeText = options.excludeText;
    if (options.category) body.category = options.category;

    // Content extraction
    if (options.text !== undefined) body.text = options.text;
    if (options.highlights !== undefined) body.highlights = options.highlights;
    if (options.summary !== undefined) body.summary = options.summary;

    return this.request<ExaSearchResponse>("/search", body);
  }

  async findSimilar(url: string, options: ExaFindSimilarOptions = {}): Promise<ExaSearchResponse> {
    const body: Record<string, any> = {
      url,
      numResults: options.numResults ?? 20,
    };

    if (options.includeDomains?.length) body.includeDomains = options.includeDomains;
    if (options.excludeDomains?.length) body.excludeDomains = options.excludeDomains;
    if (options.startPublishedDate) body.startPublishedDate = options.startPublishedDate;
    if (options.endPublishedDate) body.endPublishedDate = options.endPublishedDate;
    if (options.text !== undefined) body.text = options.text;
    if (options.highlights !== undefined) body.highlights = options.highlights;
    if (options.summary !== undefined) body.summary = options.summary;

    return this.request<ExaSearchResponse>("/findSimilar", body);
  }

  async getContents(urls: string[], options: ExaContentsOptions = {}): Promise<ExaSearchResponse> {
    const body: Record<string, any> = { urls };

    if (options.text !== undefined) body.text = options.text;
    if (options.highlights !== undefined) body.highlights = options.highlights;
    if (options.summary !== undefined) body.summary = options.summary;

    return this.request<ExaSearchResponse>("/contents", body);
  }

  async answer(query: string, options: { text?: boolean } = {}): Promise<ExaAnswerResponse> {
    return this.request<ExaAnswerResponse>("/answer", {
      query,
      text: options.text ?? false,
    });
  }
}
