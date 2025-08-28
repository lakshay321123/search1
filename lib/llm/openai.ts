import OpenAI from 'openai';

export async function streamOpenAI(prompt: string, onToken: (t: string) => void) {
  const key = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  if (!key) throw new Error('missing OPENAI_API_KEY');
  const client = new OpenAI({ apiKey: key });
  const stream = await client.chat.completions.create({
    model,
    messages: [{ role: 'user', content: prompt }],
    stream: true,
  });
  for await (const part of stream) {
    const t = part.choices?.[0]?.delta?.content;
    if (t) onToken(t);
  }
}
