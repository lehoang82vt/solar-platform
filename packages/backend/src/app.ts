import express, { Express, Request, Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { config } from './config/env';
import { isDatabaseConnected, getDatabasePool } from './config/database';
import { version } from '../../shared/src';
import { calculateLiteAnalysis } from '../../shared/src/utils/lite-analysis';
import { loginUser } from './services/users';
import { requireAuth, requireAdmin } from './middleware/auth';
import { requestLogger } from './middleware/request-logger';
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
  createProjectFromLead,
  listProjectsLead,
  updateProjectStatus,
} from './services/projects-lead';
import { getPVRecommendations } from './services/recommendations-pv';
import { getBatteryRecommendations } from './services/recommendations-battery';
import { getInverterRecommendations } from './services/recommendations-inverter';
import { configureSystem, getSystemConfig } from './services/system-config';
import {
  adjustPanelCount,
  adjustBattery,
  adjustInverter,
  adjustAccessories,
  adjustComboBox,
} from './services/system-adjustments';
import {
  createQuickQuote,
  transitionDemoToReal,
} from './services/quick-quote';
import {
  getFinancialConfig,
  updateFinancialConfig,
  validateFinancialConfig,
} from './services/financial-config';
import { updateProjectUsage } from './services/usage';
import { addRoof, listRoofs, updateRoof, deleteRoof } from './services/roofs';
import { fetchPVGIS } from './services/pvgis';
import {
  createCustomer,
  deleteCustomer,
  getCustomerByIdOrgSafe,
  isValidCustomerId,
  listCustomers,
  updateCustomer,
} from './services/customers';
import { createQuote } from './services/quote-create';
import { updateQuote, getQuote } from './services/quote-update';
import { submitQuote, canSubmitQuote } from './services/quote-submit';
import {
  approveQuote,
  rejectQuote,
  getPendingQuotes,
  getQuoteStatus,
  isQuoteFrozen,
} from './services/quote-approval';
import {
  createQuoteRevision,
  validateModifiable,
} from './services/quote-revision';
import { generateQuotePDF } from './services/quote-pdf';
import {
  createQuoteDraft,
  createQuoteFromProject,
  deleteQuote,
  getQuoteDetailV2,
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
import { createContractFromQuote } from './services/contract-create';
import {
  createInstallationHandover,
  cancelHandover as cancelHandoverCon05,
} from './services/handover';
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
import {
  getPipelineMetrics,
  getPnLSummary,
  getCashflowProjection,
  refreshMaterializedViews,
  getBIOverview,
  getProfitLoss,
  getSalesRankingV2,
  getPartnerStats,
  getCashflow,
} from './services/bi';
import { write as auditLogWrite, getDefaultOrganizationId } from './services/auditLog';
import { getSalesDashboardStats, getRecentLeads } from './services/sales-dashboard';
import { listLeads, getLeadById, updateLeadStatus, createLead } from './services/leads';
import { createOTPChallenge, verifyOTP } from './services/otp';
import { otpPhoneRateLimiter, otpIpRateLimiter } from './middleware/rate-limiter';
import {
  loginPartner,
  getPartnerDashboard,
  getPartnerLeads,
} from './services/partners';
import { requirePartnerAuth } from './middleware/partner-auth';
import {
  listCatalog,
  createCatalogItem,
  updateCatalogItem,
  deleteCatalogItem,
  isValidCatalogType,
} from './services/catalog';
import { importCatalog } from './services/catalog-import';
import { exportCatalog } from './services/catalog-export';
import {
  listNotificationLogs,
  retryFailedNotification,
  toggleTemplate,
  getTemplateList,
} from './services/notification-admin';
import multer from 'multer';

const upload = multer({ storage: multer.memoryStorage() });

const app: Express = express();

// SEC-03: Security headers (helmet + CSP, no-cache)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
    noSniff: true,
    xssFilter: true,
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  })
);
app.use((_req: Request, res: Response, next: () => void) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// SEC-03: CORS whitelist
const corsOptions: cors.CorsOptions = {
  origin: (origin, cb) => {
    const allowed = config.corsAllowedOrigins;
    if (allowed.length === 0) {
      if (config.node_env === 'production') {
        cb(new Error('CORS_ORIGINS must be configured in production'));
        return;
      }
      cb(null, true);
      return;
    }
    if (!origin || allowed.includes(origin)) {
      cb(null, true);
      return;
    }
    cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};
app.use(cors(corsOptions));

app.use(express.json());

// SEC-04: Request/response logging (JSON, PII scrubbed)
app.use(requestLogger);

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

// Internal user login (SRV-01)
app.post('/api/auth/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password required' });
      return;
    }

    const orgId = await getDefaultOrganizationId();
    const result = await loginUser(orgId, email, password);

    if (!result) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    res.status(200).json({
      token: result.token,
      access_token: result.token,
      user: {
        id: result.user.id,
        email: result.user.email,
        full_name: result.user.full_name,
        role: result.user.role,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    if (message.includes('suspended') || message.includes('not active')) {
      res.status(403).json({ error: message });
    } else {
      res.status(500).json({ error: message });
    }
  }
});

// Get current user
app.get('/api/me', requireAuth, (req: Request, res: Response) => {
  res.json(req.user);
});

