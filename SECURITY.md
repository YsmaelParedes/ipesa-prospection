# Security Audit Report — IPESA Prospection CRM

**Audit Date**: 2026-05-27
**Auditor**: Web Security Expert Agent
**Scope**: Full Next.js 16 App Router application — API routes, middleware, configuration, dependencies
**Overall Risk Level Before Fixes**: HIGH
**Overall Risk Level After Fixes**: LOW–MEDIUM (pending manual actions below)

---

## Executive Summary

The application is a Next.js 16 App Router CRM with Supabase (SSR), web push notifications, and a cron job. Seven exploitable vulnerabilities were identified and fixed. The most critical was a fully unauthenticated admin endpoint (`/api/admin/profiles`) that exposed Supabase admin user management APIs to any caller — no session required. Five additional API routes had missing authentication, enabling unauthorized data access and manipulation. Input validation was absent across all write endpoints, enabling mass assignment attacks.

---

## Vulnerability Table

| # | Vulnerability | Severity | CVSS | File/Path | Description | Status |
|---|---|---|---|---|---|---|
| 1 | Missing auth on admin endpoint | **CRITICAL** | 9.8 | `app/api/admin/profiles/route.ts` | `GET` and `POST` called `supabase.auth.admin.*` with no session check — any unauthenticated HTTP caller could list all users and modify display names | **FIXED** |
| 2 | Missing auth on `/api/data/contacts` | **HIGH** | 8.1 | `app/api/data/contacts/route.ts` | GET, POST, DELETE had no `getUserId()` check — unauthenticated read/write of all contacts | **FIXED** |
| 3 | Missing auth on `/api/data/contacts/[id]` | **HIGH** | 8.1 | `app/api/data/contacts/[id]/route.ts` | GET, PUT, DELETE had no auth check | **FIXED** |
| 4 | Missing auth on `/api/data/config` | **HIGH** | 7.5 | `app/api/data/config/route.ts` | GET and POST had no auth — unauthenticated read/write of application config | **FIXED** |
| 5 | Missing auth on `/api/data/config/[id]` | **HIGH** | 7.5 | `app/api/data/config/[id]/route.ts` | DELETE had no auth — unauthenticated deletion of config items | **FIXED** |
| 6 | Missing auth on `/api/data/scores` | **MEDIUM** | 5.3 | `app/api/data/scores/route.ts` | GET and POST had no auth — unauthenticated leaderboard manipulation | **FIXED** |
| 7 | Missing auth on `/api/push/subscribe` DELETE | **MEDIUM** | 5.3 | `app/api/push/subscribe/route.ts` | DELETE had no auth — any caller could delete push subscriptions by endpoint | **FIXED** |
| 8 | Mass assignment on all write endpoints | **HIGH** | 7.5 | All `POST`/`PATCH` routes | User-supplied JSON was spread directly into DB inserts/updates — allowed injecting arbitrary columns (`user_id`, internal flags, etc.) | **FIXED** |
| 9 | No rate limiting on login | **HIGH** | 7.5 | `app/api/auth/login/route.ts` | No brute-force protection — unlimited password attempts per IP | **FIXED** |
| 10 | `unsafe-eval` in Content-Security-Policy | **MEDIUM** | 5.3 | `next.config.ts` | `script-src` included `unsafe-eval`, enabling eval()-based XSS payloads to execute | **FIXED** |
| 11 | Missing `poweredByHeader: false` | **LOW** | 2.6 | `next.config.ts` | `X-Powered-By: Next.js` header leaked framework version | **FIXED** |
| 12 | Missing security headers in `vercel.json` | **MEDIUM** | 5.3 | `vercel.json` | Only cron config was present — no CDN-level security headers | **FIXED** |
| 13 | Missing `X-DNS-Prefetch-Control` header | **LOW** | 2.6 | `next.config.ts` | DNS prefetch can leak browsed URLs to third-party DNS servers | **FIXED** |
| 14 | Admin endpoint lacks role check | **CRITICAL** | 9.1 | `app/api/admin/profiles/route.ts` | Even after adding auth, any authenticated user could call admin APIs without an `admin` role | **FIXED** (requires manual role assignment — see Pending Actions) |
| 15 | `xlsx` — Prototype Pollution (CVE) | **HIGH** | 7.8 | `package.json` | `xlsx@0.18.5` has unfixable Prototype Pollution and ReDoS (GHSA-4r6h-8v6p-xvw6, GHSA-5pgg-2g8v-p4x9). No patched version exists on npm. | **PENDING — manual action required** |
| 16 | `postcss` — XSS via unescaped `</style>` | **MODERATE** | 6.1 | `package.json` (transitive via `next`) | PostCSS < 8.5.10 (GHSA-qx2v-qp2m-jg93). Fixed in Next.js >= 16.3.1. | **PENDING — upgrade Next.js** |
| 17 | Input validation missing on config `type` param | **MEDIUM** | 5.3 | `app/api/data/config/route.ts` | Unvalidated `type` query param passed to DB filter | **FIXED** |
| 18 | `error.message` leaked in 500 responses | **LOW** | 3.1 | Multiple API routes | Supabase error messages returned in HTTP responses could reveal schema info | **FIXED** (sanitized in contacts, config, scores, push routes) |

---

## Measures Implemented

