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
