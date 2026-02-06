import jwt from 'jsonwebtoken';
import { getDatabasePool } from '../config/database';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key-change-in-production';
const JWT_EXPIRY = '7d';

export interface UserPayload {
  id: string;
  email: string;
  role: string;
}

export interface AuthToken {
  access_token: string;
}

export async function authenticateUser(
  email: string,
  password: string
): Promise<UserPayload | null> {
  const pool = getDatabasePool();
  if (!pool) {
    throw new Error('Database pool not initialized');
  }

  try {
    // Use PostgreSQL crypt() function (pgcrypto) to verify password
    const result = await pool.query(
      `SELECT id, email, role, is_active 
       FROM users 
       WHERE email = $1 
       AND is_active = true 
       AND password_hash = crypt($2, password_hash)`,
      [email, password]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const user = result.rows[0];
    return {
      id: user.id,
      email: user.email,
      role: user.role,
    };
  } catch (error) {
    console.error('Authentication error:', error);
    throw error;
  }
}

export function generateToken(user: UserPayload): AuthToken {
  const token = jwt.sign(user, JWT_SECRET, {
    expiresIn: JWT_EXPIRY,
  });
  return { access_token: token };
}

export function verifyToken(token: string): UserPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as UserPayload;
    return decoded;
  } catch {
    return null;
  }
}
