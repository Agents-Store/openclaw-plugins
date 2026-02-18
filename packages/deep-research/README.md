# @agents-store/deep-research

Multi-service deep internet research plugin for OpenClaw. Every search queries **Exa.ai**, **Firecrawl**, and **Perplexity** in parallel for maximum coverage.

## Features

- **8 specialized search tools** — from quick search to 100+ source summaries
- **All 3 services in every query** — results are deduplicated and ranked
- **Parallel execution** — all API calls run concurrently via `Promise.all`
- **Graceful degradation** — if one service fails, the others continue

## Tools

| Tool | Description |
|------|-------------|
| `deep_search` | General multi-service web search with domain/category filtering |
| `deep_research` | Multi-step deep topic exploration (standard/deep/exhaustive) |
| `mass_summary` | Collect 100+ sources and create comprehensive summary |
| `date_search` | Search with strict date range filtering |
| `compare_offers` | Find and compare products/services/deals with structured extraction |
| `scrape_and_extract` | Deep scrape specific URLs with content extraction |
| `site_search` | Search within specific domains with optional site mapping |
| `find_similar` | Find content similar to a reference URL |

## Installation

```bash
openclaw plugins install @agents-store/deep-research
```

## Configuration

Set API keys in your OpenClaw config:

```json
{
  "plugins": {
    "entries": {
      "deep-research": {
        "enabled": true,
        "config": {
          "exaApiKey": "your-exa-api-key",
          "firecrawlApiKey": "your-firecrawl-api-key",
          "perplexityApiKey": "your-perplexity-api-key",
          "defaultNumResults": 20,
          "defaultLanguage": "en"
        }
      }
    }
  }
}
```

Get API keys from:
- Exa.ai: https://dashboard.exa.ai
- Firecrawl: https://www.firecrawl.dev
- Perplexity: https://www.perplexity.ai/settings/api

## Commands

- `/research <topic>` — Start a deep research on a topic
- `/research-status` — Check plugin status and API key configuration

## Architecture

```
User query
    |
    v
Promise.all([
  Exa.ai search,
  Firecrawl search,
  Perplexity search
])
    |
    v
Deduplicate by URL -> Rank by multi-source relevance -> Format as markdown
```

Each tool follows this parallel-query-merge pattern. Advanced tools like `deep_research` and `mass_summary` add multi-step workflows on top.
