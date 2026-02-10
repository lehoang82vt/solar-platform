import { Request, Response, NextFunction } from 'express';
import { verifyPartnerToken, type PartnerJWT } from '../services/partners';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      partner?: PartnerJWT;
    }
  }
}

export function requirePartnerAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const token = authHeader.slice(7);
  const partner = verifyPartnerToken(token);

  if (!partner) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  req.partner = partner;
  next();
}
