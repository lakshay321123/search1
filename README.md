# Wizkid (Next.js-only, Vercel-ready)

Single-repo **Next.js 14** app with:
- `/api/ask` **SSE** route that streams tokens + citations (mocked)
- Streaming UI that displays the answer and source cards
- Tailwind styling

## API

`POST /api/ask` expects a JSON body like:

```json
{ "query": "What is Wizkid?", "style": "simple" }
```

The `style` field is optional and may be `simple` or `expert` (defaults to `simple`).

## Run locally
```bash
cp .env.example .env # set SEARCH_API_KEY and LLM_API_KEY
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
Edit `app/api/ask/route.ts` to call your search APIs (Bing/Tavily), fetch & parse pages,
rerank passages, and stream tokens & `cite` events from your LLM.