// Change password
app.post('/api/auth/change-password', requireAuth, async (req: Request, res: Response) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const userId = req.user?.id;

    if (!oldPassword || !newPassword) {
      res.status(400).json({ error: 'Mật khẩu cũ và mật khẩu mới là bắt buộc' });
      return;
    }

    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    if (newPassword.length < 8) {
      res.status(400).json({ error: 'Mật khẩu mới phải có ít nhất 8 ký tự' });
      return;
    }

    const pool = getDatabasePool();
    if (!pool) {
      res.status(500).json({ error: 'Database not connected' });
      return;
    }

    // Verify old password using crypt
    const verifyResult = await pool.query(
      'SELECT (password_hash = crypt($1, password_hash)) AS valid FROM users WHERE id = $2',
      [oldPassword, userId]
    );

    if (!verifyResult.rows[0]?.valid) {
      res.status(401).json({ error: 'Mật khẩu hiện tại không đúng' });
      return;
    }

    // Update password with new hash
    await pool.query(
      'UPDATE users SET password_hash = crypt($1, gen_salt($2)) WHERE id = $3',
      [newPassword, 'bf', userId]
    );

    res.status(200).json({ message: 'Đổi mật khẩu thành công' });
  } catch (error: unknown) {
    console.error('Change password error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    res.status(500).json({ error: message });
  }
});

// Sales dashboard (Day 82)
app.get('/api/sales/dashboard', requireAuth, async (_req: Request, res: Response) => {
  try {
    const organizationId = await getDefaultOrganizationId();
    const [stats, recentLeads] = await Promise.all([
      getSalesDashboardStats(organizationId),
      getRecentLeads(organizationId, 5),
    ]);
    res.status(200).json({
      ...stats,
      recent_leads: recentLeads,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error';
    res.status(500).json({ error: message });
  }
});

// Sales leads (Day 83)
app.get('/api/sales/leads', requireAuth, async (req: Request, res: Response) => {
  try {
    const organizationId = await getDefaultOrganizationId();
    const status = req.query.status as string | undefined;
    const leads = await listLeads(organizationId, status ? { status } : undefined);
    res.status(200).json({ leads });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error';
    res.status(500).json({ error: message });
  }
});

app.get('/api/sales/leads/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const organizationId = await getDefaultOrganizationId();
    const lead = await getLeadById(organizationId, id);
    if (!lead) {
      res.status(404).json({ error: 'Lead not found' });
      return;
    }
    res.status(200).json(lead);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error';
    res.status(500).json({ error: message });
  }
});

app.patch('/api/sales/leads/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!status || typeof status !== 'string') {
      res.status(400).json({ error: 'status is required' });
      return;
    }
    const organizationId = await getDefaultOrganizationId();
    const lead = await updateLeadStatus(organizationId, id, status);
    if (!lead) {
      res.status(404).json({ error: 'Lead not found' });
      return;
    }
    res.status(200).json(lead);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error';
    res.status(500).json({ error: message });
  }
});

app.post('/api/sales/leads', requireAuth, async (req: Request, res: Response) => {
  try {
    const { phone } = req.body;
    if (!phone || typeof phone !== 'string') {
      res.status(400).json({ error: 'phone is required' });
      return;
    }
    const organizationId = await getDefaultOrganizationId();
    const lead = await createLead(organizationId, { phone: phone.trim() });
    res.status(201).json(lead);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error';
    res.status(500).json({ error: message });
  }
});

// Admin-only (for F-03 auth middleware test: wrong_role_returns_403)
app.get('/api/admin-only', requireAuth, requireAdmin, (_req: Request, res: Response) => {
  res.status(200).json({ ok: true });
});

// NTF-04: Admin notification APIs
app.get('/api/admin/notifications/logs', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const orgId = req.user?.organization_id ?? (await getDefaultOrganizationId());
    const filters = {
      status: req.query.status as 'PENDING' | 'SENT' | 'FAILED' | undefined,
      event_type: req.query.event_type as string | undefined,
      from_date: req.query.from_date ? new Date(req.query.from_date as string) : undefined,
      to_date: req.query.to_date ? new Date(req.query.to_date as string) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 50,
      offset: req.query.offset ? parseInt(req.query.offset as string, 10) : 0,
    };
    const logs = await listNotificationLogs(orgId, filters);
    res.json({ logs });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: msg });
  }
});

app.post('/api/admin/notifications/logs/:id/retry', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const orgId = req.user?.organization_id ?? (await getDefaultOrganizationId());
    const result = await retryFailedNotification(orgId, req.params.id);
    res.json(result);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    res.status(400).json({ error: msg });
  }
});

app.get('/api/admin/notifications/templates', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const orgId = req.user?.organization_id ?? (await getDefaultOrganizationId());
    const templates = await getTemplateList(orgId);
    res.json({ templates });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: msg });
  }
});

app.patch('/api/admin/notifications/templates/:id', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const orgId = req.user?.organization_id ?? (await getDefaultOrganizationId());
    const { active } = req.body;
    if (typeof active !== 'boolean') {
      res.status(400).json({ error: 'active must be boolean' });
      return;
    }
    await toggleTemplate(orgId, req.params.id, active);
    res.json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    res.status(400).json({ error: msg });
  }
});

// FIN-01: Financial config (admin only)
app.get('/api/financial/config', requireAuth, requireAdmin, async (_req: Request, res: Response) => {
  try {
    const orgId = await getDefaultOrganizationId();
    const config = await getFinancialConfig(orgId);
    res.status(200).json(config);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: msg });
  }
});

app.put('/api/financial/config', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const orgId = await getDefaultOrganizationId();
    const errors = validateFinancialConfig(req.body);
    if (errors.length > 0) {
      res.status(400).json({ errors });
      return;
    }
    const config = await updateFinancialConfig(orgId, req.body);
    res.status(200).json(config);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    res.status(400).json({ error: msg });
  }
});

