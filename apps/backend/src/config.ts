import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT || 8787),
  openaiKey: process.env.OPENAI_API_KEY || '',
  bingKey: process.env.BING_API_KEY || '',
  tavilyKey: process.env.TAVILY_API_KEY || '',
};
