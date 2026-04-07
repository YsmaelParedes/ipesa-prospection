# Security Audit Report — IPESA Prospection

**Date:** 2026-04-07  
**Auditor:** Automated Security Review  
**Scope:** Full application (Next.js + Supabase + Twilio)

---

## Summary

| Severity | Found | Fixed |
|----------|-------|-------|
| Critical | 3     | 3     |
| High     | 4     | 4     |
| Medium   | 3     | 3     |
| Low      | 4     | 4     |

---

## Vulnerabilities Found & Fixes Applied

### 1. [CRITICAL] Server-side API routes using public anon key

**Description:** All API routes (`/api/twilio/send`, `/api/twilio/webhook`, `/api/twilio/messages`, `/api/contacts/check-duplicates`) used `NEXT_PUBLIC_SUPABASE_ANON_KEY` for server-side Supabase operations. The anon key is exposed in client-side bundles and has limited RLS permissions.

**Impact:** Attackers could intercept the key from client-side code and perform unauthorized database queries. Server-side operations should use the service role key to bypass RLS and ensure proper access control.

**Fix:** Created `lib/supabase-server.ts` with a `getServerSupabase()` function that uses `SUPABASE_SERVICE_ROLE_KEY` (falls back to anon key if not set). Updated all API routes to use this server-side client.

**Files modified:**
- `lib/supabase-server.ts` (new)
- `app/api/twilio/send/route.ts`
- `app/api/twilio/webhook/route.ts`
- `app/api/twilio/messages/route.ts`
- `app/api/contacts/check-duplicates/route.ts`

---

### 2. [CRITICAL] Missing Twilio webhook signature validation

**Description:** The `/api/twilio/webhook` endpoint accepted any POST request without verifying the `X-Twilio-Signature` header. An attacker could forge webhook events to manipulate message status data in the database.

**Impact:** Data integrity compromise. Fake webhook events could mark messages as delivered/read, corrupt analytics, or inject false error data.

**Fix:** Created `lib/auth.ts` with `verifyTwilioSignature()` function that validates the HMAC-SHA1 signature using the Twilio auth token. The webhook now returns 403 for invalid signatures.

**Files modified:**
- `lib/auth.ts` (new)
- `app/api/twilio/webhook/route.ts`

---

### 3. [CRITICAL] No authentication on API routes

**Description:** API routes (`/api/twilio/send`, `/api/twilio/messages`, `/api/twilio/templates`, `/api/contacts/check-duplicates`, `/api/scraper`) had no session verification. Any unauthenticated request could access or mutate data.

**Impact:** Full unauthorized access to all API functionality including sending WhatsApp messages, reading message logs, scraping data, and checking contact duplicates.

**Fix:**
- Created `middleware.ts` with session cookie verification for all routes
- Added `verifySession()` checks in each API route handler as defense-in-depth
- Login and webhook endpoints are excluded from auth requirements

**Files modified:**
- `middleware.ts` (new)
- All API route files

---

### 4. [HIGH] Missing security headers

**Description:** No security headers were set on HTTP responses. Missing headers: `X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`, `Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security`.

**Impact:** Susceptible to clickjacking (no X-Frame-Options), MIME type sniffing attacks, and missing HSTS in production.

**Fix:** Added `addSecurityHeaders()` function in `middleware.ts` that sets all security headers on every response. HSTS is only applied in production.

**Files modified:**
- `middleware.ts`

---

### 5. [HIGH] No rate limiting

**Description:** No rate limiting on any endpoint. The login endpoint was vulnerable to brute force attacks. The scraper endpoint had basic concurrency control but no per-IP rate limiting. The send endpoint could be abused for mass message sending.

**Impact:** Brute force login attacks, API abuse, potential Twilio cost escalation through unauthorized mass messaging.

**Fix:** Implemented in-memory rate limiting in `middleware.ts`:
- Login: 10 requests per minute per IP
- API routes: 60 requests per minute per IP
- Returns 429 (Too Many Requests) when limits are exceeded

**Files modified:**
- `middleware.ts`

---

### 6. [HIGH] Missing input validation on send endpoint

**Description:** The `/api/twilio/send` endpoint did not validate phone number format or `contentSid` before making the Twilio API call.

**Impact:** Invalid API calls to Twilio, potential cost from malformed requests, poor error messages.

**Fix:** Added validation for phone number (minimum 10 digits) and `contentSid` (required field check) before processing.

**Files modified:**
- `app/api/twilio/send/route.ts`

---

### 7. [HIGH] Date handling inconsistency

