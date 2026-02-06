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
  deleteCustomer,
  getCustomerByIdOrgSafe,
  isValidCustomerId,
  listCustomers,
  updateCustomer,
} from './services/customers';
import {
  createQuoteDraft,
  deleteQuote,
  getQuoteWithCustomer,
  isValidQuoteId,
  listQuotes,
  updateQuotePayload,
  updateQuoteStatus,
} from './services/quotes';
import { write as auditLogWrite, getDefaultOrganizationId } from './services/auditLog';

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

    const organizationId = await getDefaultOrganizationId();
    const project = await createProject({ customer_name, address }, req.user!, organizationId);
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

    const organizationId = await getDefaultOrganizationId();
    const customer = await createCustomer({ name, phone, email, address }, req.user!, organizationId);
    res.status(201).json(customer);
  } catch (error) {
    console.error('Create customer error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/customers/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!isValidCustomerId(id)) {
      res.status(400).json({ error: 'invalid id' });
      return;
    }
    const organizationId = await getDefaultOrganizationId();
    const customer = await getCustomerByIdOrgSafe(id, organizationId);

    if (!customer) {
      await auditLogWrite({
        organization_id: organizationId,
        actor: req.user!.email,
        action: 'customer.get.not_found',
        entity_type: 'customer',
        metadata: { customer_id: id },
      });
      res.status(404).json({ error: 'Customer not found' });
      return;
    }

    await auditLogWrite({
      organization_id: organizationId,
      actor: req.user!.email,
      action: 'customer.get',
      entity_type: 'customer',
      entity_id: customer.id,
      metadata: { customer_id: id },
    });

    res.json({ value: customer });
  } catch (error) {
    console.error('Get customer error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.patch('/api/customers/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!isValidCustomerId(id)) {
      res.status(400).json({ error: 'invalid id' });
      return;
    }
    const organizationId = await getDefaultOrganizationId();
    const patch = req.body as Record<string, unknown>;
    const result = await updateCustomer(id, organizationId, patch);

    if (!result) {
      await auditLogWrite({
        organization_id: organizationId,
        actor: req.user!.email,
        action: 'customer.update.not_found',
        entity_type: 'customer',
        metadata: { customer_id: id },
      });
      res.status(404).json({ error: 'Customer not found' });
      return;
    }

    await auditLogWrite({
      organization_id: organizationId,
      actor: req.user!.email,
      action: 'customer.update',
      entity_type: 'customer',
      entity_id: result.id,
      metadata: { customer_id: id, changed_fields: result.changedFields },
    });

    res.status(200).json({ value: { id: result.id } });
  } catch (error) {
    console.error('Update customer error:', error);
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

app.delete('/api/customers/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!isValidCustomerId(id)) {
      res.status(400).json({ error: 'invalid id' });
      return;
    }
    const organizationId = await getDefaultOrganizationId();
    const result = await deleteCustomer(id, organizationId);

    if (!result) {
      await auditLogWrite({
        organization_id: organizationId,
        actor: req.user!.email,
        action: 'customer.delete.not_found',
        entity_type: 'customer',
        metadata: { customer_id: id },
      });
      res.status(404).json({ error: 'Customer not found' });
      return;
    }

    await auditLogWrite({
      organization_id: organizationId,
      actor: req.user!.email,
      action: 'customer.delete',
      entity_type: 'customer',
      entity_id: result.id,
      metadata: { customer_id: id, mode: result.mode, quote_count: result.quoteCount },
    });

    res.status(200).json({ value: { id: result.id } });
  } catch (error) {
    console.error('Delete customer error:', error);
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

    const organizationId = await getDefaultOrganizationId();
    const quote = await createQuoteDraft({ customer_id, payload }, req.user!, organizationId);
    res.status(201).json(quote);
  } catch (error) {
    console.error('Create quote error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/quotes/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!isValidQuoteId(id)) {
      res.status(400).json({ error: 'invalid id' });
      return;
    }
    const organizationId = await getDefaultOrganizationId();
    const quote = await getQuoteWithCustomer(id, organizationId);

    if (!quote) {
      await auditLogWrite({
        organization_id: organizationId,
        actor: req.user!.email,
        action: 'quote.get.not_found',
        entity_type: 'quote',
        metadata: { quote_id: id },
      });
      res.status(404).json({ error: 'Quote not found' });
      return;
    }

    await auditLogWrite({
      organization_id: organizationId,
      actor: req.user!.email,
      action: 'quote.get',
      entity_type: 'quote',
      entity_id: quote.id,
      metadata: { quote_id: quote.id, customer_id: quote.customer_id, status: quote.status },
    });

    res.json({ value: quote });
  } catch (error) {
    console.error('Get quote error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/quotes/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!isValidQuoteId(id)) {
      res.status(400).json({ error: 'invalid id' });
      return;
    }
    const organizationId = await getDefaultOrganizationId();
    const deleted = await deleteQuote(id, organizationId);

    if (!deleted) {
      await auditLogWrite({
        organization_id: organizationId,
        actor: req.user!.email,
        action: 'quote.delete.not_found',
        entity_type: 'quote',
        metadata: { quote_id: id },
      });
      res.status(404).json({ error: 'Quote not found' });
      return;
    }

    await auditLogWrite({
      organization_id: organizationId,
      actor: req.user!.email,
      action: 'quote.delete',
      entity_type: 'quote',
      entity_id: deleted.id,
      metadata: { quote_id: id, customer_id: deleted.customer_id, status: deleted.status },
    });

    res.status(200).json({ value: { id: deleted.id } });
  } catch (error) {
    console.error('Delete quote error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const VALID_QUOTE_LIST_STATUSES = ['draft', 'sent', 'accepted', 'rejected'];

app.get('/api/quotes', requireAuth, async (req: Request, res: Response) => {
  try {
    // Extract and validate limit from query params
    let limit = 20;
    if (req.query.limit !== undefined) {
      const parsedLimit = parseInt(req.query.limit as string, 10);
      if (isNaN(parsedLimit)) {
        res.status(400).json({ error: 'invalid limit' });
        return;
      }
      limit = Math.max(1, Math.min(parsedLimit, 100)); // Clamp 1..100
    }

    // Extract and validate offset from query params
    let offset = 0;
    if (req.query.offset !== undefined) {
      const parsedOffset = parseInt(req.query.offset as string, 10);
      if (isNaN(parsedOffset)) {
        res.status(400).json({ error: 'invalid offset' });
        return;
      }
      offset = Math.max(0, Math.min(parsedOffset, 100000)); // Clamp 0..100000
    }

    // status: optional; if provided must be one of enum
    let statusFilter: string | undefined;
    if (req.query.status !== undefined) {
      if (typeof req.query.status !== 'string') {
        res.status(400).json({ error: 'invalid status' });
        return;
      }
      if (!VALID_QUOTE_LIST_STATUSES.includes(req.query.status)) {
        res.status(400).json({ error: 'invalid status' });
        return;
      }
      statusFilter = req.query.status;
    }

    // q: optional; if provided must be string, trim; empty after trim => undefined; max length 100
    let qFilter: string | undefined;
    if (req.query.q !== undefined) {
      if (typeof req.query.q !== 'string') {
        res.status(400).json({ error: 'q too long' });
        return;
      }
      const trimmed = req.query.q.trim();
      if (trimmed.length > 100) {
        res.status(400).json({ error: 'q too long' });
        return;
      }
      if (trimmed.length > 0) {
        qFilter = trimmed;
      }
    }

    const organizationId = await getDefaultOrganizationId();
    const filters = (statusFilter !== undefined || qFilter !== undefined)
      ? { status: statusFilter, q: qFilter }
      : undefined;
    const result = await listQuotes(organizationId, limit, offset, filters);

    // Log audit event to audit_logs (F-05 foundation); metadata includes status/q when present
    const metadata: Record<string, unknown> = {
      limit,
      offset,
      result_count: result.value.length,
    };
    if (statusFilter !== undefined) metadata.status = statusFilter;
    if (qFilter !== undefined) metadata.q = qFilter;

    await auditLogWrite({
      organization_id: organizationId,
      actor: req.user!.email,
      action: 'quote.list',
      entity_type: 'quote',
      metadata,
    });

    res.json(result);
  } catch (error) {
    console.error('List quotes error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.patch('/api/quotes/:id/payload', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const body = req.body as { payload?: unknown };
    const payload = body?.payload;

    // Validate payload: must be a plain object (not null/array/string)
    if (
      payload === null ||
      payload === undefined ||
      typeof payload !== 'object' ||
      Array.isArray(payload)
    ) {
      res.status(400).json({ error: 'payload must be an object' });
      return;
    }

    const organizationId = await getDefaultOrganizationId();
    try {
      const quote = await updateQuotePayload(
        id,
        payload as Record<string, unknown>,
        req.user!,
        organizationId
      );

      const keysCount = Object.keys(payload as Record<string, unknown>).length;
      await auditLogWrite({
        organization_id: organizationId,
        actor: req.user!.email,
        action: 'quote.payload.update',
        entity_type: 'quote',
        entity_id: quote.id,
        metadata: { quote_id: id, keys_count: keysCount },
      });

      res.json({ value: quote });
    } catch (error: unknown) {
      const err = error as Error;
      if (err.message.includes('Quote not found')) {
        await auditLogWrite({
          organization_id: organizationId,
          actor: req.user!.email,
          action: 'quote.payload.update.not_found',
          entity_type: 'quote',
          metadata: { quote_id: id },
        });
        res.status(404).json({ error: 'Quote not found' });
        return;
      }
      throw error;
    }
  } catch (error) {
    console.error('Update quote payload error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.patch('/api/quotes/:id/status', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const body = req.body as { status?: unknown };
    const status = body?.status;

    const validStatuses = ['draft', 'sent', 'accepted', 'rejected'] as const;
    if (typeof status !== 'string' || !validStatuses.includes(status as (typeof validStatuses)[number])) {
      res.status(400).json({ error: 'invalid status' });
      return;
    }

    const organizationId = await getDefaultOrganizationId();
    try {
      const result = await updateQuoteStatus(id, status, req.user!, organizationId);

      await auditLogWrite({
        organization_id: organizationId,
        actor: req.user!.email,
        action: 'quote.status.update',
        entity_type: 'quote',
        entity_id: result.quote.id,
        metadata: { quote_id: id, from: result.from, to: result.to },
      });

      res.json({ value: result.quote });
    } catch (error: unknown) {
      const err = error as Error;
      if (err.message.includes('Quote not found')) {
        await auditLogWrite({
          organization_id: organizationId,
          actor: req.user!.email,
          action: 'quote.status.update.not_found',
          entity_type: 'quote',
          metadata: { quote_id: id, to: status },
        });
        res.status(404).json({ error: 'Quote not found' });
        return;
      }
      throw error;
    }
  } catch (error: unknown) {
    console.error('Update quote status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default app;
