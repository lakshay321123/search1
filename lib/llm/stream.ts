import { openaiStream } from './openai';
import { geminiStream } from './gemini';

export function getLLMStream(provider: 'openai'|'gemini'|'auto' = 'auto') {
  const haveOpenAI = !!process.env.OPENAI_API_KEY;
  const haveGemini = !!process.env.GEMINI_API_KEY;

  const order: Array<'openai'|'gemini'> =
    provider==='openai' ? ['openai','gemini'] :
    provider==='gemini' ? ['gemini','openai'] :
    haveOpenAI ? ['openai','gemini'] : ['gemini','openai'];

  async function* streamText(prompt: string) {
    for (const p of order) {
      try {
        if (p === 'openai') {
          for await (const t of openaiStream(prompt)) yield t;
          return;
        } else {
          for await (const t of geminiStream(prompt)) yield t;
          return;
        }
      } catch { /* try next */ }
    }
    yield 'Sorry, all LLM providers failed.';
  }
  return { streamText };
}
