/**
 * Live edge weather tool using wttr.in JSON API (zero API key required).
 */
export async function fetchLiveWeather(location: string): Promise<string> {
  const cleanLocation = location.trim().replace(/^in\s+/i, '').replace(/[?.,!]$/, '');
  if (!cleanLocation) {
    return 'Please specify a city or location to get the weather.';
  }

  const url = `https://wttr.in/${encodeURIComponent(cleanLocation)}?format=j1`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'curl/8.0.0 (telegram-ai-agent-edge)'
      }
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      return `Could not retrieve weather information for "${cleanLocation}" (HTTP ${res.status}).`;
    }

    const data = await res.json<any>();
    const current = data?.current_condition?.[0];
    const area = data?.nearest_area?.[0];

    if (!current) {
      return `No weather observation found for "${cleanLocation}".`;
    }

    const areaName = area?.areaName?.[0]?.value || cleanLocation;
    const country = area?.country?.[0]?.value || '';
    const tempC = current.temp_C;
    const tempF = current.temp_F;
    const condition = current.weatherDesc?.[0]?.value || 'Clear';
    const humidity = current.humidity;
    const windKmph = current.windspeedKmph;
    const feelsLikeC = current.FeelsLikeC;

    return `🌤️ *Current Weather in ${areaName}${country ? `, ${country}` : ''}:*\n` +
      `• *Condition:* ${condition}\n` +
      `• *Temperature:* ${tempC}°C / ${tempF}°F (Feels like ${feelsLikeC}°C)\n` +
      `• *Humidity:* ${humidity}%\n` +
      `• *Wind Speed:* ${windKmph} km/h`;
  } catch (err) {
    clearTimeout(timeoutId);
    return `Unable to fetch live weather for "${cleanLocation}" at this time.`;
  }
}
