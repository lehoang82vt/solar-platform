import jwt from 'jsonwebtoken';
import { verifyUserToken } from './users';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be set in environment variables and at least 32 characters');
}
const JWT_EXPIRY = '7d';

export interface UserPayload {
  id: string;
  email: string;
  role: string;
  organization_id?: string;
}

export interface AuthToken {
  access_token: string;
}

/** @deprecated Use loginUser from services/users instead. Kept for backward compatibility. */
export async function authenticateUser(
  _email: string,
  _password: string
): Promise<UserPayload | null> {
  return null;
}

export function generateToken(user: UserPayload): AuthToken {
  const token = jwt.sign(user, JWT_SECRET!, {
    expiresIn: JWT_EXPIRY,
  });
  return { access_token: token };
}

/**
 * Verify JWT. Accepts both legacy payload (id) and SRV-01 payload (user_id).
 */
export function verifyToken(token: string): UserPayload | null {
  const decoded = verifyUserToken(token);
  if (!decoded) return null;
  return {
    id: decoded.user_id,
    email: decoded.email,
    role: decoded.role,
    organization_id: decoded.organization_id,
  };
}
