/**
 * SEC-05: Required env validation. In production, missing JWT_SECRET or database config causes throw (crash).
 * Accepts optional env for testing; defaults to process.env.
 */
export type EnvLike = NodeJS.ProcessEnv | Record<string, string | undefined>;

function getEnv(env: EnvLike, key: string): string | undefined {
  return env[key];
}

function isProduction(env: EnvLike): boolean {
  const nodeEnv = getEnv(env, 'NODE_ENV');
  return nodeEnv === 'production';
}

/**
 * Validates required environment variables. In production:
 * - JWT_SECRET must be set and non-empty.
 * - Database must be configured: either DATABASE_URL or (POSTGRES_HOST, POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD).
 * @param env - Optional env object (defaults to process.env). Use in tests to pass mock env.
 * @throws Error with message describing the first missing requirement.
 */
export function validateEnv(env: EnvLike = process.env): void {
  if (!isProduction(env)) return;

  const jwtSecret = getEnv(env, 'JWT_SECRET');
  if (!jwtSecret || String(jwtSecret).trim() === '') {
    throw new Error('SEC-05: JWT_SECRET is required in production and must be non-empty');
  }

  const databaseUrl = getEnv(env, 'DATABASE_URL');
  const postgresHost = getEnv(env, 'POSTGRES_HOST');
  const postgresDb = getEnv(env, 'POSTGRES_DB');
  const postgresUser = getEnv(env, 'POSTGRES_USER');
  const postgresPassword = getEnv(env, 'POSTGRES_PASSWORD');

  const hasDatabaseUrl = databaseUrl != null && String(databaseUrl).trim() !== '';
  const hasPostgresVars =
    postgresHost != null && String(postgresHost).trim() !== '' &&
    postgresDb != null && String(postgresDb).trim() !== '' &&
    postgresUser != null && String(postgresUser).trim() !== '' &&
    postgresPassword != null;

  if (!hasDatabaseUrl && !hasPostgresVars) {
    throw new Error(
      'SEC-05: In production set DATABASE_URL or all of POSTGRES_HOST, POSTGRES_DB, POSTGRES_USER, POSTGRES_PASSWORD'
    );
  }
}
