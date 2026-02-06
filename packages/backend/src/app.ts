import express, { Express, Request, Response } from 'express';
import { isDatabaseConnected, getDatabasePool } from './config/database';
import { version } from '../../shared/src';
import { authenticateUser, generateToken } from './services/auth';
import { requireAuth } from './middleware/auth';
import {
  createProject,
  getProjectById,
  listProjects,
} from './services/projects';
import {
  createCustomer,
  getCustomerById,
  listCustomers,
} from './services/customers';
import {
  createQuoteDraft,
  getQuoteById,
  listQuotes,
  updateQuotePayload,
  updateQuoteStatus,
} from './services/quotes';

const app: Express = express();

app.use(express.json());

// Set UTF-8 charset for JSON responses
app.use((_req: Request, res: Response, next: () => void) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  next();
});

// Health check
app.get('/api/health', (_: Request, res: Response) => {
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

// Projects endpoints
app.post('/api/projects', requireAuth, async (req: Request, res: Response) => {
  try {
    const { customer_name, address } = req.body;

    if (!customer_name) {
      res.status(400).json({ error: 'customer_name required' });
      return;
    }

    const project = await createProject(
      { customer_name, address },
      req.user!
    );
    res.status(201).json(project);
  } catch (error) {
    console.error('Create project error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/projects/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const project = await getProjectById(id);

    if (!project) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    res.json(project);
  } catch (error) {
    console.error('Get project error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/projects', requireAuth, async (_: Request, res: Response) => {
  try {
    const projects = await listProjects(50);
    res.json(projects);
  } catch (error) {
    console.error('List projects error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Customers endpoints
app.post('/api/customers', requireAuth, async (req: Request, res: Response) => {
  try {
    const { name, phone, email, address } = req.body;

    if (!name) {
      res.status(400).json({ error: 'name required' });
      return;
    }

    const customer = await createCustomer(
      { name, phone, email, address },
      req.user!
    );
    res.status(201).json(customer);
  } catch (error) {
    console.error('Create customer error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/customers/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const customer = await getCustomerById(id);

    if (!customer) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    res.json(customer);
  } catch (error) {
    console.error('Get customer error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/customers', requireAuth, async (_: Request, res: Response) => {
  try {
    const customers = await listCustomers(50);
    res.json(customers);
  } catch (error) {
    console.error('List customers error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Quotes endpoints
app.post('/api/quotes', requireAuth, async (req: Request, res: Response) => {
  try {
    const { customer_id, payload } = req.body;

    if (!customer_id) {
      res.status(400).json({ error: 'customer_id required' });
      return;
    }

    const quote = await createQuoteDraft(
      { customer_id, payload },
      req.user!
    );
    res.status(201).json(quote);
  } catch (error) {
    console.error('Create quote error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/quotes/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const quote = await getQuoteById(id);

    if (!quote) {
      res.status(404).json({ error: 'Not found' });
      return;
    }

    res.json(quote);
  } catch (error) {
    console.error('Get quote error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/quotes', requireAuth, async (req: Request, res: Response) => {
  try {
    // Extract and validate limit from query params
    let limit = 50;
    if (req.query.limit) {
      const parsedLimit = parseInt(req.query.limit as string, 10);
      if (!isNaN(parsedLimit) && parsedLimit > 0) {
        limit = Math.min(parsedLimit, 100); // Cap at 100
      }
    }

    // Call listQuotes service which returns { value, count }
    const result = await listQuotes(limit);

    // Log audit event
    const pool = getDatabasePool();
    if (pool) {
      await pool.query(
        'INSERT INTO audit_events (actor, action, payload) VALUES ($1, $2, $3)',
        [
          req.user!.email,
          'quote.list',
          JSON.stringify({ limit }),
        ]
      );
    }

    res.json(result);
  } catch (error) {
    console.error('List quotes error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.patch('/api/quotes/:id/payload', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const payload = req.body;

    if (!payload) {
      res.status(400).json({ error: 'payload required' });
      return;
    }

    const quote = await updateQuotePayload(id, payload, req.user!);
    res.json(quote);
  } catch (error) {
    console.error('Update quote payload error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.patch('/api/quotes/:id/status', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      res.status(400).json({ error: 'status required' });
      return;
    }

    const quote = await updateQuoteStatus(id, status, req.user!);
    res.json(quote);
  } catch (error: unknown) {
    const err = error as Error;
    if (err.message.includes('Cannot transition') || err.message.includes('Invalid status')) {
      res.status(400).json({ error: err.message });
      return;
    }
    if (err.message.includes('not found')) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    console.error('Update quote status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default app;
