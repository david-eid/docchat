# DocChat - GIN446 Part 2 V2

React/Vite frontend and Express backend with Neon PostgreSQL, Prisma 6,
bcrypt passwords and cookie sessions. The portfolio, theme toggle, health
message, UI and CSS are preserved. No Part 3 features were added.

## Run locally (PowerShell)

Use Node.js 24 LTS. Keep the existing `server/.env` with `DATABASE_URL` and a
private `SESSION_SECRET` of at least 32 characters. For a fresh checkout only,
copy `server/.env.example` to `server/.env` and fill in your values.
Never overwrite an existing `.env` or commit secrets. The root `.gitignore`
ignores `server/.env`; the example contains placeholders only.

Backend terminal:

```powershell
Set-Location C:\Users\User\Desktop\docchat\server
npm ci
npx prisma generate
npm run dev
```

`npm run dev` runs exactly `node --watch --env-file=.env index.js`.
The backend listens on port 3000 by default. The existing module-relative
environment loader also supports imports in tests and `npm start`.

Frontend terminal:

```powershell
Set-Location C:\Users\User\Desktop\docchat\client
npm ci
npm run dev
```

Open http://localhost:5173. Vite proxies `/api` to http://localhost:3000.
Stop each server with Ctrl+C. Once dependencies are installed, only
`Set-Location` and `npm run dev` are needed for daily use.

## V2 database connection

Prisma, Prisma Client and the Neon adapter are installed at 6.19.3; the Neon
serverless driver is 1.2.1. Runtime queries use HTTPS port 443. Keep the existing
PostgreSQL-format `DATABASE_URL`: do not change its scheme to HTTPS or its port
to 443. The adapter handles the transport.

The PDF spells the import `PrismaNeonHttp`, but Prisma 6 exports
`PrismaNeonHTTP`. An alias makes the professor's initialization work:

```javascript
import { PrismaNeonHTTP as PrismaNeonHttp } from '@prisma/adapter-neon';
const adapter = new PrismaNeonHttp(process.env.DATABASE_URL, {});
const prisma = new PrismaClient({ adapter });
```

The classic `prisma-client-js` generator, User/Document/Message models and
migration history are unchanged. No init, reset or migration is needed for
this upgrade. Prisma CLI migrations and Studio still use port 5432; use
Neon's web Tables view on networks that block it.

Registration retains HTTP 201 and `{ user: { id, name } }`; duplicate email
retains HTTP 409. Both Prisma `P2002` and Neon HTTP `23505` unique violations
are handled. Existing validation, bcrypt cost 10, session regeneration,
HttpOnly/SameSite cookies and generic internal-error responses are preserved.
Sessions survive refresh, but the existing in-memory store loses sessions
when the backend restarts. This is a local coursework setup.

## Verification commands

```powershell
Set-Location C:\Users\User\Desktop\docchat\server
npm test
# Optional REAL database test: adds and retains one labeled test user per run.
# It never deletes records or runs migrations.
npm run test:neon
Set-Location C:\Users\User\Desktop\docchat\client
npm run lint
npm run build
```

`npm test` uses real HTTP, bcrypt and sessions with mocked Prisma user methods
and a dummy database URL. It does not contact Neon. `test:neon` uses the real
adapter, checks HTTPS port 443 for database requests, and tests all five routes,
duplicate email, invalid input, incorrect password, stored hashes, cookie reuse
and logout. It checks document/message counts and migration history remain
unchanged. Cookie replay simulates refresh; it is not a browser refresh test.
Run it when other clients are idle so concurrent edits do not affect counts.

Results on November 26, 2026:

- Prisma generation: passed (6.19.3).
- Backend mock tests: 5/5 passed (all four originals plus one regression).
- Real Neon integration: passed, including 14 successful HTTPS database requests.
- Frontend ESLint and production build: passed.
- Vite page and API proxy health/anonymous session: passed.
- Browser interaction/actual refresh: pending; browser automation unavailable.
- Physical USEK Wi-Fi: not tested.
- npm audit: four high-severity findings in the existing Prisma CLI dependency
  chain (`prisma`, `@prisma/config`, `deepmerge-ts`, `effect`). npm proposes a
  Prisma 7 upgrade; no forced fix was applied because the project requires 6.

Three labeled test users were retained (two diagnostic runs and the successful
run), with emails beginning `docchat-v2-` and name `Part 2 V2 verification`.
Generated passwords were not logged. Existing records were not modified or removed.

## Manual verification checklist

- Open the frontend; check portfolio cards, theme toggle and health message.
- Register with a unique email; check the greeting and new row in Neon Tables.
- Refresh while the backend remains running; confirm the greeting stays.
- Log out; confirm forms return and `/api/me` returns `{ user: null }`.
- Register the same email again; expect 409 and a readable duplicate message.
- Try an incorrect password; expect 401. Then log in correctly.
- Try invalid email, blank name and short password; confirm validation errors.
- Inspect Network responses: no password/hash or secrets should be returned.
- Repeat registration/login/refresh/logout on USEK Wi-Fi to verify campus access.

No commit or push is part of this upgrade; review the changes first.
