# EVALORA — Infrastructure & Cost Report (free-first)

> Current deployment: **Vercel** (Next.js) + **Supabase** (Postgres/Auth/Storage/Realtime) + **LiveKit Cloud** (video).
> Cloudflare is intentionally not used (owner decision, §3.1 of the master prompt).

## Free-tier limits that matter (verify current numbers before launch)

### Vercel (Hobby — current account plan)
- Intended for **personal, non-commercial** use — the owner must move to **Pro ($20/user/mo)** before commercial launch. Flagged at audit time.
- ~100 GB bandwidth/mo, serverless execution limits, 1 concurrent build.
- Deployment Protection (SSO on `*.vercel.app`) is enabled at team level — must be set to *Disabled* or *Only Preview Deployments* for public access, or a custom domain added.

### Supabase (Free)
- 500 MB database, 1 GB file storage, 5 GB bandwidth/mo (cached egress separate), 50,000 monthly active users, 2 active projects per org, projects pause after ~1 week of inactivity.
- Realtime: 200 concurrent connections, 2M messages/mo on free — live-quiz polling is HTTP, broadcasts are light, but large synchronized events should be load-tested (see TESTING.md).
- Built-in SMTP is rate-limited (a handful of emails/hour) — configure custom SMTP (e.g. Resend/Brevo free tiers) before inviting real users at scale.
- Upgrade trigger: **Pro ($25/mo)** for 8 GB DB, no pausing, higher Realtime/storage limits, daily backups.

### LiveKit Cloud (free "Build" style tier)
- Free tiers typically include a limited number of participant-minutes / downstream bandwidth per month (check your project dashboard — limits change).
- **Do not assume 1,000 simultaneous proctored candidates on free.** Video is the most expensive workload by far: one 720p camera ≈ 1–1.5 Mbps up + supervisor downstreams. 100 concurrent candidates ≈ 100–150 Mbps of SFU ingress. Pilot 5–20, then ~100, then decide on paid capacity.

## Workload cost intuition

| Workload | Dominant cost | Free-tier outlook |
|---|---|---|
| 1,000 participants in a live quiz (no video) | HTTP requests to Vercel functions + Postgres writes | Feasible technically; polling every 2 s × 1,000 = 500 req/s bursts — must load-test and may need Vercel Pro + Supabase Pro connection headroom |
| 1,000 exam candidates (no video) | Autosave writes, one state load each | Feasible; far lighter than live sync |
| 1,000 video-proctored candidates | LiveKit participant-minutes & bandwidth | **Not** a free-tier workload; budget per-minute pricing and pilot first |

## Recordings

`proctoring_recordings` stores metadata. Enabling actual egress recording
requires configuring LiveKit Egress with an S3-compatible bucket (e.g.
Supabase Storage S3 endpoint) — deliberately left off until the owner
chooses retention periods and confirms legal basis per jurisdiction.

## Scaling path (no rewrites needed)

1. Vercel Pro + Supabase Pro (first paid step, ~$45/mo total).
2. Add Redis/Upstash for hot live-session state if polling becomes hot;
   move participant state reads behind a cached endpoint.
3. LiveKit: raise plan or self-host on a VPS when proctoring volume grows —
   the token/component boundary keeps this a config change.
4. Custom domain + custom SMTP for production credibility.

## Backups & recovery

- Supabase free: no PITR; take periodic `pg_dump`s (dashboard → Database → Backups on Pro).
- Schema is fully reproducible from `supabase/migrations/`.
- All secrets live in Vercel env vars; rotating = update env + redeploy.
