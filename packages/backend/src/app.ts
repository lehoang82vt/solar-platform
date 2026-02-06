import express, { Express, Request, Response } from 'express';
import { isDatabaseConnected } from './config/database';
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
} from './services/quotes';

const app: Express = express();

app.use(express.json());

// Set UTF-8 charset for JSON responses
app.use((_req: Request, res: Response, next: Function) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  next();
});

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

app.get('/api/projects', requireAuth, async (req: Request, res: Response) => {
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

app.get('/api/customers', requireAuth, async (req: Request, res: Response) => {
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
    const quotes = await listQuotes(50);
    res.json(quotes);
  } catch (error) {
    console.error('List quotes error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default app;