// Catalog CRUD (CAT-03) – Admin only
app.get('/api/catalog/:type', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { type } = req.params;
    if (!isValidCatalogType(type)) {
      res.status(400).json({ error: 'Invalid catalog type' });
      return;
    }
    const readyOnly = req.query.ready === 'true';
    const organizationId = await getDefaultOrganizationId();
    const items = await listCatalog(organizationId, type, readyOnly);
    res.status(200).json({ items });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    res.status(500).json({ error: message });
  }
});

// Catalog Excel export (CAT-04 Part 2) – Admin only
app.get(
  '/api/catalog/:type/export',
  requireAuth,
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const { type } = req.params;
      if (!isValidCatalogType(type)) {
        res.status(400).json({ error: 'Invalid catalog type' });
        return;
      }
      const organizationId = await getDefaultOrganizationId();
      const buffer = await exportCatalog(organizationId, type);
      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader(
        'Content-Disposition',
        `attachment; filename=catalog_${type}_${Date.now()}.xlsx`
      );
      res.send(buffer);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      res.status(500).json({ error: message });
    }
  }
);

app.post('/api/catalog/:type', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { type } = req.params;
    if (!isValidCatalogType(type)) {
      res.status(400).json({ error: 'Invalid catalog type' });
      return;
    }
    const organizationId = await getDefaultOrganizationId();
    const item = await createCatalogItem(organizationId, type, req.body);
    res.status(201).json(item);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    res.status(500).json({ error: message });
  }
});

app.put('/api/catalog/:type/:id', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { type, id } = req.params;
    if (!isValidCatalogType(type)) {
      res.status(400).json({ error: 'Invalid catalog type' });
      return;
    }
    const organizationId = await getDefaultOrganizationId();
    const item = await updateCatalogItem(organizationId, type, id, req.body);
    res.status(200).json(item);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    if (message === 'Item not found') {
      res.status(404).json({ error: message });
      return;
    }
    res.status(500).json({ error: message });
  }
});

app.delete(
  '/api/catalog/:type/:id',
  requireAuth,
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const { type, id } = req.params;
      if (!isValidCatalogType(type)) {
        res.status(400).json({ error: 'Invalid catalog type' });
        return;
      }
      const organizationId = await getDefaultOrganizationId();
      await deleteCatalogItem(organizationId, type, id);
      res.status(204).send();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      if (message === 'Item not found') {
        res.status(404).json({ error: message });
        return;
      }
      res.status(500).json({ error: message });
    }
  }
);

// Catalog Excel import (CAT-04) – Admin only
app.post(
  '/api/catalog/:type/import',
  requireAuth,
  requireAdmin,
  upload.single('file'),
  async (req: Request, res: Response) => {
    try {
      const { type } = req.params;
      if (!isValidCatalogType(type)) {
        res.status(400).json({ error: 'Invalid catalog type' });
        return;
      }
      if (!req.file) {
        res.status(400).json({ error: 'No file uploaded' });
        return;
      }
      const organizationId = await getDefaultOrganizationId();
      const result = await importCatalog(organizationId, type, req.file.buffer);
      res.status(200).json(result);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      res.status(500).json({ error: message });
    }
  }
);

// Public lite analysis (PUB-01)
app.post('/api/public/lite-analysis', async (req: Request, res: Response) => {
  try {
    const { monthly_bill_vnd, region } = req.body;
    const result = calculateLiteAnalysis({
      monthly_bill_vnd: Number(monthly_bill_vnd),
      region: String(region).toUpperCase() as 'NORTH' | 'SOUTH' | 'CENTRAL',
    });
    res.status(200).json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Bad request';
    res.status(400).json({ error: message });
  }
});

