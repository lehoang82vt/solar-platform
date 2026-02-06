import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import { config } from '../config/env';

interface Migration {
  name: string;
  content: string;
  downContent?: string;
}

async function readMigrations(): Promise<Migration[]> {
  const migrationsDir = path.join(__dirname, '../../migrations');
  
  if (!fs.existsSync(migrationsDir)) {
    console.warn(`Migrations directory not found: ${migrationsDir}`);
    return [];
  }

  const files = fs.readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql') && !file.includes('.down.'))
    .sort();

  return files.map((file) => {
    const downFile = file.replace('.sql', '.down.sql');
    const downPath = path.join(migrationsDir, 'down', downFile);
    const downContent = fs.existsSync(downPath) 
      ? fs.readFileSync(downPath, 'utf-8') 
      : undefined;
    
    return {
      name: file,
      content: fs.readFileSync(path.join(migrationsDir, file), 'utf-8'),
      downContent,
    };
  });
}

async function initSchemaMigrations(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      migration_name VARCHAR(255) UNIQUE NOT NULL,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

async function getAppliedMigrations(pool: Pool): Promise<Set<string>> {
  try {
    const result = await pool.query(
      'SELECT migration_name FROM schema_migrations WHERE migration_name IS NOT NULL'
    );
    return new Set(result.rows.map((row) => row.migration_name));
  } catch {
    return new Set();
  }
}

async function applyMigration(
  pool: Pool,
  name: string,
  content: string
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Set app settings for migrations that need environment variables
    await client.query(
      `SELECT set_config('app.admin_email', $1, false)`,
      [process.env.ADMIN_EMAIL || 'admin@solar.local']
    );
    await client.query(
      `SELECT set_config('app.admin_password', $1, false)`,
      [process.env.ADMIN_PASSWORD || 'AdminPassword123']
    );
    
    await client.query(content);
    await client.query(
      'INSERT INTO schema_migrations (migration_name) VALUES ($1)',
      [name]
    );
    await client.query('COMMIT');
    console.log(`✓ Applied: ${name}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function runMigrations(): Promise<void> {
  const pool = new Pool(config.database);

  try {
    console.log('Starting migration runner...');
    
    // Initialize schema_migrations table
    await initSchemaMigrations(pool);
    console.log('✓ Schema migrations table ready');

    // Read migrations from filesystem
    const migrations = await readMigrations();
    
    if (migrations.length === 0) {
      console.log('No migrations found');
      return;
    }

    // Get already applied migrations
    const applied = await getAppliedMigrations(pool);
    console.log(`Found ${migrations.length} migration(s), ${applied.size} already applied`);

    // Apply pending migrations
    let appliedCount = 0;
    for (const migration of migrations) {
      if (!applied.has(migration.name)) {
        await applyMigration(pool, migration.name, migration.content);
        appliedCount++;
      } else {
        console.log(`⊘ Already applied: ${migration.name}`);
      }
    }

    if (appliedCount === 0) {
      console.log('✓ All migrations already applied');
    } else {
      console.log(`\n✓ Successfully applied ${appliedCount} migration(s)`);
    }
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

export async function rollbackMigrations(): Promise<void> {
  const pool = new Pool(config.database);

  try {
    console.log('Starting migration rollback...');
    
    // Initialize schema_migrations table if needed
    await initSchemaMigrations(pool);

    // Read all migrations
    const migrations = await readMigrations();
    
    if (migrations.length === 0) {
      console.log('No migrations found');
      return;
    }

    // Get applied migrations in reverse order
    const applied = await getAppliedMigrations(pool);
    const appliedMigrations = Array.from(applied);
    appliedMigrations.reverse();

    if (appliedMigrations.length === 0) {
      console.log('No migrations to rollback');
      return;
    }

    console.log(`Found ${appliedMigrations.length} applied migration(s) to rollback`);

    // Rollback each migration in reverse order
    let rolledBackCount = 0;
    for (const migrationName of appliedMigrations) {
      const migration = migrations.find((m) => m.name === migrationName);
      
      if (!migration) {
        console.warn(`⚠ Migration file not found: ${migrationName}`);
        continue;
      }

      if (!migration.downContent) {
        console.warn(`⚠ No down migration for: ${migrationName}, skipping rollback`);
        continue;
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(migration.downContent);
        await client.query(
          'DELETE FROM schema_migrations WHERE migration_name = $1',
          [migrationName]
        );
        await client.query('COMMIT');
        console.log(`✓ Rolled back: ${migrationName}`);
        rolledBackCount++;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }

    if (rolledBackCount === 0) {
      console.log('No migrations were rolled back');
    } else {
      console.log(`\n✓ Successfully rolled back ${rolledBackCount} migration(s)`);
    }
  } catch (error) {
    console.error('Rollback failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run if called directly
if (require.main === module) {
  const command = process.argv[2];
  
  if (command === 'rollback') {
    rollbackMigrations();
  } else {
    runMigrations();
  }
}
