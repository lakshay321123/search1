# Wizkid (Next.js-only, Vercel-ready)

Single-repo **Next.js 14** app with:
- `/api/ask` **SSE** route that calls a search API and streams citations & tokens
- Streaming UI that displays the answer and source cards
- Tailwind styling

## Run locally
Create a `.env` file (or copy `.env.example`) with:

```bash
SEARCH_API_KEY="your-search-api-key"
LLM_API_KEY="your-llm-api-key"
```

Then run:

```bash
npm install
npm run dev
# open http://localhost:3000
```

## Deploy to Vercel
- Push these files to a new GitHub repo
- Import into Vercel (no special config)
- Build command: default (`npm run build`)
- Output: handled by Next.js automatically

## Extending to real research
`app/api/ask/route.ts` demonstrates how to call a search API (e.g., Bing or Tavily),
fetch and parse pages, and stream tokens and `cite` events from an LLM. Supply your
own API keys via environment variables described above.
