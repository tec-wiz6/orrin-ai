import { getSearchKeys } from "./keys";

export async function webSearch(query: string): Promise<string> {
  const { tavily, serper } = getSearchKeys();

  // Try Tavily first
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: tavily,
        query,
        search_depth: "basic",
        max_results: 5,
      }),
    });
    const data = await res.json();
    if (data.results?.length) {
      return data.results
        .map((r: any) => `${r.title}\n${r.content}\nSource: ${r.url}`)
        .join("\n\n");
    }
  } catch (e) {
    console.warn("Tavily failed, trying Serper...");
  }

  // Fallback to Serper
  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": serper,
    },
    body: JSON.stringify({ q: query }),
  });
  const data = await res.json();
  const results = data.organic || [];
  return results
    .slice(0, 5)
    .map((r: any) => `${r.title}\n${r.snippet}\nSource: ${r.link}`)
    .join("\n\n");
}