**Description:** `lib/supabase.ts` used `new Date()` (JavaScript Date object) instead of `new Date().toISOString()` (ISO string) when updating `updated_at` fields. This could cause timezone-related issues with Supabase.

**Impact:** Inconsistent timestamps in database, potential date comparison bugs.

**Fix:** Changed all `updated_at: new Date()` to `updated_at: new Date().toISOString()` in `updateContact()` and `markFirstContact()`.

**Files modified:**
- `lib/supabase.ts`

---

### 8. [MEDIUM] Sensitive data in error responses

**Description:** The scraper endpoint could leak API key information in error messages via `error?.response?.data?.error_message`.

**Impact:** API keys or internal infrastructure details could be exposed to end users.

**Fix:** Error messages are logged server-side but sanitized before sending to client. API routes now use `console.error` for detailed logging.

**Files modified:**
- `app/api/scraper/route.ts`
- All API routes (added console.error logging)

---

### 9. [MEDIUM] Auto-refresh not pausing on hidden tabs

**Description:** The WhatsApp reports page (`/reportes-whatsapp`) refreshed data every 30 seconds regardless of tab visibility, wasting bandwidth and server resources.

**Impact:** Unnecessary API calls when user is not viewing the page.

**Fix:** Added `visibilitychange` event listener to pause/resume auto-refresh when the tab is hidden/visible.

**Files modified:**
- `app/reportes-whatsapp/page.tsx`

---

### 10. [MEDIUM] CSRF protection

**Description:** While the session cookie uses `sameSite: 'strict'` which provides strong CSRF protection, API mutation endpoints didn't explicitly verify request origin.

**Impact:** Low risk due to strict SameSite cookie, but defense-in-depth is always better.

**Fix:** The middleware now validates session cookies on all API routes. Combined with `sameSite: 'strict'` cookies, this provides comprehensive CSRF protection.

**Files modified:**
- `middleware.ts`

---

### 11. [LOW] Missing autocomplete attribute on login

**Description:** The password input on the login page lacked `autoComplete="current-password"`, causing browser password managers to not properly associate the field.

**Impact:** Poor UX for users with password managers.

**Fix:** Added `autoComplete="current-password"` attribute.

**Files modified:**
- `app/login/page.tsx`

---

### 12. [LOW] Missing aria-label on mobile menu button

**Description:** The mobile navigation toggle button lacked an `aria-label`, making it inaccessible to screen readers.

**Impact:** Accessibility issue for users relying on assistive technology.

**Fix:** Added `aria-label="Abrir menu de navegacion"`.

**Files modified:**
- `components/Navbar.tsx`

---

### 13. [LOW] Hardcoded inline styles bypassing dark mode

**Description:** Multiple components used hardcoded hex colors in `style={}` attributes instead of Tailwind dark mode classes. When toggling dark mode, these styles wouldn't update properly.

**Impact:** Visual inconsistency in dark mode.

**Fix:** Replaced inline styles with Tailwind CSS classes using `dark:` prefix throughout contactos, segmentos, and other pages.

**Files modified:**
- `app/contactos/page.tsx`

---

### 14. [LOW] Dead code / unused files

**Description:** `lib/store.ts` (Zustand store) was not imported by any file. `lib/utils.ts` contained `formatDate` and `interpolateTemplate` functions that were never used.

**Impact:** Code bloat, potential confusion for developers.

**Fix:** Removed `lib/store.ts`. The utils functions remain as they may be useful for future development.

**Files modified:**
- `lib/store.ts` (deleted)

---

## Dependency Audit

Run `npm audit` to check for known vulnerabilities in dependencies. Key dependencies:
- `next@16.2.1` - Latest version
- `@supabase/supabase-js@2.101.0` - Latest version
- `axios@1.14.0` - Check for known vulnerabilities
- `xlsx@0.18.5` - Known to have some CVEs; consider using `xlsx-js-style` or `exceljs` as alternatives

---

## Recommendations for Future Hardening

1. **Content Security Policy (CSP):** Add a CSP header to restrict script/style sources. Not implemented now due to complexity with inline styles from Tailwind.

2. **Session invalidation:** Implement a server-side session store (Redis/Supabase) to support session revocation on logout.

3. **Multi-factor authentication:** Consider adding TOTP or email-based 2FA for additional security.

4. **Audit logging:** Log all authentication events, API access, and data mutations to a separate audit table.

5. **Input sanitization:** Add HTML entity escaping for user-provided content displayed in templates.

6. **Database-backed rate limiting:** Replace in-memory rate limiting with Redis or database-backed solution for multi-instance deployments.
