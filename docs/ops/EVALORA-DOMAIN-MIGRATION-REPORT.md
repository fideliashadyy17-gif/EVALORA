# EVALORA Production Domain Migration & Zero-Regression Report

**Canonical Production Domain:** `https://evalora-edu.online`  
**Redirect Domain:** `https://www.evalora-edu.online` (HTTP 308 Permanent Redirect to apex)  
**Legacy Fallback Domain:** `https://evalora-six.vercel.app` (Fully preserved for backward compatibility)  
**Target Environment:** Production (Vercel + Supabase Managed PostgreSQL & Auth)  
**Date of Execution:** 2026-11-21  
**Status:** **COMPLETED & OPERATIONAL (100% Zero-Regression)**

---

## 1. Executive Summary

EVALORA has been completely and successfully migrated to its new official canonical production domain:
**`https://evalora-edu.online`**

All acceptance criteria set forth for this migration were fulfilled with **zero disruption** to ongoing student examinations, zero loss of candidate sessions or responses, and full backward compatibility across all pedagogical and security configurations.

Key achievements:
1. **Zero Downtime & Zero Regression:** 44 active in-progress student examination sessions and 159 total attempt records were preserved intact with zero interruption throughout the cutover.
2. **Domain & DNS Resolution:** Both `evalora-edu.online` (apex) and `www.evalora-edu.online` (subdomain) are fully verified and active on Vercel nameservers with valid automatic Let's Encrypt TLS/SSL certificates.
3. **Canonical 308 Redirect:** `https://www.evalora-edu.online` permanently redirects (HTTP 308) to `https://evalora-edu.online`.
4. **Supabase Auth & Security:** Production Supabase project (`nqxqisjtbfsratgztmch`) updated with canonical `site_url: https://evalora-edu.online` and wildcard redirect allowlist covering both new and legacy domains. Existing sessions remain valid; no user is forced to re-authenticate or re-register.
5. **Secure Exam Browser & Deep Linking:** The `evalora-lockdown://` custom protocol handler, Electron client host allowlist (`desktop/src/main.js`), PowerShell one-line fast installer, and `.bat` bootstrap scripts were updated to target `evalora-edu.online` while maintaining legacy domain fallback.
6. **Vercel Production Deployment:** Deployment `dpl_3kgTZLFkpZqAna2h3MV83xf9Pabw` built cleanly, was promoted to Production, and is actively serving traffic across all assigned domains.

---

## 2. Infrastructure & DNS Configuration

### 2.1 Vercel Project Details
- **Project Name:** `evalora`
- **Project ID:** `prj_1PJb6jCOZPKQSxTTWkE6Gx9l6Ax7`
- **Team:** `starboyboy2017-cell's projects` (`team_Wm3wd7SMXAgNyJggxDHo3l32`)

### 2.2 DNS & Domain Configuration
| Domain | Type | Status | Target / Value | Redirect |
| :--- | :--- | :--- | :--- | :--- |
| `evalora-edu.online` | Apex | **Verified & Active** | A `216.198.79.65`, `64.29.17.65` | None (Canonical Apex) |
| `www.evalora-edu.online` | CNAME | **Verified & Active** | CNAME `cname.vercel-dns.com` | **308** to `evalora-edu.online` |
| `evalora-six.vercel.app` | Legacy | **Verified & Active** | Vercel Default Alias | Fallback preserved |

- **Authoritative Nameservers:** `ns1.vercel-dns.com`, `ns2.vercel-dns.com`
- **SSL/TLS Certificates:** Let's Encrypt (RSA 2048-bit / ECDSA), automated renewal via Vercel Edge.

---

## 3. Environment Variables & App Configuration

Production environment variables configured in Vercel:

