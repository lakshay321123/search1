import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import askRouter from './routes/ask.js';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_, res) => res.json({ ok: true }));

app.use('/ask', askRouter);

app.listen(config.port, () => {
  console.log('Wizkid backend listening on port', config.port);
});
