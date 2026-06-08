import Groq from "groq-sdk";
import { getGroqKey } from "@/lib/keys";
import { webSearch } from "@/lib/search";

async function shouldSearch(message: string): Promise<boolean> {
  const groq = new Groq({ apiKey: getGroqKey() });
  const result = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      {
        role: "system",
        content: `You decide if a user message needs a web search to answer accurately.
Reply with only "yes" or "no".
Search when: asking about current events, news, trends, prices, people, recent releases, sports scores, weather, or anything time-sensitive. Also search when the user says "search", "look up", "browse", "find", "latest", "recent", "what's happening", or anything implying they want current information.
Don't search when: casual greetings, math problems, writing help, coding help, or general knowledge that doesn't change.`,
      },
      { role: "user", content: message },
    ],
    max_tokens: 5,
  });
  const answer = result.choices[0]?.message?.content?.toLowerCase().trim();
  return answer === "yes";
}

async function extractFacts(message: string): Promise<string[]> {
  try {
    const groq = new Groq({ apiKey: getGroqKey() });
    const result = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content: `Extract personal facts about the user from this message. Return ONLY a JSON array of strings, no markdown, no explanation. Each string should be a clear fact like "User's name is Abdullah" or "User studies Computer Engineering". If no personal facts, return []. Examples of facts to extract: name, age, location, job, studies, likes, dislikes, hobbies, goals, relationships.`,
        },
        { role: "user", content: message },
      ],
      max_tokens: 200,
    });
    const raw = result.choices[0]?.message?.content?.trim() || "[]";
    const cleaned = raw.replace(/```json|```/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return [];
  }
}

async function detectReminder(
  message: string
): Promise<{ isReminder: boolean; text: string; rawTime: string } | null> {
  try {
    const groq = new Groq({ apiKey: getGroqKey() });
    const result = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content: `Detect if the user wants to set a reminder or notification. If yes, return JSON: {"isReminder": true, "text": "short reminder message e.g. Go to lectures", "rawTime": "exact time phrase from message e.g. at 2pm"}. If no, return {"isReminder": false, "text": "", "rawTime": ""}. Only return raw JSON, no markdown, no explanation.`,
        },
        { role: "user", content: message },
      ],
      max_tokens: 100,
    });
    const raw = result.choices[0]?.message?.content?.trim() || "{}";
    const cleaned = raw.replace(/```json|```/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const { messages, fileContext, globalMemory, imageBase64, imageMimeType } =
    await req.json();
  const userMessage = messages[messages.length - 1]?.content || "";

  // Run these in parallel
  const factsPromise = extractFacts(userMessage);
  const reminderPromise = detectReminder(userMessage);

  let searchContext = "";
  try {
    const doSearch = await shouldSearch(userMessage);
    if (doSearch) {
      searchContext = await webSearch(userMessage);
    }
  } catch (e) {
    console.warn("Search failed:", e);
  }

  // ---- Time + date context ----
  const now = new Date();
  const todayStr = now.toLocaleDateString("en-GB", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const timeStr = now.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  const systemPrompt = `You are Orrin, a personal AI agent built for Abdullah. You are fast, direct, and fully capable.

Today's date: ${todayStr}
Current time: ${timeStr} WAT

${globalMemory && globalMemory.length > 0 ? `MEMORY (facts you know about the user across all conversations):\n${globalMemory}\n\nUse this to personalize your responses naturally.` : ""}

${searchContext ? `WEB SEARCH RESULTS (live from the internet — use as source of truth):\n${searchContext}` : ""}

${fileContext ? `FILE CONTEXT:\n${fileContext}` : ""}

CRITICAL RULES:
- You HAVE real-time web search. When search results are provided, use them as your source of truth
- NEVER say "I don't have real-time access" or "my training data only goes up to..."
- NEVER say you cannot browse the internet
- NEVER say "I am just a large language model"
- Be direct, confident, and concise
- Format responses cleanly with markdown when helpful
- For casual conversation, keep it short and natural
- When you see an image, describe and analyze it thoroughly
- When you set a reminder for the user, confirm it naturally e.g. "Done — I'll remind you to go to lectures at 2pm"`;

  const groq = new Groq({ apiKey: getGroqKey() });

  // Build messages — handle image if present
  const builtMessages = messages.map((m: any, i: number) => {
    if (i === messages.length - 1 && m.role === "user" && imageBase64) {
      return {
        role: "user",
        content: [
          { type: "text", text: m.content || "What's in this image?" },
          {
            type: "image_url",
            image_url: {
              url: `data:${imageMimeType || "image/jpeg"};base64,${imageBase64}`,
            },
          },
        ],
      };
    }
    return { role: m.role, content: m.content };
  });

  const stream = await groq.chat.completions.create({
    model: imageBase64
      ? "meta-llama/llama-4-scout-17b-16e-instruct"
      : "llama-3.3-70b-versatile",
    messages: [{ role: "system", content: systemPrompt }, ...builtMessages],
    stream: true,
    max_tokens: 1024,
  });

  const extractedFacts = await factsPromise;
  const reminderData = await reminderPromise;

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      // Send facts metadata
      if (extractedFacts.length > 0) {
        controller.enqueue(
          encoder.encode(
            `__FACTS__${JSON.stringify(extractedFacts)}__FACTS__`
          )
        );
      }

      // Send reminder metadata
      if (reminderData?.isReminder && reminderData.rawTime) {
        controller.enqueue(
          encoder.encode(
            `__REMINDER__${JSON.stringify(reminderData)}__REMINDER__`
          )
        );
      }

      // Stream AI response
      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content || "";
        if (text) controller.enqueue(encoder.encode(text));
      }

      controller.close();
    },
  });

  return new Response(readable, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
