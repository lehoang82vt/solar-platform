import express, { Express, Request, Response } from 'express';
import { isDatabaseConnected } from './config/database';
import { version } from '../../shared/src';
import { authenticateUser, generateToken } from './services/auth';
import { requireAuth } from './middleware/auth';
import {
  createProject,
  deleteProject,
  getProjectByIdOrgSafe,
  getProjectOrganizationId,
  isValidProjectId,
  listProjectsV2,
  listProjectsV3,
  recomputeProjectStatus,
  transitionProjectStatus,
  updateProject,
  type ProjectPatch,
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
  createQuoteFromProject,
  deleteQuote,
  getQuoteDetailV2,
  getQuoteDetailV3,
  isValidQuoteId,
  listQuotes,
  listQuotesV2,
  updateQuotePayload,
  updateQuoteStatus,
} from './services/quotes';
import {
  createContract,
  getContractByIdOrg,
  getContractDetailV2,
  isValidContractId,
  listContractsByProject,
  listContractsV2,
  signContract,
  transitionContract,
  updateContract,
  type CreateContractInput,
  type ContractPatch,
} from './services/contracts';
import {
  createHandover,
  completeHandover,
  getHandoverByIdOrg,
  isValidHandoverId,
  listHandoversByProject,
  listHandoversV2,
  signHandover,
  updateHandover,
} from './services/handovers';
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