// OTP request (PUB-03)
app.post(
  '/api/public/otp/request',
  otpPhoneRateLimiter(),
  otpIpRateLimiter(),
  async (req: Request, res: Response) => {
    try {
      const { phone } = req.body;
      const organizationId = await getDefaultOrganizationId();
      const result = await createOTPChallenge(organizationId, phone);
      // Note: In development, check database directly for OTP codes
      // SELECT otp FROM otp_challenges WHERE phone = '+84...' ORDER BY created_at DESC LIMIT 1;
      res.status(200).json({
        challenge_id: result.challenge_id,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Internal error';
      res.status(500).json({ error: message });
    }
  }
);

// OTP verify (PUB-03)
app.post('/api/public/otp/verify', async (req: Request, res: Response) => {
  try {
    const { phone, otp, partner_code: partnerCode } = req.body;
    const organizationId = await getDefaultOrganizationId();
    const result = await verifyOTP(organizationId, phone, otp, partnerCode);
    if (result.success) {
      res.status(200).json({
        verified: true,
        session_token: result.session_token,
        lead_id: result.lead_id,
      });
    } else {
      res.status(400).json({
        verified: false,
        message: result.message,
      });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal error';
    res.status(500).json({ error: message });
  }
});

// Partner login (PTN-01)
app.post('/api/partner/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    const organizationId = await getDefaultOrganizationId();
    const result = await loginPartner(organizationId, { email, password });
    if (!result) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }
    res.status(200).json({
      token: result.token,
      partner: {
        id: result.partner.id,
        email: result.partner.email,
        name: result.partner.name,
        referral_code: result.partner.referral_code,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    if (message.includes('not active')) {
      res.status(403).json({ error: message });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// Partner dashboard (PTN-02)
app.get('/api/partner/dashboard', requirePartnerAuth, async (req: Request, res: Response) => {
  try {
    if (!req.partner) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const dashboard = await getPartnerDashboard(
      req.partner.organization_id,
      req.partner.referral_code
    );
    res.status(200).json(dashboard);
  } catch (err: unknown) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Partner lead list (PTN-03)
app.get('/api/partner/leads', requirePartnerAuth, async (req: Request, res: Response) => {
  try {
    if (!req.partner) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const limit = req.query.limit != null ? parseInt(String(req.query.limit), 10) : undefined;
    const offset = req.query.offset != null ? parseInt(String(req.query.offset), 10) : undefined;
    const result = await getPartnerLeads(req.partner.organization_id, req.partner.referral_code, {
      limit,
      offset,
    });
    res.status(200).json(result);
  } catch (err: unknown) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// SRV-02: Project from lead + state machine
app.post('/api/projects/from-lead', requireAuth, async (req: Request, res: Response) => {
  try {
    const { lead_id, assigned_to } = req.body;
    if (!lead_id) {
      res.status(400).json({ error: 'lead_id required' });
      return;
    }
    const organizationId = await getDefaultOrganizationId();
    const project = await createProjectFromLead(organizationId, lead_id, assigned_to);
    res.status(201).json(project);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Bad request';
    res.status(400).json({ error: message });
  }
});

// UX-01: Quick quote (DEMO, public, no auth)
app.post('/api/projects/quick-quote', async (req: Request, res: Response) => {
  try {
    const orgId = await getDefaultOrganizationId();
    const result = await createQuickQuote(orgId, req.body);
    res.status(201).json(result);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    res.status(400).json({ error: msg });
  }
});

// Public PDF endpoint for demo quotes (no auth required)
app.get('/api/quotes/:id/pdf/public', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!isValidQuoteId(id)) {
      res.status(400).json({ error: 'invalid id' });
      return;
    }
    const orgId = await getDefaultOrganizationId();
    const pdfBuffer = await generateQuotePDF(orgId, id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="quote-${id}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (error: unknown) {
    const err = error as Error;
    if (err.message?.includes('not found')) {
      res.status(404).json({ error: err.message });
    } else if (err.message?.includes('approved')) {
      res.status(400).json({ error: err.message });
    } else {
      res.status(500).json({ error: err.message ?? 'Internal server error' });
    }
  }
});

app.get('/api/projects/lead', requireAuth, async (req: Request, res: Response) => {
  try {
    const organizationId = await getDefaultOrganizationId();
    const assignedTo = req.query.assigned_to as string | undefined;
    const projects = await listProjectsLead(organizationId, { assigned_to: assignedTo });
    res.status(200).json({ projects });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    res.status(500).json({ error: message });
  }
});

app.patch('/api/projects/:id/status', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!status || typeof status !== 'string') {
      res.status(400).json({ error: 'status required' });
      return;
    }
    const organizationId = await getDefaultOrganizationId();
    const project = await updateProjectStatus(organizationId, id, status);
    res.status(200).json(project);
  } catch (error: unknown) {
    const err = error as Error & { name?: string };
    const message = err instanceof Error ? err.message : 'Bad request';
    if (err.name === 'StateMachineError') {
      res.status(400).json({ error: message });
      return;
    }
    if (message === 'Project not found') {
      res.status(404).json({ error: message });
      return;
    }
    res.status(400).json({ error: message });
  }
});

// SRV-03: Project usage (server calculates night_kwh, storage_target_kwh)
app.put('/api/projects/:id/usage', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { monthly_kwh, day_usage_pct } = req.body;

    if (req.body && (req.body.night_kwh !== undefined || req.body.storage_target_kwh !== undefined)) {
      res.status(400).json({
        error: 'Cannot set night_kwh or storage_target_kwh directly',
      });
      return;
    }

    if (
      monthly_kwh === undefined ||
      monthly_kwh === null ||
      day_usage_pct === undefined ||
      day_usage_pct === null
    ) {
      res.status(400).json({ error: 'monthly_kwh and day_usage_pct required' });
      return;
    }

    const organizationId = await getDefaultOrganizationId();
    const project = await updateProjectUsage(organizationId, id, {
      monthly_kwh: Number(monthly_kwh),
      day_usage_pct: Number(day_usage_pct),
    });
    res.status(200).json(project);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Bad request';
    if (message === 'Project not found') {
      res.status(404).json({ error: message });
      return;
    }
    res.status(400).json({ error: message });
  }
});

// SRV-04: Project roofs (multi-roof survey)
app.post('/api/projects/:projectId/roofs', requireAuth, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const organizationId = await getDefaultOrganizationId();
    const roof = await addRoof(organizationId, projectId, req.body);
    res.status(201).json(roof);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Bad request';
    if (message === 'Project not found') {
      res.status(404).json({ error: message });
      return;
    }
    res.status(400).json({ error: message });
  }
});

app.get('/api/projects/:projectId/roofs', requireAuth, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    const organizationId = await getDefaultOrganizationId();
    const roofs = await listRoofs(organizationId, projectId);
    res.status(200).json({ roofs });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    res.status(500).json({ error: message });
  }
});

app.put(
  '/api/projects/:projectId/roofs/:roofId',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { roofId } = req.params;
      const organizationId = await getDefaultOrganizationId();
      const roof = await updateRoof(organizationId, roofId, req.body);
      res.status(200).json(roof);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Bad request';
      if (message === 'Roof not found') {
        res.status(404).json({ error: message });
        return;
      }
      res.status(400).json({ error: message });
    }
  }
);

app.delete(
  '/api/projects/:projectId/roofs/:roofId',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { roofId } = req.params;
      const organizationId = await getDefaultOrganizationId();
      await deleteRoof(organizationId, roofId);
      res.status(204).send();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Bad request';
      if (message === 'Roof not found') {
        res.status(404).json({ error: message });
        return;
      }
      res.status(400).json({ error: message });
    }
  }
);

