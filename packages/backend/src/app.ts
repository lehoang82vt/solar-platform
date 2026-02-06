import express, { Express, Request, Response } from 'express';
import { isDatabaseConnected } from './config/database';
import { version } from '../../shared/src';
import { authenticateUser, generateToken } from './services/auth';
import { requireAuth } from './middleware/auth';

const app: Express = express();

app.use(express.json());

// Health check
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    version,
    database: isDatabaseConnected() ? 'connected' : 'disconnected',
  });
});

// Login endpoint
app.post('/api/auth/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password required' });
      return;
    }

    const user = await authenticateUser(email, password);
    if (!user) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const token = generateToken(user);
    res.json(token);
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get current user
app.get('/api/me', requireAuth, (req: Request, res: Response) => {
  res.json(req.user);
});

export default app;
