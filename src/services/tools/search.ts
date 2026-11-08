/**
 * Live edge web & knowledge search tool using DuckDuckGo Instant Answers & Wikipedia (zero API keys).
 */
export async function fetchLiveWebSearch(query: string): Promise<string> {
  const cleanQuery = query.trim().replace(/^(who is|what is|search for|look up|define)\s+/i, '').replace(/[?.,!]$/, '');
  if (!cleanQuery) {
    return 'Please provide a search term or question.';
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);

  try {
    // 1. DuckDuckGo Instant Answer API
    const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(cleanQuery)}&format=json&no_html=1&skip_disambig=1`;
    const ddgRes = await fetch(ddgUrl, {
      signal: controller.signal,
      headers: { 'User-Agent': 'telegram-ai-agent-edge' }
    });

    if (ddgRes.ok) {
      const data = await ddgRes.json<any>();
      if (data.AbstractText) {
        clearTimeout(timeoutId);
        return `🔍 *Search Result for "${cleanQuery}":*\n\n` +
          `${data.AbstractText}\n\n` +
          `_Source: ${data.AbstractSource || 'DuckDuckGo Knowledge Base'}_` +
          (data.AbstractURL ? ` [Read more](${data.AbstractURL})` : '');
      }
    }

    // 2. Wikipedia Summary API fallback
    const wikiUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(cleanQuery.replace(/\s+/g, '_'))}`;
    const wikiRes = await fetch(wikiUrl, {
      signal: controller.signal,
      headers: { 'User-Agent': 'telegram-ai-agent-edge (support@piyush.dev)' }
    });

    clearTimeout(timeoutId);

    if (wikiRes.ok) {
      const wikiData = await wikiRes.json<any>();
      if (wikiData.extract) {
        return `📖 *Wikipedia Summary for "${wikiData.title}":*\n\n` +
          `${wikiData.extract}\n\n` +
          (wikiData.content_urls?.desktop?.page ? `_Source:_ [Wikipedia](${wikiData.content_urls.desktop.page})` : '');
      }
    }

    return `No immediate encyclopedia or instant summary found for "${cleanQuery}".`;
  } catch (err) {
    clearTimeout(timeoutId);
    return `Unable to query web search for "${cleanQuery}" at this moment.`;
  }
}
