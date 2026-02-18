const BASE_URL = "https://api.perplexity.ai";

export interface PerplexitySearchOptions {
  model?: string;
  preset?: "fast-search" | "pro-search" | "deep-research";
  searchDomainFilter?: string[];
  searchRecencyFilter?: "day" | "week" | "month" | "year";
  maxSteps?: number;
  language?: string;
  instructions?: string;
  maxOutputTokens?: number;
}

export interface PerplexityCitation {
  url: string;
  title?: string;
  snippet?: string;
}

export interface PerplexityResponse {
  id: string;
  model: string;
  status: string;
  output: PerplexityOutputItem[];
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}

export interface PerplexityOutputItem {
  type: string;
  content?: string | PerplexityContentBlock[];
  text?: string;
  url?: string;
  title?: string;
  snippet?: string;
}

export interface PerplexityContentBlock {
  type: string;
  text?: string;
}

export class PerplexityClient {
  constructor(private apiKey: string) {}

  private async request(body: Record<string, any>): Promise<PerplexityResponse> {
    const res = await fetch(`${BASE_URL}/v1/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Perplexity API failed (${res.status}): ${errText.slice(0, 200)}`);
    }

    return res.json() as Promise<PerplexityResponse>;
  }

  async search(query: string, options: PerplexitySearchOptions = {}): Promise<{
    text: string;
    citations: PerplexityCitation[];
  }> {
    const body: Record<string, any> = {
      input: query,
      preset: options.preset ?? "pro-search",
    };

    if (options.model) body.model = options.model;
    if (options.language) body.language_preference = options.language;
    if (options.instructions) body.instructions = options.instructions;
    if (options.maxOutputTokens) body.max_output_tokens = options.maxOutputTokens;
    if (options.maxSteps) body.max_steps = options.maxSteps;

    // Add search tool with filters
    const webSearchTool: Record<string, any> = { type: "web_search" };
    if (options.searchDomainFilter?.length) {
      webSearchTool.search_domain_filter = options.searchDomainFilter;
    }
    if (options.searchRecencyFilter) {
      webSearchTool.search_recency_filter = options.searchRecencyFilter;
    }

    if (options.searchDomainFilter?.length || options.searchRecencyFilter) {
      body.tools = [webSearchTool];
    }

    const response = await this.request(body);
    return this.parseResponse(response);
  }

  async deepResearch(query: string, options: Omit<PerplexitySearchOptions, "preset"> = {}): Promise<{
    text: string;
    citations: PerplexityCitation[];
  }> {
    return this.search(query, {
      ...options,
      preset: "deep-research",
      maxSteps: options.maxSteps ?? 5,
    });
  }

  async fastSearch(query: string, options: Omit<PerplexitySearchOptions, "preset"> = {}): Promise<{
    text: string;
    citations: PerplexityCitation[];
  }> {
    return this.search(query, { ...options, preset: "fast-search" });
  }

  private parseResponse(response: PerplexityResponse): {
    text: string;
    citations: PerplexityCitation[];
  } {
    let text = "";
    const citations: PerplexityCitation[] = [];

    for (const item of response.output ?? []) {
      if (item.type === "message" && item.content) {
        if (typeof item.content === "string") {
          text += item.content;
        } else if (Array.isArray(item.content)) {
          for (const block of item.content) {
            if (block.type === "text" && block.text) {
              text += block.text;
            }
          }
        }
      }

      if (item.type === "search_result" || item.type === "citation") {
        citations.push({
          url: item.url ?? "",
          title: item.title,
          snippet: item.snippet,
        });
      }
    }

    return { text, citations };
  }
}
