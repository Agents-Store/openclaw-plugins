---
name: deep-research
description: Multi-service deep internet research using Exa.ai, Firecrawl, and Perplexity in parallel for maximum search coverage
---

# Deep Research Plugin

You have access to 8 powerful search tools that query **Exa.ai**, **Firecrawl**, and **Perplexity** simultaneously for every search. All services run in parallel for speed and comprehensive coverage.

## Tool Selection Guide

### `deep_search` — General web search
Use for any standard search query. Returns deduplicated results from all 3 services ranked by relevance.
- User: "Find articles about quantum computing" -> `deep_search(query: "quantum computing")`
- User: "Search for React best practices on GitHub" -> `deep_search(query: "React best practices", domains: ["github.com"])`

### `deep_research` — In-depth topic exploration
Use when the user needs thorough research with multiple angles. Multi-step process: initial search, sub-topic expansion, synthesis.
- User: "Research the current state of AI regulation in EU" -> `deep_research(topic: "AI regulation EU", depth: "deep", focusAreas: ["GDPR", "AI Act", "enforcement"])`
- User: "I need a thorough analysis of remote work trends" -> `deep_research(topic: "remote work trends 2024-2025", depth: "exhaustive")`

### `mass_summary` — Summarize 100+ sources
Use when the user needs a comprehensive overview from a large number of sources. Collects 100+ URLs and creates a synthesis.
- User: "Summarize everything about TypeScript 5.0 from at least 100 articles" -> `mass_summary(topic: "TypeScript 5.0 features and migration", minSources: 100)`
- User: "Collect and summarize research on intermittent fasting" -> `mass_summary(topic: "intermittent fasting health effects research")`

### `date_search` — Date-filtered search
Use when the user specifies a time period. All services apply date constraints.
- User: "Find news about SpaceX from January 2025" -> `date_search(query: "SpaceX", dateFrom: "2025-01-01", dateTo: "2025-01-31")`
- User: "What happened in crypto markets last week?" -> `date_search(query: "crypto market", dateFrom: "<7 days ago>", dateTo: "<today>")`

### `compare_offers` — Compare products/services/deals
Use when the user wants to compare offerings. Extracts structured data for comparison tables.
- User: "Compare apartments for rent in Lisbon" -> `compare_offers(query: "apartment rental Lisbon", criteria: ["price", "location", "size", "amenities"])`
- User: "Find the best noise-cancelling headphones" -> `compare_offers(query: "best noise cancelling headphones 2025", criteria: ["price", "noise cancellation rating", "battery life", "comfort"])`
- User: "Compare beach resorts in Thailand" -> `compare_offers(query: "beach resort Thailand", criteria: ["price per night", "rating", "location", "amenities"], domains: ["booking.com", "tripadvisor.com"])`

### `scrape_and_extract` — Deep URL analysis
Use when the user provides specific URLs to analyze. Scrapes full content and extracts structured data.
- User: "Analyze this article: https://example.com/post" -> `scrape_and_extract(urls: ["https://example.com/post"])`
- User: "Extract pricing from these pages" -> `scrape_and_extract(urls: [...], extractPrompt: "Extract all pricing tiers, features, and limitations")`

### `site_search` — Search within specific sites
Use when the user wants to search within particular websites only.
- User: "Search for Python tutorials on Real Python and towards data science" -> `site_search(query: "Python tutorials", domains: ["realpython.com", "towardsdatascience.com"])`
- User: "Find all mentions of Next.js on Vercel blog" -> `site_search(query: "Next.js", domains: ["vercel.com"], mapSites: true)`

### `find_similar` — Find similar content
Use when the user has a reference URL and wants more like it.
- User: "Find articles similar to this one: https://example.com/great-post" -> `find_similar(url: "https://example.com/great-post")`
- User: "I liked this article, find me more like it" -> `find_similar(url: "<the article URL>")`

## Best Practices

1. **Always present results clearly** — use the markdown formatting returned by tools
2. **Combine tools** when needed — e.g., `deep_search` first to find relevant URLs, then `scrape_and_extract` for deep analysis
3. **Use focus areas** in `deep_research` to guide the investigation
4. **Set date ranges** precisely — use ISO format YYYY-MM-DD
5. **Specify domains** when the user mentions specific websites
6. **For comparisons**, suggest relevant criteria if the user doesn't specify them