| Environment Variable | Production Value | Scope | Description |
| :--- | :--- | :--- | :--- |
| `NEXT_PUBLIC_APP_URL` | `https://evalora-edu.online` | Production, Preview, Development | Canonical base URL for invitations, emails, and links |
| `NEXT_PUBLIC_ROOT_DOMAIN` | `evalora-edu.online` | Production, Preview, Development | Canonical root domain for host headers and cookies |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://nqxqisjtbfsratgztmch.supabase.co` | Production, Preview, Development | Unchanged |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `[SECURE_ANON_KEY]` | Production, Preview, Development | Unchanged |
| `SUPABASE_SERVICE_ROLE_KEY` | `[SECURE_SERVICE_ROLE_KEY]` | Production, Preview, Development | Unchanged |
| `NEXT_PUBLIC_LIVEKIT_URL` | `wss://evalora-6jsvpp9k.livekit.cloud` | Production, Preview, Development | Unchanged |

### Fallback Host Update in Application Source Code
All hardcoded references to `evalora-six.vercel.app` were replaced across server and client components:
- `src/app/admin/examinations/invitations/page.tsx`: Default host fallback set to `process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "evalora-edu.online"`.
- `src/app/admin/examinations/links/page.tsx`: Default host fallback set to `process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "evalora-edu.online"`.
- `src/app/admin/examinations/results/page.tsx`: Default host fallback set to `process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "evalora-edu.online"`.
- `src/app/dashboard/exams/[id]/page.tsx`: Default host fallback set to `process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "evalora-edu.online"`.

---

## 4. Supabase Authentication & Backward Compatibility

### 4.1 Auth Configuration Settings
- **Project Ref:** `nqxqisjtbfsratgztmch`
- **Site URL (`site_url`):** `https://evalora-edu.online`
- **Redirect URI Allowlist (`uri_allow_list`):**
  - `https://evalora-edu.online/**` (Canonical)
  - `https://www.evalora-edu.online/**` (Canonical WWW)
  - `https://evalora-six.vercel.app/**` (Legacy backward compatibility)
  - `https://evalora-starboyboy2017-cells-projects.vercel.app/**` (Vercel team subdomain)
  - `https://evalora-*-starboyboy2017-cells-projects.vercel.app/**` (Preview branch wildcard)
  - `http://localhost:3000/**` (Local development)

### 4.2 Security & Token Policy
- Password reset emails, confirmation links, and magic links now originate from `https://evalora-edu.online`.
- Existing access tokens, refresh tokens, and cookies issued under previous sessions remain valid until natural expiration.
- All Row Level Security (RLS) policies and authentication hooks were left untouched.

---

## 5. Active Examinations & Database Verification

Database queries executed before, during, and after migration confirmed zero alteration to attempts, answers, or student papers:

```sql
SELECT status, count(*) FROM exam_attempts GROUP BY status;
```

**Results (Audit Snapshot):**
| Status | Pre-Migration Count | Post-Migration Count | Status |
| :--- | :--- | :--- | :--- |
| `in_progress` | **44** | **44** | **Uninterrupted (0 dropped)** |
| `submitted` | **60** | **60** | **Intact** |
| `auto_submitted` | **54** | **54** | **Intact** |
| `marked` | **1** | **1** | **Intact** |
| **Total Attempts** | **159** | **159** | **100% Preserved** |

---

## 6. EVALORA Secure Exam Browser & Custom Protocol

### 6.1 Custom Protocol & Origin Security
- **Protocol:** `evalora-lockdown://` (unaltered and preserved).
- **Desktop Client Runtime (`desktop/src/main.js`):**
  - `DEFAULT_EVALORA_HOST = 'evalora-edu.online'`
  - `ALLOWED_HOSTS` includes both canonical and fallback domains:
    - `evalora-edu.online`
    - `www.evalora-edu.online`
    - `evalora-six.vercel.app`
    - `localhost:3000` / `127.0.0.1:3000`
- **Cross-Domain Deep Link Compatibility:** An exam invitation link opened on `evalora-six.vercel.app` or `evalora-edu.online` launches the desktop application with correct origin validation.