### Authentication Fixes
- Added `getUserId()` auth guard to: `/api/data/contacts`, `/api/data/contacts/[id]`, `/api/data/config`, `/api/data/config/[id]`, `/api/data/scores`
- Added `getUserId()` to `/api/push/subscribe` DELETE
- Added `requireAdmin()` guard to `/api/admin/profiles` — checks `app_metadata.role === 'admin'`

### Input Validation & Mass Assignment Prevention
- Added explicit field allowlists (`pickLeadFields`, `pickContactFields`, `pickActivityFields`, `pickReminderFields`, etc.) on all write endpoints
- Added string length limits on all user-supplied string fields
- Added array size limits on bulk DELETE endpoints
- Added type whitelist validation for `app_config.type` and `game_scores.game`
- Added score range validation (integer, 0–10M)

### Rate Limiting
- Login endpoint: 10 attempts per IP per 15-minute sliding window
- All API routes in middleware: 120 requests per IP per minute

### Security Headers
- Removed `unsafe-eval` from `script-src` in CSP
- Added `base-uri 'self'` and `form-action 'self'` to CSP
- Added `wss://*.supabase.co` to `connect-src` (required for Supabase realtime)
- Added `X-DNS-Prefetch-Control: off`
- Added `interest-cohort=()` to Permissions-Policy
- Set `X-XSS-Protection: 0` (deprecated header — CSP is the replacement)
- Added `poweredByHeader: false` in `next.config.ts`
- Mirrored all headers in `vercel.json` (Vercel CDN layer)

---

## Pending Manual Actions

### 1. Assign Admin Role (CRITICAL — do immediately)
The `/api/admin/profiles` endpoint now checks `app_metadata.role === 'admin'`. You must assign this role to authorized admin users via the Supabase Dashboard:

1. Go to Supabase Dashboard > Authentication > Users
2. Select the admin user
3. Under "Raw app_metadata", set: `{ "role": "admin" }`
4. Save. The user can now access `/api/admin/profiles`.

Without this, NO user can access the admin route (the endpoint returns 401 for everyone).

### 2. Replace or Sandbox `xlsx` (HIGH)
The `xlsx@0.18.5` package has unfixable Prototype Pollution and ReDoS vulnerabilities. The npm advisory states no fixed version is available in the `0.x` range.

**Options (choose one):**
- Replace with `exceljs` or `sheetjs-ce` (community fork): `npm uninstall xlsx && npm install exceljs`
- If xlsx is only used server-side with trusted data, contain the risk by never passing user-uploaded files directly to `xlsx.read()`
- Monitor the official SheetJS Pro release at https://sheetjs.com for a patched OSS version

### 3. Upgrade Next.js for PostCSS Fix (MODERATE)
```bash
npm install next@latest
```
The PostCSS XSS (GHSA-qx2v-qp2m-jg93) is fixed in Next.js >= 16.3.1. This affects CSS processing during build, not runtime — risk is low for production builds but should be patched.

### 4. Replace In-Memory Rate Limiting with Upstash (RECOMMENDED)
The current in-memory rate limiters (login + API middleware) reset on each serverless cold start. For production:

```bash
npm install @upstash/ratelimit @upstash/redis
```
Set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` in Vercel environment variables.

### 5. Rotate Secrets If Exposed
If `SUPABASE_SERVICE_KEY`, `VAPID_PRIVATE_KEY`, or `CRON_SECRET` were ever committed to git or exposed in logs:
- `SUPABASE_SERVICE_KEY`: Supabase Dashboard > Settings > API > Regenerate service role key
- `VAPID_PRIVATE_KEY`: Generate new VAPID keys with `npx web-push generate-vapid-keys`
- `CRON_SECRET`: Generate a new random 32-byte hex string and update in Vercel env vars

### 6. Supabase Row-Level Security (RLS)
The application uses the service role key (bypasses RLS) for all DB operations, relying on application-level filtering. This is a defense-in-depth gap. Recommend:
- Enable RLS on all tables in Supabase Dashboard
- Add RLS policies for user-scoped tables (`leads`, `reminders`, `lead_activities`, `push_subscriptions`)
- This ensures data isolation even if application logic has a bug

### 7. Review `SUPABASE_SERVICE_KEY` Fallback
In `lib/supabase-server.ts`:
```typescript
const SUPABASE_SVC = process.env.SUPABASE_SERVICE_KEY ?? SUPABASE_ANON
```
If `SUPABASE_SERVICE_KEY` is not set in production, the service client falls back to the anon key. Ensure `SUPABASE_SERVICE_KEY` is set in all Vercel environments. Consider throwing at startup if the key is missing.

---

## Positive Security Observations

- `getUserId()` correctly uses `getUser()` (network-validated) for authorization, not `getSession()` (cookie-only) — this is the correct pattern per Supabase docs
- Ownership checks before PATCH/DELETE on leads, activities, and reminders are well-implemented
- The cron endpoint checks `CRON_SECRET` from an `Authorization: Bearer` header — correct pattern
- HMAC-based login middleware pattern mentioned in project memory is a good practice
- Error messages returned to clients are already generic in most routes (not leaking stack traces)
- No `dangerouslySetInnerHTML` found anywhere in the codebase
- No hardcoded secrets found in source files
- Supabase anon key in `NEXT_PUBLIC_*` is acceptable — it is designed to be public