// Projects endpoints (F-20: customer_id + name, audit project.create / project.create.customer_not_found)
app.post('/api/projects', requireAuth, async (req: Request, res: Response) => {
  try {
    const body = req.body as { customer_id?: unknown; name?: unknown; address?: unknown; notes?: unknown };
    const customer_id = body.customer_id;
    const name = body.name;

    if (customer_id === undefined || customer_id === null) {
      res.status(400).json({ error: 'customer_id required' });
      return;
    }
    if (typeof customer_id !== 'string' || !isValidCustomerId(customer_id)) {
      res.status(400).json({ error: 'invalid customer_id' });
      return;
    }
    if (name === undefined || name === null || typeof name !== 'string' || name.trim() === '') {
      res.status(400).json({ error: 'name required' });
      return;
    }

    const organizationId = await getDefaultOrganizationId();
    const result = await createProject(organizationId, {
      customer_id,
      name: name.trim(),
      address: body.address != null ? (typeof body.address === 'string' ? body.address : null) : undefined,
      notes: body.notes != null ? (typeof body.notes === 'string' ? body.notes : null) : undefined,
    });

    if (result.kind === 'customer_not_found') {
      await auditLogWrite({
        organization_id: organizationId,
        actor: req.user!.email,
        action: 'project.create.customer_not_found',
        entity_type: 'project',
        metadata: { customer_id },
      });
      res.status(404).json({ error: 'Customer not found' });
      return;
    }

    await auditLogWrite({
      organization_id: organizationId,
      actor: req.user!.email,
      action: 'project.create',
      entity_type: 'project',
      entity_id: result.project.id,
      metadata: { project_id: result.project.id, customer_id },
    });

    res.status(201).json({ value: result.project });
  } catch (error) {
    console.error('Create project error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// F-33: List projects v3 (customer + stats, paging, audit project.listed)
app.get('/api/projects/v3', requireAuth, async (req: Request, res: Response) => {
  try {
    let limit = 20;
    if (req.query.limit !== undefined) {
      const parsedLimit = parseInt(req.query.limit as string, 10);
      if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
        res.status(400).json({ error: 'invalid limit' });
        return;
      }
      limit = parsedLimit;
    }
    let offset = 0;
    if (req.query.offset !== undefined) {
      const parsedOffset = parseInt(req.query.offset as string, 10);
      if (isNaN(parsedOffset) || parsedOffset < 0) {
        res.status(400).json({ error: 'invalid offset' });
        return;
      }
      offset = parsedOffset;
    }
    let statusFilter: string | undefined;
    if (req.query.status !== undefined) {
      if (typeof req.query.status !== 'string') {
        res.status(400).json({ error: 'invalid status' });
        return;
      }
      statusFilter = req.query.status;
    }
    let searchFilter: string | undefined;
    if (req.query.search !== undefined) {
      if (typeof req.query.search !== 'string') {
        res.status(400).json({ error: 'invalid search' });
        return;
      }
      const trimmed = (req.query.search as string).trim();
      if (trimmed.length > 0) searchFilter = trimmed;
    }

    const organizationId = await getDefaultOrganizationId();
    const filters =
      statusFilter !== undefined || searchFilter !== undefined
        ? { status: statusFilter, search: searchFilter }
        : undefined;
    const result = await listProjectsV3(organizationId, limit, offset, filters);

    await auditLogWrite({
      organization_id: organizationId,
      actor: req.user!.email,
      action: 'project.listed',
      entity_type: 'project',
      metadata: {
        limit: result.paging.limit,
        offset: result.paging.offset,
        status_present: Boolean(statusFilter),
        search_present: Boolean(searchFilter),
      },
    });

    res.status(200).json(result);
  } catch (error) {
    console.error('List projects v3 error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/projects/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!isValidProjectId(id)) {
      res.status(400).json({ error: 'invalid id' });
      return;
    }
    const organizationId = await getDefaultOrganizationId();
    const project = await getProjectByIdOrgSafe(id, organizationId);

    if (!project) {
      await auditLogWrite({
        organization_id: organizationId,
        actor: req.user!.email,
        action: 'project.get.not_found',
        entity_type: 'project',
        metadata: { project_id: id },
      });
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    await auditLogWrite({
      organization_id: organizationId,
      actor: req.user!.email,
      action: 'project.get',
      entity_type: 'project',
      entity_id: project.id,
      metadata: { project_id: id },
    });

    res.json({ value: project });
  } catch (error) {
    console.error('Get project error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.patch('/api/projects/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!isValidProjectId(id)) {
      res.status(400).json({ error: 'invalid id' });
      return;
    }
    const patch = req.body as Record<string, unknown>;
    if (patch && typeof patch === 'object') {
      if ('name' in patch) {
        const name = patch.name;
        if (typeof name !== 'string' || name.trim() === '') {
          res.status(400).json({ error: 'invalid payload' });
          return;
        }
      }
      if ('address' in patch) {
        const address = patch.address;
        if (address !== null && typeof address !== 'string') {
          res.status(400).json({ error: 'invalid payload' });
          return;
        }
      }
    }
    const organizationId = await getDefaultOrganizationId();
    const result = await updateProject(organizationId, id, patch as ProjectPatch);

    if (!result) {
      await auditLogWrite({
        organization_id: organizationId,
        actor: req.user!.email,
        action: 'project.update.not_found',
        entity_type: 'project',
        metadata: { project_id: id },
      });
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    await auditLogWrite({
      organization_id: organizationId,
      actor: req.user!.email,
      action: 'project.update',
      entity_type: 'project',
      entity_id: result.id,
      metadata: { project_id: id, changed_fields: result.changedFields },
    });

    res.status(200).json({ value: { id: result.id } });
  } catch (error) {
    console.error('Update project error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// F-29: Project status recompute + transition
app.post('/api/projects/:projectId/status/recompute', requireAuth, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    if (!isValidProjectId(projectId)) {
      res.status(400).json({ error: 'invalid project id' });
      return;
    }
    const organizationId = await getDefaultOrganizationId();
    const result = await recomputeProjectStatus(organizationId, projectId);

    if (result.kind === 'not_found') {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    await auditLogWrite({
      organization_id: organizationId,
      actor: req.user!.email,
      action: 'project.status_changed',
      entity_type: 'project',
      entity_id: projectId,
      metadata: { project_id: projectId, from: result.from, to: result.status, reason: 'recompute' },
    });

    res.status(200).json({ value: { status: result.status, from: result.from } });
  } catch (error) {
    console.error('Recompute project status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/projects/:projectId/status/transition', requireAuth, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    if (!isValidProjectId(projectId)) {
      res.status(400).json({ error: 'invalid project id' });
      return;
    }
    const body = req.body as { to_status?: unknown; reason?: unknown };
    const toStatus = body?.to_status;
    if (typeof toStatus !== 'string' || !toStatus.trim()) {
      res.status(400).json({ error: 'to_status required' });
      return;
    }
    const organizationId = await getDefaultOrganizationId();
    const result = await transitionProjectStatus(
      organizationId,
      projectId,
      toStatus.trim(),
      body?.reason != null ? String(body.reason) : undefined
    );

    if (result.kind === 'not_found') {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    if (result.kind === 'reason_required') {
      res.status(400).json({ error: 'reason required for CANCELLED' });
      return;
    }
    if (result.kind === 'invalid_transition') {
      res.status(422).json({ error: 'Invalid transition', from: result.from, to: result.to });
      return;
    }

    await auditLogWrite({
      organization_id: organizationId,
      actor: req.user!.email,
      action: 'project.status_changed',
      entity_type: 'project',
      entity_id: projectId,
      metadata: { project_id: projectId, from: result.from, to: result.to, reason: body?.reason ?? null },
    });

    res.status(200).json({ value: { status: result.to, from: result.from } });
  } catch (error) {
    console.error('Transition project status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create quote for project. Org only from getProjectOrganizationId(projectId); no getProjectByIdOrgSafe, no org filter.
app.post('/api/projects/:projectId/quotes', requireAuth, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    console.log('[route-hit] create-quote-by-project', { projectId });
    if (!isValidProjectId(projectId)) {
      res.status(400).json({ error: 'invalid project id' });
      return;
    }
    const organizationId = await getProjectOrganizationId(projectId);
    console.log('[route-org]', { projectId, organizationId });
    if (!organizationId) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    const body = req.body as { title?: unknown };
    const title = body?.title != null ? String(body.title) : undefined;
    const result = await createQuoteFromProject(organizationId, { project_id: projectId, title });

    if (result.kind === 'project_not_found') {
      await auditLogWrite({
        organization_id: organizationId,
        actor: req.user!.email,
        action: 'quote.create.project_not_found',
        entity_type: 'quote',
        metadata: { project_id: projectId },
      });
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    if (result.kind === 'project_missing_customer') {
      res.status(409).json({ error: 'Project missing customer_id' });
      return;
    }
    if (result.kind === 'customer_not_found') {
      res.status(404).json({
        error: 'Customer not found',
        customer_id: result.customer_id,
        project_id: result.project_id,
      });
      return;
    }

    await auditLogWrite({
      organization_id: organizationId,
      actor: req.user!.email,
      action: 'quote.create',
      entity_type: 'quote',
      entity_id: result.quote.id,
      metadata: { quote_id: result.quote.id, project_id: result.quote.project_id },
    });
    res.status(201).json({ value: result.quote });
  } catch (error) {
    console.error('Create quote for project error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Approve quote. Org only from getProjectOrganizationId(projectId); no getProjectByIdOrgSafe, no org filter.
app.post('/api/projects/:projectId/quotes/:quoteId/approve', requireAuth, async (req: Request, res: Response) => {
  try {
    const { projectId, quoteId } = req.params;
    if (!isValidProjectId(projectId) || !isValidQuoteId(quoteId)) {
      res.status(400).json({ error: 'invalid project id or quote id' });
      return;
    }
    const organizationId = await getProjectOrganizationId(projectId);
    if (!organizationId) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    try {
      const result = await updateQuoteStatus(quoteId, 'accepted', req.user!, organizationId);
      await auditLogWrite({
        organization_id: organizationId,
        actor: req.user!.email,
        action: 'quote.status.update',
        entity_type: 'quote',
        entity_id: result.quote.id,
        metadata: { quote_id: quoteId, project_id: projectId, from: result.from, to: result.to },
      });
      res.status(200).json({ value: result.quote });
    } catch (error: unknown) {
      const err = error as Error;
      if (err.message.includes('Quote not found')) {
        res.status(404).json({ error: 'Quote not found' });
        return;
      }
      throw error;
    }
  } catch (error) {
    console.error('Approve quote error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Contracts (create from APPROVED quote, sign, transition)
app.post('/api/projects/:projectId/contracts', requireAuth, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    if (!isValidProjectId(projectId)) {
      res.status(400).json({ error: 'invalid project id' });
      return;
    }
    const body = req.body as CreateContractInput & { quote_id?: unknown };
    const quote_id = body?.quote_id;
    if (typeof quote_id !== 'string' || !isValidQuoteId(quote_id)) {
      res.status(400).json({ error: 'quote_id required and must be valid UUID' });
      return;
    }
    const payment_terms = body?.payment_terms;
    if (!Array.isArray(payment_terms)) {
      res.status(400).json({ error: 'payment_terms must be an array' });
      return;
    }
    const organizationId = await getDefaultOrganizationId();
    const result = await createContract(organizationId, projectId, {
      quote_id,
      payment_terms,
      warranty_terms: body?.warranty_terms,
      construction_days: body?.construction_days,
    });

    if (result.kind === 'project_not_found') {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    if (result.kind === 'quote_not_found') {
      res.status(404).json({ error: 'Quote not found' });
      return;
    }
    if (result.kind === 'quote_not_approved') {
      await auditLogWrite({
        organization_id: organizationId,
        actor: req.user!.email,
        action: 'contract.create.quote_not_approved',
        entity_type: 'contract',
        metadata: { project_id: projectId, quote_id, quote_status: result.status },
      });
      res.status(422).json({ error: 'Quote must be approved to create contract', status: result.status });
      return;
    }
    if (result.kind === 'quote_project_mismatch') {
      res.status(422).json({ error: 'Quote does not belong to this project' });
      return;
    }
    if (result.kind === 'quote_price_total_required') {
      res.status(422).json({ error: 'QUOTE_PRICE_TOTAL_REQUIRED' });
      return;
    }
    if (result.kind === 'payment_terms_invalid') {
      res.status(400).json({ error: result.error });
      return;
    }

    await auditLogWrite({
      organization_id: organizationId,
      actor: req.user!.email,
      action: 'contract.created',
      entity_type: 'contract',
      entity_id: result.contract.id,
      metadata: {
        project_id: projectId,
        quote_id,
        quote_status: result.quote_status,
        contract_number: result.contract.contract_number,
        contract_id: result.contract.id,
      },
    });

    res.status(201).json({ value: result.contract });
  } catch (error) {
    console.error('Create contract error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/projects/:projectId/contracts', requireAuth, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    if (!isValidProjectId(projectId)) {
      res.status(400).json({ error: 'invalid project id' });
      return;
    }
    const organizationId = await getDefaultOrganizationId();
    const list = await listContractsByProject(organizationId, projectId);
    res.status(200).json({ value: list });
  } catch (error) {
    console.error('List contracts error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/projects/:projectId/contracts/:contractId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { projectId, contractId } = req.params;
    if (!isValidProjectId(projectId) || !isValidContractId(contractId)) {
      res.status(400).json({ error: 'invalid project id or contract id' });
      return;
    }
    const organizationId = await getDefaultOrganizationId();
    const contract = await getContractByIdOrg(organizationId, projectId, contractId);
    if (!contract) {
      res.status(404).json({ error: 'Contract not found' });
      return;
    }
    res.status(200).json({ value: contract });
  } catch (error) {
    console.error('Get contract error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.patch('/api/projects/:projectId/contracts/:contractId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { projectId, contractId } = req.params;
    if (!isValidProjectId(projectId) || !isValidContractId(contractId)) {
      res.status(400).json({ error: 'invalid project id or contract id' });
      return;
    }
    const body = req.body as ContractPatch & Record<string, unknown>;
    const organizationId = await getDefaultOrganizationId();
    const result = await updateContract(organizationId, projectId, contractId, body);

    if (result.kind === 'not_found') {
      res.status(404).json({ error: 'Contract not found' });
      return;
    }
    if (result.kind === 'locked') {
      res.status(409).json({ error: 'Contract cannot be edited when SIGNED or COMPLETED' });
      return;
    }
    if (result.kind === 'immutable') {
      res.status(422).json({ error: 'Contract is immutable after sign; cannot update snapshot or contract_value' });
      return;
    }
    res.status(200).json({ value: result.contract });
  } catch (error) {
    console.error('Update contract error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/projects/:projectId/contracts/:contractId/sign', requireAuth, async (req: Request, res: Response) => {
  try {
    const { projectId, contractId } = req.params;
    if (!isValidProjectId(projectId) || !isValidContractId(contractId)) {
      res.status(400).json({ error: 'invalid project id or contract id' });
      return;
    }
    const organizationId = await getDefaultOrganizationId();
    const result = await signContract(organizationId, projectId, contractId, req.user!.email);

    if (result.kind === 'not_found') {
      res.status(404).json({ error: 'Contract not found' });
      return;
    }
    if (result.kind === 'invalid_state') {
      res.status(409).json({ error: 'Invalid transition; contract must be DRAFT to sign', status: result.status });
      return;
    }

    await auditLogWrite({
      organization_id: organizationId,
      actor: req.user!.email,
      action: 'contract.status.changed',
      entity_type: 'contract',
      entity_id: result.contract.id,
      metadata: { from: result.fromStatus, to: result.contract.status },
    });

    res.status(200).json({ value: result.contract });
  } catch (error) {
    console.error('Sign contract error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/projects/:projectId/contracts/:contractId/transition', requireAuth, async (req: Request, res: Response) => {
  try {
    const { projectId, contractId } = req.params;
    if (!isValidProjectId(projectId) || !isValidContractId(contractId)) {
      res.status(400).json({ error: 'invalid project id or contract id' });
      return;
    }
    const body = req.body as { to_status?: unknown; reason?: unknown };
    const rawToStatus = typeof body?.to_status === 'string' ? body.to_status.trim() : '';
    if (rawToStatus === '') {
      res.status(400).json({ error: 'to_status required' });
      return;
    }
    const organizationId = await getDefaultOrganizationId();
    const result = await transitionContract(
      organizationId,
      projectId,
      contractId,
      rawToStatus,
      body?.reason != null ? String(body.reason) : undefined
    );

    if (result.kind === 'not_found') {
      res.status(404).json({ error: 'Contract not found' });
      return;
    }
    if (result.kind === 'reason_required') {
      res.status(400).json({ error: 'reason required for CANCELLED' });
      return;
    }
    if (result.kind === 'invalid_to_status') {
      res.status(400).json({ error: 'invalid to_status' });
      return;
    }
    if (result.kind === 'invalid_state') {
      res.status(409).json({
        error: 'Invalid transition; wrong status order',
        current: result.current,
        to_status: result.to_status,
      });
      return;
    }

    await auditLogWrite({
      organization_id: organizationId,
      actor: req.user!.email,
      action: 'contract.status.changed',
      entity_type: 'contract',
      entity_id: result.contract.id,
      metadata: { from: result.fromStatus, to: result.contract.status },
    });

    res.status(200).json({ value: result.contract });
  } catch (error) {
    console.error('Transition contract error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// F-31: List contracts v2 (join project, paging, audit contract.listed)
app.get('/api/contracts/v2', requireAuth, async (req: Request, res: Response) => {
  try {
    let limit = 20;
    if (req.query.limit !== undefined) {
      const parsedLimit = parseInt(req.query.limit as string, 10);
      if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
        res.status(400).json({ error: 'invalid limit' });
        return;
      }
      limit = parsedLimit;
    }
    let offset = 0;
    if (req.query.offset !== undefined) {
      const parsedOffset = parseInt(req.query.offset as string, 10);
      if (isNaN(parsedOffset) || parsedOffset < 0) {
        res.status(400).json({ error: 'invalid offset' });
        return;
      }
      offset = parsedOffset;
    }
    let statusFilter: string | undefined;
    if (req.query.status !== undefined) {
      if (typeof req.query.status !== 'string') {
        res.status(400).json({ error: 'invalid status' });
        return;
      }
      statusFilter = req.query.status;
    }
    let searchFilter: string | undefined;
    if (req.query.search !== undefined) {
      if (typeof req.query.search !== 'string') {
        res.status(400).json({ error: 'invalid search' });
        return;
      }
      const trimmed = (req.query.search as string).trim();
      if (trimmed.length > 0) searchFilter = trimmed;
    }
    let projectIdFilter: string | undefined;
    if (req.query.project_id !== undefined) {
      if (typeof req.query.project_id !== 'string') {
        res.status(400).json({ error: 'invalid project_id' });
        return;
      }
      projectIdFilter = (req.query.project_id as string).trim();
      if (projectIdFilter.length === 0) projectIdFilter = undefined;
    }

    const organizationId = await getDefaultOrganizationId();
    const filters =
      statusFilter !== undefined || searchFilter !== undefined || projectIdFilter !== undefined
        ? { status: statusFilter, search: searchFilter, project_id: projectIdFilter }
        : undefined;
    const result = await listContractsV2(organizationId, limit, offset, filters);

    await auditLogWrite({
      organization_id: organizationId,
      actor: req.user!.email,
      action: 'contract.listed',
      entity_type: 'contract',
      metadata: {
        limit: result.paging.limit,
        offset: result.paging.offset,
        status_present: statusFilter !== undefined,
        search_present: searchFilter !== undefined && (searchFilter?.length ?? 0) > 0,
        project_id_present: projectIdFilter !== undefined,
      },
    });

    res.status(200).json(result);
  } catch (error) {
    console.error('List contracts v2 error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// F-35: Contract detail v2 (join project, quote, customer, handover; audit contract.viewed)
app.get('/api/contracts/:id/v2', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!isValidContractId(id)) {
      res.status(400).json({ error: 'invalid id' });
      return;
    }
    const organizationId = await getDefaultOrganizationId();
    const detail = await getContractDetailV2(id, organizationId);

    if (!detail) {
      res.status(404).json({ error: 'Contract not found' });
      return;
    }

    await auditLogWrite({
      organization_id: organizationId,
      actor: req.user!.email,
      action: 'contract.viewed',
      entity_type: 'contract',
      entity_id: detail.id,
      metadata: {
        has_project: detail.project != null,
        has_quote: detail.quote != null,
        has_handover: detail.handover != null,
        has_customer: detail.customer != null,
      },
    });

    res.status(200).json(detail);
  } catch (error) {
    console.error('Get contract v2 error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// F-32: List handovers v2 (join project, customer, contract; paging; audit handover.listed)
app.get('/api/handovers/v2', requireAuth, async (req: Request, res: Response) => {
  try {
    let limit = 20;
    if (req.query.limit !== undefined) {
      const parsedLimit = parseInt(req.query.limit as string, 10);
      if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
        res.status(400).json({ error: 'invalid limit' });
        return;
      }
      limit = parsedLimit;
    }
    let offset = 0;
    if (req.query.offset !== undefined) {
      const parsedOffset = parseInt(req.query.offset as string, 10);
      if (isNaN(parsedOffset) || parsedOffset < 0) {
        res.status(400).json({ error: 'invalid offset' });
        return;
      }
      offset = parsedOffset;
    }
    let statusFilter: string | undefined;
    if (req.query.status !== undefined) {
      if (typeof req.query.status !== 'string') {
        res.status(400).json({ error: 'invalid status' });
        return;
      }
      statusFilter = req.query.status;
    }
    let searchFilter: string | undefined;
    if (req.query.search !== undefined) {
      if (typeof req.query.search !== 'string') {
        res.status(400).json({ error: 'invalid search' });
        return;
      }
      const trimmed = (req.query.search as string).trim();
      if (trimmed.length > 0) searchFilter = trimmed;
    }
    let projectIdFilter: string | undefined;
    if (req.query.project_id !== undefined) {
      if (typeof req.query.project_id !== 'string') {
        res.status(400).json({ error: 'invalid project_id' });
        return;
      }
      projectIdFilter = (req.query.project_id as string).trim();
      if (projectIdFilter.length === 0) projectIdFilter = undefined;
    }
    let contractIdFilter: string | undefined;
    if (req.query.contract_id !== undefined) {
      if (typeof req.query.contract_id !== 'string') {
        res.status(400).json({ error: 'invalid contract_id' });
        return;
      }
      contractIdFilter = (req.query.contract_id as string).trim();
      if (contractIdFilter.length === 0) contractIdFilter = undefined;
    }

    const organizationId = await getDefaultOrganizationId();
    const filters =
      statusFilter !== undefined ||
      searchFilter !== undefined ||
      projectIdFilter !== undefined ||
      contractIdFilter !== undefined
        ? {
            status: statusFilter,
            search: searchFilter,
            project_id: projectIdFilter,
            contract_id: contractIdFilter,
          }
        : undefined;
    const result = await listHandoversV2(organizationId, limit, offset, filters);

    await auditLogWrite({
      organization_id: organizationId,
      actor: req.user!.email,
      action: 'handover.listed',
      entity_type: 'handover',
      metadata: {
        limit: result.paging.limit,
        offset: result.paging.offset,
        status_present: statusFilter !== undefined,
        search_present: searchFilter !== undefined && (searchFilter?.length ?? 0) > 0,
        project_id_present: projectIdFilter !== undefined,
        contract_id_present: contractIdFilter !== undefined,
      },
    });

    res.status(200).json(result);
  } catch (error) {
    console.error('List handovers v2 error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Handovers (F-28): create, list, get, PATCH (DRAFT only), sign, complete
app.post('/api/projects/:projectId/handovers', requireAuth, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    if (!isValidProjectId(projectId)) {
      res.status(400).json({ error: 'invalid project id' });
      return;
    }
    const body = req.body as { contract_id?: unknown; acceptance_json?: unknown };
    const organizationId = await getDefaultOrganizationId();
    const result = await createHandover(organizationId, projectId, {
      contract_id: typeof body?.contract_id === 'string' ? body.contract_id : undefined,
      acceptance_json: body?.acceptance_json,
    });

    if (result.kind === 'project_not_found') {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    if (result.kind === 'no_contract') {
      res.status(422).json({ error: 'Project must have at least one contract in HANDOVER or COMPLETED' });
      return;
    }
    if (result.kind === 'validation_failed') {
      res.status(422).json({ error: 'HANDOVER_VALIDATION_FAILED', missing_fields: result.missing_fields });
      return;
    }

    await auditLogWrite({
      organization_id: organizationId,
      actor: req.user!.email,
      action: 'handover.created',
      entity_type: 'handover',
      entity_id: result.handover.id,
      metadata: { project_id: projectId, handover_id: result.handover.id },
    });

    res.status(201).json({ value: result.handover });
  } catch (error) {
    console.error('Create handover error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/projects/:projectId/handovers', requireAuth, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    if (!isValidProjectId(projectId)) {
      res.status(400).json({ error: 'invalid project id' });
      return;
    }
    const organizationId = await getDefaultOrganizationId();
    const list = await listHandoversByProject(organizationId, projectId);
    res.status(200).json({ value: list });
  } catch (error) {
    console.error('List handovers error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/projects/:projectId/handovers/:handoverId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { projectId, handoverId } = req.params;
    if (!isValidProjectId(projectId) || !isValidHandoverId(handoverId)) {
      res.status(400).json({ error: 'invalid project id or handover id' });
      return;
    }
    const organizationId = await getDefaultOrganizationId();
    const handover = await getHandoverByIdOrg(organizationId, projectId, handoverId);
    if (!handover) {
      res.status(404).json({ error: 'Handover not found' });
      return;
    }
    res.status(200).json({ value: handover });
  } catch (error) {
    console.error('Get handover error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.patch('/api/projects/:projectId/handovers/:handoverId', requireAuth, async (req: Request, res: Response) => {
  try {
    const { projectId, handoverId } = req.params;
    if (!isValidProjectId(projectId) || !isValidHandoverId(handoverId)) {
      res.status(400).json({ error: 'invalid project id or handover id' });
      return;
    }
    const body = req.body as { acceptance_json?: unknown };
    const organizationId = await getDefaultOrganizationId();
    const result = await updateHandover(organizationId, projectId, handoverId, body);

    if (result.kind === 'not_found') {
      res.status(404).json({ error: 'Handover not found' });
      return;
    }
    if (result.kind === 'immutable') {
      res.status(422).json({ error: 'Handover is immutable after SIGNED/COMPLETED' });
      return;
    }
    if (result.kind === 'validation_failed') {
      res.status(422).json({ error: 'HANDOVER_VALIDATION_FAILED', missing_fields: result.missing_fields });
      return;
    }

    await auditLogWrite({
      organization_id: organizationId,
      actor: req.user!.email,
      action: 'handover.updated',
      entity_type: 'handover',
      entity_id: result.handover.id,
      metadata: { project_id: projectId, handover_id: result.handover.id },
    });

    res.status(200).json({ value: result.handover });
  } catch (error) {
    console.error('Update handover error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/projects/:projectId/handovers/:handoverId/sign', requireAuth, async (req: Request, res: Response) => {
  try {
    const { projectId, handoverId } = req.params;
    if (!isValidProjectId(projectId) || !isValidHandoverId(handoverId)) {
      res.status(400).json({ error: 'invalid project id or handover id' });
      return;
    }
    const organizationId = await getDefaultOrganizationId();
    const result = await signHandover(organizationId, projectId, handoverId, req.user!.email);

    if (result.kind === 'not_found') {
      res.status(404).json({ error: 'Handover not found' });
      return;
    }
    if (result.kind === 'invalid_state') {
      res.status(422).json({ error: 'Invalid state for sign', status: result.status });
      return;
    }

    await auditLogWrite({
      organization_id: organizationId,
      actor: req.user!.email,
      action: 'handover.signed',
      entity_type: 'handover',
      entity_id: result.handover.id,
      metadata: { project_id: projectId, handover_id: result.handover.id },
    });

    res.status(200).json({ value: result.handover });
  } catch (error) {
    console.error('Sign handover error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/projects/:projectId/handovers/:handoverId/complete', requireAuth, async (req: Request, res: Response) => {
  try {
    const { projectId, handoverId } = req.params;
    if (!isValidProjectId(projectId) || !isValidHandoverId(handoverId)) {
      res.status(400).json({ error: 'invalid project id or handover id' });
      return;
    }
    const organizationId = await getDefaultOrganizationId();
    const result = await completeHandover(organizationId, projectId, handoverId, req.user!.email);

    if (result.kind === 'not_found') {
      res.status(404).json({ error: 'Handover not found' });
      return;
    }
    if (result.kind === 'invalid_state') {
      res.status(422).json({ error: 'Invalid state for complete', status: result.status });
      return;
    }

    await auditLogWrite({
      organization_id: organizationId,
      actor: req.user!.email,
      action: 'handover.completed',
      entity_type: 'handover',
      entity_id: result.handover.id,
      metadata: { project_id: projectId, handover_id: result.handover.id },
    });

    res.status(200).json({ value: result.handover });
  } catch (error) {
    console.error('Complete handover error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/projects', requireAuth, async (req: Request, res: Response) => {
  try {
    let limit = 20;
    if (req.query.limit !== undefined) {
      const parsedLimit = parseInt(req.query.limit as string, 10);
      if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
        res.status(400).json({ error: 'invalid query' });
        return;
      }
      limit = parsedLimit;
    }

    let offset = 0;
    if (req.query.offset !== undefined) {
      const parsedOffset = parseInt(req.query.offset as string, 10);
      if (isNaN(parsedOffset) || parsedOffset < 0) {
        res.status(400).json({ error: 'invalid query' });
        return;
      }
      offset = parsedOffset;
    }

    const organizationId = await getDefaultOrganizationId();
    const items = await listProjectsV2(organizationId, limit, offset);

    await auditLogWrite({
      organization_id: organizationId,
      actor: req.user!.email,
      action: 'project.list',
      entity_type: 'project',
      metadata: { limit, offset, result_count: items.length },
    });

    res.status(200).json({ value: items });
  } catch (error) {
    console.error('List projects error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.delete('/api/projects/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!isValidProjectId(id)) {
      res.status(400).json({ error: 'invalid id' });
      return;
    }
    const organizationId = await getDefaultOrganizationId();
    const result = await deleteProject(organizationId, id);

    if (!result) {
      await auditLogWrite({
        organization_id: organizationId,
        actor: req.user!.email,
        action: 'project.delete.not_found',
        entity_type: 'project',
        metadata: { project_id: id },
      });
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    await auditLogWrite({
      organization_id: organizationId,
      actor: req.user!.email,
      action: 'project.delete',
      entity_type: 'project',
      entity_id: result.id,
      metadata: { project_id: id },
    });

    res.status(200).json({ value: { id: result.id } });
  } catch (error) {
    console.error('Delete project error:', error);
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
    const body = req.body as Record<string, unknown> | undefined;
    const organizationId = await getDefaultOrganizationId();

    // F-25: create quote v1 from project_id
    if (body && body.project_id !== undefined) {
      const project_id = body.project_id;
      const title = body.title;
      if (typeof project_id !== 'string' || !isValidProjectId(project_id)) {
        res.status(400).json({ error: 'invalid payload' });
        return;
      }
      if (title !== undefined && typeof title !== 'string') {
        res.status(400).json({ error: 'invalid payload' });
        return;
      }

      const result = await createQuoteFromProject(organizationId, { project_id, title });

      if (result.kind === 'project_not_found') {
        await auditLogWrite({
          organization_id: organizationId,
          actor: req.user!.email,
          action: 'quote.create.project_not_found',
          entity_type: 'quote',
          metadata: { project_id },
        });
        res.status(404).json({ error: 'Project not found' });
        return;
      }
      if (result.kind === 'project_missing_customer') {
        res.status(409).json({ error: 'Project missing customer_id' });
        return;
      }
      if (result.kind === 'customer_not_found') {
        res.status(404).json({
          error: 'Customer not found',
          customer_id: result.customer_id,
          project_id: result.project_id,
        });
        return;
      }

      await auditLogWrite({
        organization_id: organizationId,
        actor: req.user!.email,
        action: 'quote.create',
        entity_type: 'quote',
        entity_id: result.quote.id,
        metadata: { quote_id: result.quote.id, project_id: result.quote.project_id },
      });
      res.status(201).json({ value: result.quote });
      return;
    }

    // Existing: create quote from customer_id
    const { customer_id, payload } = body ?? {};
    if (!customer_id) {
      res.status(400).json({ error: 'customer_id required' });
      return;
    }

    const quote = await createQuoteDraft(
      { customer_id: customer_id as string, payload: payload as Record<string, unknown> | undefined },
      req.user!,
      organizationId
    );
    res.status(201).json(quote);
  } catch (error) {
    console.error('Create quote error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// F-30: List quotes v2 (join customer, paging, audit quote.listed)
app.get('/api/quotes/v2', requireAuth, async (req: Request, res: Response) => {
  try {
    let limit = 20;
    if (req.query.limit !== undefined) {
      const parsedLimit = parseInt(req.query.limit as string, 10);
      if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
        res.status(400).json({ error: 'invalid limit' });
        return;
      }
      limit = parsedLimit;
    }
    let offset = 0;
    if (req.query.offset !== undefined) {
      const parsedOffset = parseInt(req.query.offset as string, 10);
      if (isNaN(parsedOffset) || parsedOffset < 0) {
        res.status(400).json({ error: 'invalid offset' });
        return;
      }
      offset = parsedOffset;
    }
    let statusFilter: string | undefined;
    if (req.query.status !== undefined) {
      if (typeof req.query.status !== 'string') {
        res.status(400).json({ error: 'invalid status' });
        return;
      }
      statusFilter = req.query.status;
    }
    let searchFilter: string | undefined;
    if (req.query.search !== undefined) {
      if (typeof req.query.search !== 'string') {
        res.status(400).json({ error: 'invalid search' });
        return;
      }
      const trimmed = req.query.search.trim();
      if (trimmed.length > 0) searchFilter = trimmed;
    }

    const organizationId = await getDefaultOrganizationId();
    const filters =
      statusFilter !== undefined || searchFilter !== undefined
        ? { status: statusFilter, search: searchFilter }
        : undefined;
    const result = await listQuotesV2(organizationId, limit, offset, filters);

    await auditLogWrite({
      organization_id: organizationId,
      actor: req.user!.email,
      action: 'quote.listed',
      entity_type: 'quote',
      metadata: {
        limit: result.paging.limit,
        offset: result.paging.offset,
        ...(statusFilter !== undefined && { status: statusFilter }),
        search_present: searchFilter !== undefined && searchFilter.length > 0,
      },
    });

    res.status(200).json(result);
  } catch (error) {
    console.error('List quotes v2 error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// F-34: Quote detail v2 (customer, project, contract, handover joins; audit quote.viewed)
app.get('/api/quotes/:id/v2', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!isValidQuoteId(id)) {
      res.status(400).json({ error: 'invalid id' });
      return;
    }
    const organizationId = await getDefaultOrganizationId();
    const result = await getQuoteDetailV2(id, organizationId);

    if (!result) {
      res.status(404).json({ error: 'Quote not found' });
      return;
    }

    await auditLogWrite({
      organization_id: organizationId,
      actor: req.user!.email,
      action: 'quote.viewed',
      entity_type: 'quote',
      entity_id: result.quote.id,
      metadata: {
        has_project: result.has_project,
        has_contract: result.has_contract,
        has_handover: result.has_handover,
      },
    });

    res.status(200).json(result.quote);
  } catch (error) {
    console.error('Get quote v2 error:', error);
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
    const quote = await getQuoteDetailV3(id, organizationId);

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
      metadata: { quote_id: quote.id },
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

// TEMP ROUTE DUMP (remove before final commit)
const routerStack = (app as unknown as { _router?: { stack: unknown[] } })._router?.stack ?? [];
const routeStrings = (routerStack as { route?: { path: string; methods: Record<string, boolean> } }[])
  .filter((r) => r.route)
  .map((r) => `${Object.keys(r.route!.methods).join(',')} ${r.route!.path}`);
console.log('[routes]', routeStrings);

export default app;
