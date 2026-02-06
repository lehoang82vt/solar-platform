# F-03: FOUNDATION SCHEMA - DELIVERABLE

## ✅ SCOPE: 3 Foundation Tables (khóa cứng schema)

- ✅ **users** table with email unique constraint
- ✅ **projects** table with customer_name
- ✅ **audit_events** table with JSONB payload
- ✅ Idempotent: `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`
- ✅ Proper defaults: `uuid_generate_v4()`, `now()`, JSONB empty object

---

## 📋 MIGRATION FILE

**File**: `packages/backend/migrations/001_foundation.sql`

### Users Table
```sql
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  email varchar(255) NOT NULL UNIQUE,
  role varchar(50) NOT NULL DEFAULT 'admin',
  created_at timestamptz NOT NULL DEFAULT now()
);
```

### Projects Table
```sql
CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_name varchar(255) NOT NULL,
  address text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

### Audit Events Table
```sql
CREATE TABLE IF NOT EXISTS audit_events (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor varchar(255) NOT NULL,
  action varchar(100) NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

### Indexes
```sql
CREATE INDEX IF NOT EXISTS idx_audit_events_created_at ON audit_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_projects_created_at ON projects(created_at DESC);
```

---

## ✅ VERIFICATION RESULTS (RAW OUTPUT)

### 1. npm run migrate

```
Starting migration runner...
✓ Schema migrations table ready
Found 2 migration(s), 1 already applied
⊘ Already applied: 000_init.sql
✓ Applied: 001_foundation.sql

✓ Successfully applied 1 migration(s)
```

✅ **PASS**: 001_foundation.sql applied successfully

---

### 2. \dt - List all tables

```
               List of relations
 Schema |       Name        | Type  |  Owner   
--------+-------------------+-------+----------
 public | audit_events      | table | postgres
 public | projects          | table | postgres
 public | schema_migrations | table | postgres
 public | users             | table | postgres
(4 rows)
```

✅ **PASS**: All 3 tables created + schema_migrations

---

### 3. \d users

```
                                   Table "public.users"
   Column   |           Type           | Collation | Nullable |          Default           
------------+--------------------------+-----------+----------+----------------------------
 id         | uuid                     |           | not null | uuid_generate_v4()
 email      | character varying(255)   |           | not null | 
 role       | character varying(50)    |           | not null | 'admin'::character varying
 created_at | timestamp with time zone |           | not null | now()
Indexes:
    "users_pkey" PRIMARY KEY, btree (id)
    "users_email_key" UNIQUE CONSTRAINT, btree (email)
```

✅ **PASS**: 
- Correct columns and types
- `id` defaults to `uuid_generate_v4()`
- `role` defaults to `'admin'`
- `created_at` defaults to `now()`
- `email` has UNIQUE constraint

---

### 4. \d projects

```
                               Table "public.projects"
    Column     |           Type           | Collation | Nullable |      Default       
---------------+--------------------------+-----------+----------+--------------------
 id            | uuid                     |           | not null | uuid_generate_v4()
 customer_name | character varying(255)   |           | not null | 
 address       | text                     |           |          | 
 created_at    | timestamp with time zone |           | not null | now()
Indexes:
    "projects_pkey" PRIMARY KEY, btree (id)
    "idx_projects_created_at" btree (created_at DESC)
```

✅ **PASS**:
- Correct columns and types
- `id` defaults to `uuid_generate_v4()`
- `created_at` defaults to `now()`
- Index on `created_at DESC` exists

---

### 5. \d audit_events

```
                            Table "public.audit_events"
   Column   |           Type           | Collation | Nullable |      Default       
------------+--------------------------+-----------+----------+--------------------
 id         | uuid                     |           | not null | uuid_generate_v4()
 actor      | character varying(255)   |           | not null | 
 action     | character varying(100)   |           | not null | 
 payload    | jsonb                    |           | not null | '{}'::jsonb
 created_at | timestamp with time zone |           | not null | now()
Indexes:
    "audit_events_pkey" PRIMARY KEY, btree (id)
    "idx_audit_events_created_at" btree (created_at DESC)
```

✅ **PASS**:
- Correct columns and types
- `id` defaults to `uuid_generate_v4()`
- `payload` defaults to `'{}'::jsonb`
- `created_at` defaults to `now()`
- Index on `created_at DESC` exists

---

### 6. Unique constraint test - Insert 1

```
INSERT 0 1
```

✅ **PASS**: First insert successful

---

### 7. Unique constraint test - Insert 2 (duplicate)

```
ERROR:  duplicate key value violates unique constraint "users_email_key"
DETAIL:  Key (email)=(a@a.com) already exists.
```

✅ **PASS**: Duplicate email correctly rejected with unique violation

---

## 🎯 PASS CRITERIA - ALL MET ✅

| Criteria | Expected | Actual | Status |
|----------|----------|--------|--------|
| Migration apply | OK | ✓ Applied 001_foundation.sql | ✅ PASS |
| Users table | exists with schema | ✓ All columns + defaults correct | ✅ PASS |
| Projects table | exists with schema | ✓ All columns + defaults correct | ✅ PASS |
| Audit events table | exists with schema | ✓ All columns + defaults correct | ✅ PASS |
| Indexes | created | ✓ Both indexes present | ✅ PASS |
| Unique email | enforced | ✓ Duplicate insert fails | ✅ PASS |
| Idempotent | safe to rerun | ✓ IF NOT EXISTS used | ✅ PASS |

---

## 📝 GIT COMMIT

```
Commit: 33338dd
Message: feat: F-03 foundation schema (users/projects/audit_events)
Files: 1 file changed, 38 insertions(+)
- packages/backend/migrations/001_foundation.sql (new)
```

---

## 🚀 WHAT'S NEXT

Foundation schema ready for business domain tables (F-04+).

Current structure:
```
packages/backend/migrations/
├── 000_init.sql          (extensions)
├── 001_foundation.sql    (users/projects/audit_events)
└── 002_*.sql             (ready for domain tables)
```

---

**Status**: ✅ F-03 FOUNDATION SCHEMA - COMPLETE AND VERIFIED
