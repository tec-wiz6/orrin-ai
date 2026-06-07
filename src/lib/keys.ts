const groqKeys = [
  process.env.GROQ_API_KEY_1!,
  process.env.GROQ_API_KEY_2!,
  process.env.GROQ_API_KEY_3!,
  process.env.GROQ_API_KEY_4!,
  process.env.GROQ_API_KEY_5!,
].filter(Boolean);

let groqIndex = 0;

export function getGroqKey(): string {
  const key = groqKeys[groqIndex % groqKeys.length];
  groqIndex++;
  return key;
}

const tavilyKeys = [process.env.TAVILY_API_KEY!].filter(Boolean);
const serperKeys = [process.env.SERPER_API_KEY!].filter(Boolean);

let searchIndex = 0;

export function getSearchKeys(): { tavily: string; serper: string } {
  return {
    tavily: tavilyKeys[searchIndex % tavilyKeys.length],
    serper: serperKeys[searchIndex % serperKeys.length],
  };
}