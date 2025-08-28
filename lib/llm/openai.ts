import OpenAI from "openai";

export async function* openaiStream(prompt: string, system?: string, model?: string) {
  const key = process.env.OPENAI_API_KEY; if (!key) throw new Error("OPENAI_API_KEY missing");
  const client = new OpenAI({ apiKey: key });
  const usedModel = model || process.env.OPENAI_MODEL || "gpt-4o-mini";
  const r = await client.chat.completions.create({
    model: usedModel,
    temperature: 0.2,
    stream: true,
    messages: [
      { role:"system", content: system || "You are Wizkid, a concise, citation-first assistant." },
      { role:"user", content: prompt }
    ]
  });
  for await (const part of r) {
    const t = part.choices?.[0]?.delta?.content;
    if (t) yield t;
  }
}
