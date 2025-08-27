import { Router } from 'express';
import type { Request, Response } from 'express';
import { nanoid } from 'nanoid';
import type { AskBody } from '../types.js';
import { planAndAnswer } from '../services/orchestrator.js';

const router = Router();

router.post('/', async (req: Request, res: Response) => {
  const body = req.body as AskBody;
  if (!body?.query || typeof body.query !== 'string') {
    return res.status(400).json({ error: 'query is required' });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  // status
  res.write(`data: ${JSON.stringify({ event: 'status', msg: 'planning' })}\n\n`);

  // Run the orchestrator (mock-friendly)
  for await (const chunk of planAndAnswer(body)) {
    res.write(`data: ${JSON.stringify(chunk)}\n\n`);
  }

  res.write(`data: ${JSON.stringify({ event: 'done', id: nanoid() })}\n\n`);
  res.end();
});

export default router;
