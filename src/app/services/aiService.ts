/**
 * AI Service — Abstracts AI API calls for the Arabic vocabulary chatbot.
 * All Supabase/AI calls live in /services/ for easy migration to Go + Railway.
 */

export interface ArabicWord {
  arabic: string;
  transliteration: string;
  english: string;
}

export interface AIResponse {
  reply: string;
  words: ArabicWord[];
}

export interface ChatHistoryMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

const LOCAL_STORAGE_KEY = "arabic_app_openai_key";
const LOCAL_STORAGE_PROVIDER_KEY = "arabic_app_ai_provider";

export type AIProvider = "openai" | "groq" | "together" | "custom";

interface ProviderConfig {
  label: string;
  url: string;
  defaultModel: string;
}

const PROVIDERS: Record<AIProvider, ProviderConfig> = {
  openai: {
    label: "OpenAI",
    url: "https://api.openai.com/v1/chat/completions",
    defaultModel: "gpt-4o-mini",
  },
  groq: {
    label: "Groq",
    url: "https://api.groq.com/openai/v1/chat/completions",
    defaultModel: "llama-3.1-70b-versatile",
  },
  together: {
    label: "Together AI",
    url: "https://api.together.xyz/v1/chat/completions",
    defaultModel: "meta-llama/Llama-3-70b-chat-hf",
  },
  custom: {
    label: "Custom",
    url: "",
    defaultModel: "",
  },
};

export function getApiKey(): string {
  try { return localStorage.getItem(LOCAL_STORAGE_KEY) || ""; } catch { return ""; }
}

export function setApiKey(key: string): void {
  try { localStorage.setItem(LOCAL_STORAGE_KEY, key.trim()); } catch { /* noop */ }
}

export function getProvider(): AIProvider {
  try { return (localStorage.getItem(LOCAL_STORAGE_PROVIDER_KEY) as AIProvider) || "openai"; } catch { return "openai"; }
}

export function setProvider(provider: AIProvider): void {
  try { localStorage.setItem(LOCAL_STORAGE_PROVIDER_KEY, provider); } catch { /* noop */ }
}

export function isApiConfigured(): boolean {
  return getApiKey().length > 5;
}

export function getProviderConfig(): ProviderConfig {
  return PROVIDERS[getProvider()];
}

export function getProvidersList() {
  return PROVIDERS;
}

const SYSTEM_PROMPT = `You are a friendly Arabic language tutor helping users learn Arabic vocabulary through conversation. 

IMPORTANT: Always respond in this EXACT JSON format and nothing else:
{
  "reply": "Your conversational response here",
  "words": [
    {
      "arabic": "...",
      "transliteration": "...",
      "english": "..."
    }
  ]
}`;

export async function callAI(
  userMessage: string,
  conversationHistory: ChatHistoryMessage[] = []
): Promise<AIResponse> {
  const apiKey = getApiKey();
  const config = getProviderConfig();

  if (!apiKey || !config.url) {
    throw new Error("API not configured");
  }

  const messages: ChatHistoryMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...conversationHistory,
    { role: "user", content: userMessage },
  ];

  const response = await fetch(config.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: config.defaultModel,
      messages,
      temperature: 0.7,
      max_tokens: 1024,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    if (response.status === 401) throw new Error("Invalid API key.");
    if (response.status === 429) throw new Error("Rate limit exceeded.");
    throw new Error(`API error (${response.status}): ${errorBody || response.statusText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || "";
  return parseAIResponse(content);
}

function parseAIResponse(content: string): AIResponse {
  try {
    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) jsonStr = jsonMatch[1].trim();
    const objMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (objMatch) jsonStr = objMatch[0];
    const parsed = JSON.parse(jsonStr);
    return {
      reply: parsed.reply || content,
      words: Array.isArray(parsed.words) ? parsed.words.filter((w: any) => w.arabic && w.transliteration && w.english) : [],
    };
  } catch {
    return { reply: content, words: [] };
  }
}

export function buildChatHistory(
  messages: { role: "user" | "ai"; text: string }[]
): ChatHistoryMessage[] {
  return messages
    .filter((m) => m.role === "user" || m.role === "ai")
    .map((m) => ({
      role: m.role === "ai" ? "assistant" as const : "user" as const,
      content: m.text,
    }));
}