// SRV-05: Fetch PVGIS data for roof (mock mode)
app.post(
  '/api/projects/:projectId/roofs/:roofId/pvgis',
  requireAuth,
  async (req: Request, res: Response) => {
    try {
      const { projectId, roofId } = req.params;
      const organizationId = await getDefaultOrganizationId();
      const result = await fetchPVGIS(organizationId, projectId, roofId);
      res.status(200).json(result);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Internal server error';
      if (message.includes('not found')) {
        res.status(404).json({ error: message });
        return;
      }
      if (message.includes('location') || message.includes('address')) {
        res.status(400).json({ error: message });
        return;
      }
      res.status(500).json({ error: message });
    }
  }
);

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

app.get('/api/projects/:id/recommend/pv', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!isValidProjectId(id)) {
      res.status(400).json({ error: 'invalid id' });
      return;
    }
    const orgId = await getDefaultOrganizationId();
    const recommendations = await getPVRecommendations(orgId, id);
    res.status(200).json({ recommendations });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('not found')) {
      res.status(404).json({ error: msg });
    } else {
      res.status(500).json({ error: msg });
    }
  }
});

app.get('/api/projects/:id/recommend/battery', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!isValidProjectId(id)) {
      res.status(400).json({ error: 'invalid id' });
      return;
    }
    const orgId = await getDefaultOrganizationId();
    const recommendations = await getBatteryRecommendations(orgId, id);
    res.status(200).json({ recommendations });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('not found')) {
      res.status(404).json({ error: msg });
    } else {
      res.status(500).json({ error: msg });
    }
  }
});

app.get('/api/projects/:id/recommend/inverter', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { pv_module_id, panel_count, battery_id } = req.query;

    if (!pv_module_id || !panel_count) {
      res.status(400).json({ error: 'pv_module_id and panel_count required' });
      return;
    }

    const panelCount = parseInt(String(panel_count), 10);
    if (!Number.isInteger(panelCount) || panelCount < 1) {
      res.status(400).json({ error: 'panel_count must be a positive integer' });
      return;
    }

    if (!isValidProjectId(id)) {
      res.status(400).json({ error: 'invalid id' });
      return;
    }

    const orgId = await getDefaultOrganizationId();
    const recommendations = await getInverterRecommendations(
      orgId,
      id,
      String(pv_module_id),
      panelCount,
      battery_id ? String(battery_id) : undefined
    );
    res.status(200).json({ recommendations });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('not found')) {
      res.status(404).json({ error: msg });
    } else {
      res.status(500).json({ error: msg });
    }
  }
});

app.post('/api/projects/:id/system/configure', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!isValidProjectId(id)) {
      res.status(400).json({ error: 'invalid id' });
      return;
    }
    const orgId = await getDefaultOrganizationId();
    const config = await configureSystem(orgId, id, req.body);
    res.status(200).json(config);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes('not found')) {
      res.status(404).json({ error: msg });
    } else {
      res.status(400).json({ error: msg });
    }
  }
});

app.get('/api/projects/:id/system/config', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!isValidProjectId(id)) {
      res.status(400).json({ error: 'invalid id' });
      return;
    }
    const orgId = await getDefaultOrganizationId();
    const config = await getSystemConfig(orgId, id);
    if (!config) {
      res.status(404).json({ error: 'Config not found' });
      return;
    }
    res.status(200).json(config);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: msg });
  }
});

app.post('/api/projects/:id/transition-to-real', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!isValidProjectId(id)) {
      res.status(400).json({ error: 'invalid id' });
      return;
    }
    const orgId = await getDefaultOrganizationId();
    await transitionDemoToReal(orgId, id);
    res.status(200).json({ success: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    res.status(400).json({ error: msg });
  }
});

app.put('/api/projects/:id/system/adjust/panels', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!isValidProjectId(id)) {
      res.status(400).json({ error: 'invalid id' });
      return;
    }
    const { panel_count } = req.body;
    const orgId = await getDefaultOrganizationId();
    const config = await adjustPanelCount(orgId, id, panel_count);
    res.status(200).json(config);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    res.status(400).json({ error: msg });
  }
});

app.put('/api/projects/:id/system/adjust/battery', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!isValidProjectId(id)) {
      res.status(400).json({ error: 'invalid id' });
      return;
    }
    const { battery_id, battery_count } = req.body;
    const orgId = await getDefaultOrganizationId();
    const config = await adjustBattery(orgId, id, battery_id ?? null, battery_count);
    res.status(200).json(config);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    res.status(400).json({ error: msg });
  }
});

app.put('/api/projects/:id/system/adjust/inverter', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!isValidProjectId(id)) {
      res.status(400).json({ error: 'invalid id' });
      return;
    }
    const { inverter_id, inverter_count } = req.body;
    const orgId = await getDefaultOrganizationId();
    const config = await adjustInverter(
      orgId,
      id,
      inverter_id,
      inverter_count !== undefined ? Number(inverter_count) : 1
    );
    res.status(200).json(config);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    res.status(400).json({ error: msg });
  }
});

app.put('/api/projects/:id/system/adjust/accessories', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!isValidProjectId(id)) {
      res.status(400).json({ error: 'invalid id' });
      return;
    }
    const { accessories } = req.body;
    const orgId = await getDefaultOrganizationId();
    const config = await adjustAccessories(orgId, id, Array.isArray(accessories) ? accessories : []);
    res.status(200).json(config);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    res.status(400).json({ error: msg });
  }
});

