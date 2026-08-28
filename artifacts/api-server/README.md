# @workspace/api-server

> **Express + TypeScript API Server for PIM : th3v4ult - poetry in motion**

[![Node.js](https://img.shields.io/badge/Node.js-20.x-339933?style=flat-square&logo=nodedotjs)](https://nodejs.org)
[![Express](https://img.shields.io/badge/Express-4.x-000000?style=flat-square&logo=express)](https://expressjs.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org)
[![Drizzle ORM](https://img.shields.io/badge/Drizzle-ORM-C5F74F?style=flat-square)](https://orm.drizzle.team)

---

## 🏛️ Architecture & Role

`api-server` provides auxiliary REST API endpoints, telemetry aggregation, profile syncing, and custom server-side integrations for the PIM platform.

### Core Components
* **Routes**: Modular route handlers for user profiles, collections, gameplay telemetry, analytics, and catalog queries.
* **Middlewares**: CORS configuration, request logging, error handling, and authentication token verification.
* **Database Access**: Shared Drizzle ORM models and PostgreSQL pool connections (`lib/db`).
* **Type Safety**: Contract validation powered by `lib/api-spec` and `lib/api-zod`.

---

## 🛠️ Development

```bash
# Run API server in watch mode with tsx
pnpm dev

# Type check and compile TypeScript
pnpm build

# Start compiled production server
pnpm start
```

---

## 🔐 Environment Variables

```env
PORT=3000
DATABASE_URL=postgres://...
SUPABASE_URL=https://...
SUPABASE_SERVICE_ROLE_KEY=...
```

---

## 📄 License

Created by **TH3SCR1B3** ([th3scr1b3.art](https://th3scr1b3.art)). All rights reserved.
