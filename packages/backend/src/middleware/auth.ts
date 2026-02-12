import { Request, Response, NextFunction } from 'express';
import { verifyToken, UserPayload } from '../services/auth';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: UserPayload;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const token = authHeader.slice(7);
  const user = verifyToken(token);

  if (!user) {
    res.status(401).json({ error: 'Invalid token' });
    return;
  }

  req.user = user;
  next();
}

/** Requires requireAuth first; returns 403 if user.role is not 'admin' or 'super_admin'. */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const role = (req.user.role || '').toLowerCase();
  if (role !== 'admin' && role !== 'super_admin') {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  next();
}