app.put('/api/projects/:id/system/adjust/combo', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!isValidProjectId(id)) {
      res.status(400).json({ error: 'invalid id' });
      return;
    }
    const { combo_box_id } = req.body;
    const orgId = await getDefaultOrganizationId();
    const config = await adjustComboBox(orgId, id, combo_box_id ?? null);
    res.status(200).json(config);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    res.status(400).json({ error: msg });
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

// Create quote for project (system config, line items, financial snapshot). BLOCK validation prevents creation.
app.post('/api/projects/:projectId/quotes', requireAuth, async (req: Request, res: Response) => {
  try {
    const { projectId } = req.params;
    if (!isValidProjectId(projectId)) {
      res.status(400).json({ error: 'invalid project id' });
      return;
    }
    const orgId = await getProjectOrganizationId(projectId);
    if (!orgId) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const quote = await createQuote(
      orgId,
      { project_id: projectId, ...req.body },
      (req as Request & { user?: { id?: string } }).user?.id
    );

    await auditLogWrite({
      organization_id: orgId,
      actor: req.user!.email,
      action: 'quote.create',
      entity_type: 'quote',
      entity_id: quote.id as string,
      metadata: { quote_id: quote.id, project_id: quote.project_id },
    });
    res.status(201).json(quote);
  } catch (error: unknown) {
    const err = error as Error;
    if (err.message?.includes('BLOCKED')) {
      res.status(400).json({ error: err.message, blocked: true });
    } else if (err.message?.includes('not found')) {
      res.status(404).json({ error: err.message });
    } else {
      res.status(400).json({ error: err.message ?? 'Bad request' });
    }
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

// CON-02: Create contract from approved quote (by quoteId)
app.post('/api/quotes/:quoteId/contracts', requireAuth, async (req: Request, res: Response) => {
  try {
    const { quoteId } = req.params;
    if (!isValidQuoteId(quoteId)) {
      res.status(400).json({ error: 'invalid quote id' });
      return;
    }
    const body = req.body as Record<string, unknown>;
    const organizationId = await getDefaultOrganizationId();
    const result = await createContractFromQuote(organizationId, quoteId, {
      deposit_percentage: typeof body?.deposit_percentage === 'number' ? body.deposit_percentage : undefined,
      expected_start_date: body?.expected_start_date ? new Date(body.expected_start_date as string) : undefined,
      expected_completion_date: body?.expected_completion_date ? new Date(body.expected_completion_date as string) : undefined,
      warranty_years: typeof body?.warranty_years === 'number' ? body.warranty_years : undefined,
      actor: req.user?.email,
    });

    if (result.kind === 'quote_not_found') {
      res.status(404).json({ error: 'Quote not found' });
      return;
    }
    if (result.kind === 'quote_not_accepted') {
      res.status(422).json({ error: 'Quote must be accepted to create contract', status: result.status });
      return;
    }
    if (result.kind === 'quote_project_required') {
      res.status(422).json({ error: 'Quote must have project_id in payload' });
      return;
    }
    if (result.kind === 'quote_price_total_required') {
      res.status(422).json({ error: 'Quote must have price_total set' });
      return;
    }

    res.status(201).json({ value: result.contract });
  } catch (error) {
    console.error('Create contract from quote error:', error);
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

// CON-05: Create installation handover (by contract), completes contract; commission hold 7 days
app.post('/api/contracts/:contractId/handovers', requireAuth, async (req: Request, res: Response) => {
  try {
    const { contractId } = req.params;
    if (!isValidContractId(contractId)) {
      res.status(400).json({ error: 'invalid contract id' });
      return;
    }
    const body = req.body as Record<string, unknown>;
    const handover_date = typeof body?.handover_date === 'string' ? body.handover_date : undefined;
    if (!handover_date) {
      res.status(400).json({ error: 'handover_date required (YYYY-MM-DD)' });
      return;
    }
    const organizationId = await getDefaultOrganizationId();
    const result = await createInstallationHandover(organizationId, contractId, {
      handover_date,
      checklist: body?.checklist as Record<string, unknown> | undefined,
      photos: Array.isArray(body?.photos) ? (body.photos as string[]) : undefined,
      notes: body?.notes != null ? String(body.notes) : undefined,
      performed_by: body?.performed_by != null ? String(body.performed_by) : undefined,
      accepted_by: body?.accepted_by != null ? String(body.accepted_by) : undefined,
    });

    if (result.kind === 'contract_not_found') {
      res.status(404).json({ error: 'Contract not found' });
      return;
    }
    if (result.kind === 'invalid_contract_state') {
      res.status(422).json({ error: 'Contract already completed', status: result.status });
      return;
    }

    res.status(201).json({ value: result.handover });
  } catch (error) {
    console.error('Create installation handover error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// CON-05: Cancel handover (within 7 days blocks commission; after 7 days releases)
app.post('/api/handovers/:handoverId/cancel', requireAuth, async (req: Request, res: Response) => {
  try {
    const { handoverId } = req.params;
    if (!isValidHandoverId(handoverId)) {
      res.status(400).json({ error: 'invalid handover id' });
      return;
    }
    const organizationId = await getDefaultOrganizationId();
    const result = await cancelHandoverCon05(organizationId, handoverId);

    if (result.kind === 'not_found') {
      res.status(404).json({ error: 'Handover not found' });
      return;
    }
    if (result.kind === 'already_cancelled') {
      res.status(422).json({ error: 'Handover already cancelled' });
      return;
    }

    res.status(200).json({ value: result.handover });
  } catch (error) {
    console.error('Cancel handover error:', error);
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

      const result = await createQuoteFromProject(organizationId, {
        project_id,
        title: title as string | undefined
      });

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

app.get('/api/quotes/pending', requireAuth, requireAdmin, async (_req: Request, res: Response) => {
  try {
    const orgId = await getDefaultOrganizationId();
    const quotes = await getPendingQuotes(orgId);
    res.status(200).json({ quotes });
  } catch (error: unknown) {
    const err = error as Error;
    res.status(500).json({ error: err.message ?? 'Internal server error' });
  }
});

app.get('/api/quotes/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!isValidQuoteId(id)) {
      res.status(400).json({ error: 'invalid id' });
      return;
    }
    const orgId = await getDefaultOrganizationId();
    const quote = await getQuote(orgId, id);
    res.status(200).json(quote);
  } catch (error: unknown) {
    const err = error as Error;
    if (err.message?.includes('not found')) {
      res.status(404).json({ error: err.message });
    } else {
      res.status(500).json({ error: err.message ?? 'Internal server error' });
    }
  }
});

app.put('/api/quotes/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!isValidQuoteId(id)) {
      res.status(400).json({ error: 'invalid id' });
      return;
    }
    const orgId = await getDefaultOrganizationId();
    const quoteCheck = await getQuote(orgId, id);
    validateModifiable(quoteCheck.status as string);
    const quote = await updateQuote(orgId, id, req.body);
    res.status(200).json(quote);
  } catch (error: unknown) {
    const err = error as Error;
    if (err.message?.includes('not found')) {
      res.status(404).json({ error: err.message });
    } else if (err.message?.includes('frozen') || err.message?.includes('DRAFT')) {
      res.status(403).json({ error: err.message ?? 'Forbidden', frozen: true });
    } else {
      res.status(400).json({ error: err.message ?? 'Bad request' });
    }
  }
});

app.post('/api/quotes/:id/revise', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!isValidQuoteId(id)) {
      res.status(400).json({ error: 'invalid id' });
      return;
    }
    const orgId = await getDefaultOrganizationId();
    const newQuote = await createQuoteRevision(orgId, id);
    res.status(201).json(newQuote);
  } catch (error: unknown) {
    const err = error as Error;
    if (err.message?.includes('not found')) {
      res.status(404).json({ error: err.message });
    } else if (err.message?.includes('revise')) {
      res.status(400).json({ error: err.message });
    } else {
      res.status(400).json({ error: err.message ?? 'Bad request' });
    }
  }
});

app.post('/api/quotes/:id/submit', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!isValidQuoteId(id)) {
      res.status(400).json({ error: 'invalid id' });
      return;
    }
    const orgId = await getDefaultOrganizationId();
    const quote = await submitQuote(
      orgId,
      id,
      (req as Request & { user?: { id?: string } }).user?.id
    );
    res.status(200).json(quote);
  } catch (error: unknown) {
    const err = error as Error;
    if (err.message?.includes('not found')) {
      res.status(404).json({ error: err.message });
    } else if (err.message?.includes('BLOCK')) {
      res.status(400).json({ error: err.message, blocked: true });
    } else {
      res.status(400).json({ error: err.message ?? 'Bad request' });
    }
  }
});

app.get('/api/quotes/:id/can-submit', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!isValidQuoteId(id)) {
      res.status(400).json({ error: 'invalid id' });
      return;
    }
    const orgId = await getDefaultOrganizationId();
    const result = await canSubmitQuote(orgId, id);
    res.status(200).json(result);
  } catch (error: unknown) {
    const err = error as Error;
    res.status(500).json({ error: err.message ?? 'Internal server error' });
  }
});

