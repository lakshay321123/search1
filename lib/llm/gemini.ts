import { GoogleGenerativeAI } from '@google/generative-ai';

export async function* geminiStream(prompt: string) {
  const key = process.env.GEMINI_API_KEY; if (!key) throw new Error('GEMINI_API_KEY missing');
  const genAI = new GoogleGenerativeAI(key);
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash-8b' });
  const res = await model.generateContentStream({ contents: [{ role:'user', parts:[{ text: prompt }]}] });
  // @ts-ignore
  for await (const ev of res.stream) {
    const t = typeof ev.text === 'function' ? ev.text()
      : ev?.candidates?.[0]?.content?.parts?.map((p:any)=>p.text).join('') || '';
    if (t) yield t;
  }
}