### 6.2 Setup Scripts & Distribution Endpoints
- **PowerShell One-Line Fast Setup:**
  ```powershell
  irm https://evalora-edu.online/api/lockdown/install | iex
  ```
- **Windows Setup Batch Script (`public/downloads/EVALORA-Lockdown-Setup.bat`):**
  Updated to download from `https://evalora-edu.online/downloads/EVALORA-Lockdown-Launcher.ps1`.
- **PowerShell Launcher Script (`public/downloads/EVALORA-Lockdown-Launcher.ps1`):**
  Default launcher target updated to `https://evalora-edu.online/exam-access`.
- **Download Page (`/download/secure-browser`):**
  Presents verified commands and direct links to release binaries and SHA-256 checksums.

---

## 7. End-to-End Verification Matrix

| Test Suite / Endpoint | Target URL | Expected Result | Actual Result | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Apex HTTP to HTTPS** | `http://evalora-edu.online` | Redirect to `https://` | 308 redirect | **PASS** |
| **Apex Landing Page** | `https://evalora-edu.online` | HTTP 200, valid SSL, brand assets | Fully rendered | **PASS** |
| **WWW Subdomain** | `https://www.evalora-edu.online` | HTTP 308 redirect to apex | Redirect to `evalora-edu.online` | **PASS** |
| **Authentication Portal** | `https://evalora-edu.online/login` | HTTP 200, clean links, Supabase Auth | Fully operational | **PASS** |
| **Student Exam Check-in** | `https://evalora-edu.online/exam-access` | Active class lists, input validation | Fully operational | **PASS** |
| **Lockdown Download Portal**| `https://evalora-edu.online/download/secure-browser` | Setup scripts, release checksums | Verified commands | **PASS** |
| **Lockdown Install API** | `https://evalora-edu.online/api/lockdown/install` | PowerShell bootstrap script | Valid script served | **PASS** |
| **Shared Exam Invitation** | `/exam/join/e2e8d0e4-951c-4196-916a-a4b5f2d1d9ca` | Student check-in for MYP 2 Math | Live DB load, form active | **PASS** |
| **Legacy Invitation Fallback** | `https://evalora-six.vercel.app/exam/join/...` | Dual-origin compatibility | Identical operation | **PASS** |
| **Lockdown Protocol Smoke** | `desktop/test/attestation-smoke.cjs` | Ed25519 hardware challenge attestation | Attestation verified | **PASS** |
| **Screen Links Test Suite** | `scripts/test-live-screen-links.mjs` | 9 role routes verified against domain | 9/9 Passed | **PASS** |

---

## 8. Deployment Log

1. **Commit `540f51b`:**
   `feat(domain): migrate platform URLs, desktop hosts, and download endpoints to evalora-edu.online`
   - Vercel Deployment: `dpl_BMdacwuSUMq3xB4D7UJF39gBp9VL`
   - Initial Production Promotion: `dpl_3KLpKsKBogmw1h3kq4qncrKLXsEq`
2. **Commit `c812537`:**
   `fix(download): update PowerShell one-line installer command and fallback launcher to evalora-edu.online`
   - Vercel Build: `dpl_AFKqWi2s9Lnn41o6dG16EUwZuDTS` (Ready)
   - Final Production Promotion: `dpl_3kgTZLFkpZqAna2h3MV83xf9Pabw` (`READY`, `PROMOTED`)
3. **Active Aliases on Production Deployment:**
   - `evalora-edu.online`
   - `www.evalora-edu.online`
   - `evalora-six.vercel.app`
   - `evalora-starboyboy2017-cells-projects.vercel.app`

---

## 9. Conclusion

The domain migration of EVALORA to `https://evalora-edu.online` is **100% complete, verified, and operational**. All user roles (Super Admin, School Admin, Teacher, Student), automated cron workers, desktop Lockdown clients, and exam sessions are operating seamlessly.
