export * from './weather';
export * from './search';

export interface ToolExecutionResult {
  toolUsed: 'weather' | 'search' | null;
  output: string | null;
}

/**
 * Checks whether user input matches a tool intent (weather or search)
 * and executes it if appropriate.
 */
export async function executeAutoTool(input: string): Promise<ToolExecutionResult> {
  const trimmed = input.trim();

  // Weather pattern detection: e.g. "weather in Tokyo", "current temperature in London", "/weather Paris"
  const weatherMatch = trimmed.match(/^(?:\/weather\s+|what(?:'s| is) the weather in\s+|temperature in\s+|weather in\s+)(.+)/i);
  if (weatherMatch) {
    const loc = weatherMatch[1].trim();
    const weatherInfo = await import('./weather').then(m => m.fetchLiveWeather(loc));
    return { toolUsed: 'weather', output: weatherInfo };
  }

  // Web search pattern detection: e.g. "/search quantum computing", "search for x", "look up y"
  const searchMatch = trimmed.match(/^(?:\/search\s+|search for\s+|look up\s+)(.+)/i);
  if (searchMatch) {
    const query = searchMatch[1].trim();
    const searchInfo = await import('./search').then(m => m.fetchLiveWebSearch(query));
    return { toolUsed: 'search', output: searchInfo };
  }

  return { toolUsed: null, output: null };
}
