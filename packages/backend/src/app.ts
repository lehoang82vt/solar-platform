import express, { Express, Request, Response } from 'express';
import { isDatabaseConnected } from './config/database';
import { version } from '../../shared/src';

const app: Express = express();

app.use(express.json());

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    version,
    database: isDatabaseConnected() ? 'connected' : 'disconnected',
  });
});

export default app;
