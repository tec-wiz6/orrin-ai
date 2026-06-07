import Groq from "groq-sdk";
import { getGroqKey } from "@/lib/keys";
import { webSearch } from "@/lib/search";

export async function POST(req: Request) {
  const { url } = await req.json();
  if (!url) return Response.json({ error: "No URL" }, { status: 400 });

  const groq = new Groq({ apiKey: getGroqKey() });

  // YouTube
  const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (ytMatch) {
    const videoId = ytMatch[1];
    // Use search to get info about the video
    const searchResults = await webSearch(`youtube ${videoId} summary transcript`);
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content: "You summarize YouTube videos. Given search results about a video, provide a clear structured summary of what the video is about, its main points, and key takeaways. Be concise but thorough.",
        },
        {
          role: "user",
          content: `Summarize this YouTube video (ID: ${videoId})\n\nURL: ${url}\n\nSearch context:\n${searchResults}`,
        },
      ],
      max_tokens: 1024,
    });
    return Response.json({ summary: completion.choices[0].message.content });
  }

  // Any other URL — fetch and summarize
  try {
    const searchResults = await webSearch(`site content summary ${url}`);
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content: "You summarize web pages. Given search results about a URL, provide a clear structured summary of the page content, main points, and key takeaways.",
        },
        {
          role: "user",
          content: `Summarize this web page: ${url}\n\nSearch context:\n${searchResults}`,
        },
      ],
      max_tokens: 1024,
    });
    return Response.json({ summary: completion.choices[0].message.content });
  } catch (err) {
    return Response.json({ error: "Could not summarize this URL." }, { status: 500 });
  }
}