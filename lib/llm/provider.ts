import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";

function haveOpenAI() { return !!process.env.OPENAI_API_KEY; }
function haveGemini() { return !!process.env.GEMINI_API_KEY; }

async function tryOpenAI(prompt: string, system?: string, temperature=0.2) {
  if (!haveOpenAI()) throw new Error("OPENAI_API_KEY missing");
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  const r = await client.chat.completions.create({
    model, temperature,
    messages: [{ role:"system", content: system || "" }, { role:"user", content: prompt }],
  });
  return (r.choices?.[0]?.message?.content || "").trim();
}

async function tryGemini(prompt: string, system?: string) {
  if (!haveGemini()) throw new Error("GEMINI_API_KEY missing");
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-8b" });
  const res = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: (system?system+"\n\n":"") + prompt }]}],
  });
  const text = res.response?.candidates?.[0]?.content?.parts?.map((p:any)=>p.text).join("") || "";
  return text.trim();
}

export async function generateText({ prompt, system, temperature=0.2 }: { prompt: string; system?: string; temperature?: number; }): Promise<string> {
  // Auto: prefer OpenAI, fallback Gemini, or vice versa based on availability
  const prefs = haveOpenAI() ? ["openai","gemini"] : ["gemini","openai"];
  for (const p of prefs) {
    try {
      return p === "openai" ? await tryOpenAI(prompt, system, temperature) : await tryGemini(prompt, system);
    } catch (e) {
      // try next
    }
  }
  throw new Error("No LLM provider is available (OPENAI_API_KEY or GEMINI_API_KEY required).");
}
