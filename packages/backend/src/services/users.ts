import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { withOrgContext } from '../config/database';

export interface User {
  id: string;
  organization_id: string;
  email: string;
  full_name: string;
  role: 'ADMIN' | 'SALES';
  status: string;
}

export interface UserJWT {
  user_id: string;
  organization_id: string;
  email: string;
  role: 'ADMIN' | 'SALES';
}

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be set in environment variables and at least 32 characters');
}

/**
 * Hash password (simplified - use bcrypt in production)
 */
function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

/**
 * Create user (for testing/seeding)
 */
export async function createUser(
  organizationId: string,
  data: {
    email: string;
    password: string;
    full_name: string;
    role: 'ADMIN' | 'SALES';
  }
): Promise<User> {
  const passwordHash = hashPassword(data.password);

  return await withOrgContext(organizationId, async (client) => {
    const result = await client.query(
      `INSERT INTO users (organization_id, email, password_hash, full_name, role, status)
       VALUES ($1, $2, $3, $4, $5, 'ACTIVE')
       RETURNING id, organization_id, email, full_name, role, status`,
      [organizationId, data.email, passwordHash, data.full_name, data.role]
    );
    return result.rows[0] as User;
  });
}

/**
 * Login user - uses PostgreSQL crypt() for password verification
 */
export async function loginUser(
  organizationId: string,
  email: string,
  password: string
): Promise<{ token: string; user: User } | null> {
  return await withOrgContext(organizationId, async (client) => {
    // Get user by email (including password_hash for verification)
    const result = await client.query<User & { password_hash: string }>(
      `SELECT id, organization_id, email, full_name, role, status, password_hash
       FROM users
       WHERE organization_id = $1 AND email = $2`,
      [organizationId, email]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const user = result.rows[0];

    // Verify password using PostgreSQL crypt function
    const verifyResult = await client.query<{ is_valid: boolean }>(
      `SELECT $1 = crypt($2, $1) as is_valid`,
      [user.password_hash, password]
    );

    if (!verifyResult.rows[0]?.is_valid) {
      return null;
    }

    if (user.status === 'SUSPENDED') {
      throw new Error('User account is suspended');
    }

    if (user.status !== 'ACTIVE') {
      throw new Error('User account is not active');
    }

    const payload: UserJWT = {
      user_id: user.id,
      organization_id: user.organization_id,
      email: user.email,
      role: user.role,
    };

    const token = jwt.sign(payload, JWT_SECRET!, { expiresIn: '7d' });

    // Remove password_hash before returning
    const { password_hash, ...userWithoutPassword } = user;

    return { token, user: userWithoutPassword };
  });
}

/**
 * Verify user JWT
 */
export function verifyUserToken(token: string): UserJWT | null {
  try {
    return jwt.verify(token, JWT_SECRET!) as UserJWT;
  } catch {
    return null;
  }
}