app.post('/api/quotes/:id/approve', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!isValidQuoteId(id)) {
      res.status(400).json({ error: 'invalid id' });
      return;
    }
    const orgId = await getDefaultOrganizationId();
    const userId = (req as Request & { user?: { id?: string } }).user?.id ?? 'admin';
    const quote = await approveQuote(orgId, id, userId);
    res.status(200).json(quote);
  } catch (error: unknown) {
    const err = error as Error;
    if (err.message?.includes('not found')) {
      res.status(404).json({ error: err.message });
    } else if (err.message?.includes('PENDING')) {
      res.status(400).json({ error: err.message });
    } else {
      res.status(400).json({ error: err.message ?? 'Bad request' });
    }
  }
});

app.post('/api/quotes/:id/reject', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const body = req.body as { reason?: string };
    const reason = body?.reason ?? '';
    const orgId = await getDefaultOrganizationId();
    const userId = (req as Request & { user?: { id?: string } }).user?.id ?? 'admin';
    const quote = await rejectQuote(orgId, id, userId, reason);
    res.status(200).json(quote);
  } catch (error: unknown) {
    const err = error as Error;
    if (err.message?.includes('not found')) {
      res.status(404).json({ error: err.message });
    } else if (err.message?.includes('required')) {
      res.status(400).json({ error: err.message });
    } else if (err.message?.includes('PENDING')) {
      res.status(400).json({ error: err.message });
    } else {
      res.status(400).json({ error: err.message ?? 'Bad request' });
    }
  }
});

app.get('/api/quotes/:id/frozen', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!isValidQuoteId(id)) {
      res.status(400).json({ error: 'invalid id' });
      return;
    }
    const orgId = await getDefaultOrganizationId();
    const result = await getQuoteStatus(orgId, id);
    const frozen = isQuoteFrozen(result.status);
    res.status(200).json({ frozen, status: result.status });
  } catch (error: unknown) {
    const err = error as Error;
    if (err.message?.includes('not found')) {
      res.status(404).json({ error: err.message });
    } else {
      res.status(500).json({ error: err.message ?? 'Internal server error' });
    }
  }
});

