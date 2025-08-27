# Wizkid (Next.js-only, Vercel-ready)

Single-repo **Next.js 14** app with:
- `/api/ask` **SSE** route that streams tokens + citations (mocked)
- Streaming UI that displays the answer and source cards
- Tailwind styling

## Run locally
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
Edit `app/api/ask/route.ts` to call your search APIs (Bing/Tavily), fetch & parse pages,
rerank passages, and stream tokens & `cite` events from your LLM.
