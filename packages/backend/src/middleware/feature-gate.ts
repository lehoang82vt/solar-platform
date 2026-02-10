import { Request, Response, NextFunction } from 'express';

export interface OrgFeatures {
  [key: string]: boolean | number;
}

/** Request with optional user (from auth middleware). Used so this module compiles without importing auth. */
type ReqWithUser = Request & { user?: { organization_id?: string } };

const mockOrgFeatures: Record<string, OrgFeatures> = {};

export function setOrgFeatures(orgId: string, features: OrgFeatures): void {
  mockOrgFeatures[orgId] = features;
}

export function requireFeature(featureName: string) {
  return (req: ReqWithUser, res: Response, next: NextFunction): void => {
    const orgId = req.user?.organization_id;
    if (!orgId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const features = mockOrgFeatures[orgId] || {};
    if (!features[featureName]) {
      res.status(403).json({ error: `Feature ${featureName} not enabled` });
      return;
    }

    next();
  };
}

export function checkUsageLimit(featureName: string, limit: number) {
  return (req: ReqWithUser, res: Response, next: NextFunction): void => {
    const orgId = req.user?.organization_id;
    if (!orgId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const features = mockOrgFeatures[orgId] || {};
    const usage = Number(features[`${featureName}_usage`] || 0);

    if (usage >= limit) {
      res.status(429).json({ error: 'Usage limit exceeded' });
      return;
    }

    next();
  };
}

export function getS3KeyPrefix(orgId: string): string {
  return `org-${orgId}/`;
}