app.get('/api/quotes/:id/pdf', requireAuth, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!isValidQuoteId(id)) {
      res.status(400).json({ error: 'invalid id' });
      return;
    }
    const orgId = await getDefaultOrganizationId();
    const pdfBuffer = await generateQuotePDF(orgId, id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="quote-${id}.pdf"`);
    res.send(pdfBuffer);
  } catch (error: unknown) {
    const err = error as Error;
    if (err.message?.includes('not found')) {
      res.status(404).json({ error: err.message });
    } else if (err.message?.includes('approved')) {
      res.status(400).json({ error: err.message });
    } else {
      res.status(500).json({ error: err.message ?? 'Internal server error' });
    }
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

// BI Dashboard APIs (BI-02) – Admin only
app.get('/api/bi/overview', requireAuth, requireAdmin, async (_req: Request, res: Response) => {
  try {
    const organizationId = await getDefaultOrganizationId();
    const overview = await getBIOverview(organizationId);
    res.status(200).json(overview);
  } catch (error) {
    console.error('Get BI overview error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/bi/pnl', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const yearParam = req.query.year as string | undefined;
    const monthParam = req.query.month as string | undefined;
    if (yearParam !== undefined && monthParam !== undefined) {
      const year = parseInt(yearParam, 10);
      const month = parseInt(monthParam, 10);
      if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
        res.status(400).json({ error: 'year and month required (month 1-12)' });
        return;
      }
      const organizationId = await getDefaultOrganizationId();
      const pnl = await getProfitLoss(organizationId, year, month);
      res.status(200).json(pnl ?? { month: '', revenue_vnd: 0, deposit_vnd: 0, contract_count: 0, cost_vnd: 0, margin_vnd: 0 });
      return;
    }
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;
    if (!from || !to) {
      res.status(400).json({ error: 'from and to query params required, or year and month' });
      return;
    }
    const organizationId = await getDefaultOrganizationId();
    const summary = await getPnLSummary(organizationId, from, to);
    await auditLogWrite({
      organization_id: organizationId,
      actor: req.user!.email,
      action: 'bi.pnl.viewed',
      entity_type: 'bi',
      metadata: { from, to },
    });
    res.status(200).json(summary);
  } catch (error) {
    console.error('Get P&L error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/bi/sales-ranking', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const limitParam = req.query.limit as string | undefined;
    const limit = limitParam ? parseInt(limitParam, 10) : 10;
    const safeLimit = Math.max(1, Math.min(Number.isNaN(limit) ? 10 : limit, 100));
    const organizationId = await getDefaultOrganizationId();
    const ranking = await getSalesRankingV2(organizationId, safeLimit);
    res.status(200).json(ranking);
  } catch (error) {
    console.error('Get sales ranking error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/bi/partner-stats', requireAuth, requireAdmin, async (_req: Request, res: Response) => {
  try {
    const organizationId = await getDefaultOrganizationId();
    const stats = await getPartnerStats(organizationId);
    res.status(200).json(stats);
  } catch (error) {
    console.error('Get partner stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/bi/cashflow', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const fromStr = req.query.from as string | undefined;
    const toStr = req.query.to as string | undefined;
    if (fromStr && toStr) {
      const from = new Date(fromStr);
      const to = new Date(toStr);
      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
        res.status(400).json({ error: 'from and to must be YYYY-MM-DD with from <= to' });
        return;
      }
      const organizationId = await getDefaultOrganizationId();
      const cashflow = await getCashflow(organizationId, from, to);
      res.status(200).json(cashflow);
      return;
    }
    const monthsParam = req.query.months as string | undefined;
    const months = monthsParam ? parseInt(monthsParam, 10) : 6;
    if (isNaN(months) || months < 1 || months > 24) {
      res.status(400).json({ error: 'months must be 1-24, or provide from and to (YYYY-MM-DD)' });
      return;
    }
    const organizationId = await getDefaultOrganizationId();
    const projection = await getCashflowProjection(organizationId, months);
    await auditLogWrite({
      organization_id: organizationId,
      actor: req.user!.email,
      action: 'bi.cashflow.viewed',
      entity_type: 'bi',
      metadata: { months },
    });
    res.status(200).json({ months: projection });
  } catch (error) {
    console.error('Get cashflow error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Legacy BI pipeline (admin only)
app.get('/api/bi/pipeline', requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const organizationId = await getDefaultOrganizationId();
    const metrics = await getPipelineMetrics(organizationId);
    await auditLogWrite({
      organization_id: organizationId,
      actor: req.user!.email,
      action: 'bi.pipeline.viewed',
      entity_type: 'bi',
      metadata: {},
    });
    res.status(200).json(metrics);
  } catch (error) {
    console.error('Get pipeline error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// BI-01: Manual refresh of materialized views (admin only; use CONCURRENTLY in production cron)
app.post('/api/bi/refresh', requireAuth, requireAdmin, async (_req: Request, res: Response) => {
  try {
    const concurrently = (_req.query.concurrently as string) === 'true';
    await refreshMaterializedViews(concurrently);
    res.status(200).json({ ok: true, refreshed: 5 });
  } catch (error) {
    console.error('BI refresh error:', error);
    res.status(500).json({ error: (error as Error).message ?? 'Internal server error' });
  }
});

// SEC-03: CORS rejection returns 403
app.use((err: unknown, _req: Request, res: Response, next: (err?: unknown) => void) => {
  if (err && typeof err === 'object' && 'message' in err && (err as Error).message === 'Not allowed by CORS') {
    res.status(403).json({ error: 'Not allowed by CORS' });
    return;
  }
  next(err);
});

export default app;
