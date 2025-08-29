import OpenAI from "openai";

export async function openaiGenerate(prompt: string, system?: string, model?: string): Promise<string> {
  const key = process.env.OPENAI_API_KEY; 
  if (!key) throw new Error("OPENAI_API_KEY missing");
  const client = new OpenAI({ apiKey: key });
  const usedModel = model || process.env.OPENAI_MODEL || "gpt-4o-mini";
  const r = await client.chat.completions.create({
    model: usedModel,
    temperature: 0.2,
    messages: [
      { role:"system", content: system || "You are Wizkid, a concise, citation-first assistant." },
      { role:"user", content: prompt }
    ]
  });
  return (r.choices?.[0]?.message?.content || "").trim();
}
