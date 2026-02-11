# Demo Login Credentials

For development and testing, use these credentials:

**Demo Admin User:**
- Email: `admin@demo.local`
- Password: `demo123`
- Role: ADMIN

## Setup

To seed the demo user:

```bash
npm run seed:demo-admin
```

Or via TypeScript directly:

```bash
cd packages/backend
npx ts-node ../../scripts/seed-demo-admin.ts
```

## API Usage

### Login
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@demo.local","password":"demo123"}'
```

Response:
```json
{
  "access_token": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "token": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "user": {
    "id": "...",
    "email": "admin@demo.local",
    "full_name": "Demo Admin",
    "role": "ADMIN"
  }
}
```

### Use Token in Requests
```bash
curl -X GET http://localhost:3000/api/projects/v3 \
  -H "Authorization: Bearer <access_token>"
```

---

**Important:** Only use these credentials in development/testing. Never commit real credentials.
