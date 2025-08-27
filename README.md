# Wizkid — Perplexity‑style Research Assistant (MVP Monorepo)

This is a minimal **working scaffold** for Wizkid: a citation‑first research assistant.
It includes a **Node/Express TypeScript backend** (with SSE streaming) and a **Next.js 14 frontend** (App Router + Tailwind).

> Out of the box, the backend streams a **mock** answer so you can verify the UX. Plug in your APIs later.

## Quick start

### 1) Requirements
- Node.js 20+
- pnpm or npm (examples below use `npm` workspaces)
- (Optional) Docker + docker-compose

### 2) Install
```bash
npm install
```

### 3) Run dev (two terminals)
Backend:
```bash
npm run dev:backend
```

Frontend (in a new terminal):
```bash
npm run dev:frontend
```
Open http://localhost:3000

> Frontend expects `NEXT_PUBLIC_BACKEND_URL=http://localhost:8787` (set in `.env.local` under `apps/frontend`).

### 4) Production build
```bash
npm run build
npm run start:backend
npm run start:frontend
```

### 5) Docker
```bash
docker-compose up --build
```

## Structure
```
wizkid/
  apps/
    backend/        # Express + TS, SSE /ask endpoint
    frontend/       # Next.js 14 + Tailwind UI
  packages/
    shared/         # Shared TypeScript types
  .github/workflows/ci.yml
```

## Plug in real services
Edit `apps/backend/src/services/*.ts` and `apps/backend/src/config.ts`.
Add your keys to `apps/backend/.env`:
```
OPENAI_API_KEY=
BING_API_KEY=
TAVILY_API_KEY=
```

## License
MIT
