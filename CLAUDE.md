# Zari — From Inspiration to Stitching

Zari is a **premium Indian custom-fashion marketplace**. A customer describes (or uploads) an outfit
idea, Zari turns it into a *manufacturable* design with a transparent itemised estimate, lets them
tune it to a budget, then matches them with a verified independent designer who actually cuts,
sources and stitches the garment — with escrow payment, Zari quality control, and a 7-day fit window.

```
Inspiration → Design → Edit → Price → Budget fit → Designer → Order → Escrow → QC → Delivery → Fit window
```

Zari is deliberately **not** an "AI fashion app". AI translates an idea into a spec and a price; a
real human designer makes the garment. Nothing about price, substitution, or ranking is hidden.

**The full system spec is [ZARI_SYSTEM_PROMPT.txt](ZARI_SYSTEM_PROMPT.txt)** — product idea, UI, API
surface, database model, money flow, deploy topology. Read that first for the whole picture.
[prompt.txt](prompt.txt) is the original *frontend* build brief; [DEPLOYMENT.md](DEPLOYMENT.md) is
the deploy runbook.

---

## Current state

| Piece | Path | State |
|---|---|---|
| **Backend API** | [backend/](backend/) | **Complete.** Node 22 + Express 5 + Prisma. Typechecks clean. |
| **AI service** | [ai-service/](ai-service/) | **Complete.** Python 3.12 + FastAPI + OpenAI. Stateless. |
| **Database** | [backend/prisma/schema.prisma](backend/prisma/schema.prisma) | **Complete.** Validated. Seeded with real Indian cost rules. |
| **Deploy** | [render.yaml](render.yaml), Dockerfiles | **Complete.** Migrations run on container start. |
| **Frontend** | [artifacts/zari/](artifacts/zari/) | **Demo only.** Single-file, inline mock data, **not wired to the API**. |

The frontend is the remaining work. Everything it needs on the server now exists.

---

## Run & operate

```bash
# Everything at once (API + AI service, migrations applied automatically)
docker compose up --build

# Backend
cd backend
npm install
npx prisma migrate dev --name init   # ONCE — commit the generated migrations/
npm run seed                          # cost rules + 3 demo designers + ops account
npm run dev                           # tsx watch, port 8080
npm run typecheck

# AI service
cd ai-service
pip install -r requirements.txt
uvicorn app.main:app --reload --port 9000   # /docs in development

# Frontend
pnpm --filter @workspace/zari run dev
```

Demo logins after seeding: `aanya@zari.demo` / `mira@zari.demo` / `rekha@zari.demo` /
`ops@zari.demo`, all with password `zari-demo-2026`.

---

## Repo map

```
backend/                    ← THE API. Owns all persistence, auth, money.
  prisma/schema.prisma      ← source of truth for the data model
  src/
    app.ts routes.ts index.ts
    config/env.ts           ← Zod-validated env; process exits if invalid
    lib/                    ← prisma, logger, errors, http, money, ids
    middleware/             ← auth, validate, errorHandler, rateLimit
    services/               ← aiClient, costing, matching, qualityScore,
                              storage, payments, otp, notifications
    modules/<name>/         ← routes.ts + service.ts (+ schema.ts)
    seed.ts
ai-service/                 ← Python AI microservice. No DB, no user data.
  app/prompts.py            ← the product rules, encoded as system prompts
  app/schemas.py            ← hand-written JSON Schemas for structured outputs
  app/services/llm.py       ← the one place that calls OpenAI
  app/routers/              ← design.py, studio.py
artifacts/zari/             ← frontend (Vite + React 19 + TS)
  src/App.tsx               ← everything: routes, pages, mock data (~250 lines)
  src/index.css             ← the real design system (~935 lines hand-written CSS)
artifacts/api-server/       ← the old Replit Express stub. Superseded by backend/. Dead.
lib/                        ← Replit's Orval/Drizzle scaffolding. Also superseded. Dead.
render.yaml docker-compose.yml DEPLOYMENT.md ZARI_SYSTEM_PROMPT.txt
```

`artifacts/api-server/` and `lib/` are leftovers from the Replit template. The real backend is
`backend/`. Don't add to the old ones.

---

## Architecture decisions

1. **Money is an integer number of PAISE, everywhere.** ₹8,240 is `824000`. Never a float. Helpers
   in [backend/src/lib/money.ts](backend/src/lib/money.ts); `splitEscrow()` guarantees
   advance + balance == total exactly.
2. **Design versions are immutable.** Every edit inserts a new `DesignVersion` with a
   `parentVersionId`. That parent pointer is what makes branching, undo, and compare work. Nothing
   is ever updated in place.
3. **Escrow is a ledger, not a payment-provider feature.** Money is captured to the Zari account and
   written as `LedgerEntry(CREDIT, HELD)`. `releaseEscrow()` is called from exactly **one** place —
   the QC pass path in [backend/src/modules/qc/routes.ts](backend/src/modules/qc/routes.ts). There
   is deliberately no admin shortcut to pay a designer early.
4. **The AI service never invents prices.** The backend loads active `CostRule` rows (ops-managed at
   `/ops/cost-rules`) and passes them into every costing call; the prompt states those are the only
   rates allowed.
5. **Unmanufacturable is a first-class outcome.** The AI service returns HTTP 422 with
   `{ message, alternatives[] }`; the backend turns that into an `UNMANUFACTURABLE` error. A bad
   edit never silently succeeds.
6. **Matching and Quality Score weights are public**, at `GET /api/marketplace/scoring`. Price is
   not an input to either. If you change the weights in
   [matching.ts](backend/src/services/matching.ts) or
   [qualityScore.ts](backend/src/services/qualityScore.ts), change the customer-facing copy too.
7. **Guest mode is real.** `POST /api/auth/guest` issues an opaque token; designs created under it
   have `ownerId=null`. On signup the token is passed along and `claimGuestDesigns()` reassigns
   them — that is what makes "your guest design appears in your account" work.
8. **Structured outputs, not prompt-and-parse.** Every model call uses OpenAI
   `response_format.json_schema` with `strict: true`, so responses are guaranteed-shape. The
   schemas are hand-written in [schemas.py](ai-service/app/schemas.py) because strict mode
   supports a restricted JSON Schema subset (no numeric bounds, no string lengths, no recursion,
   `additionalProperties: false`, and every property must be listed in `required`).
9. **Frontend styling is hand-written semantic CSS**, not Tailwind utilities. Tailwind v4 is
   installed and the tokens are wired through `@theme inline`, but pages use classes like
   `.studio-layout` and `.match-card`. Match that; don't sprinkle utilities into `App.tsx`.
10. **The shipped palette is not the one in prompt.txt.** Spec asked for maroon `#8B3A3A` +
    Cormorant/Inter. Shipped: **deep teal** `hsl(173 36% 27%)`, **coral** `hsl(16 52% 62%)`, cream
    background, **Instrument Serif + DM Sans + DM Mono**. Shipped wins.

---

## Gotchas

**Backend**

- **Two database URLs, and they are not interchangeable.** `DATABASE_URL` is Supabase's
  *transaction* pooler (port 6543, needs `?pgbouncer=true&connection_limit=1`); `DIRECT_URL` is the
  *session* pooler (port 5432). Migrations cannot run through the transaction pooler.
- **Do not use Supabase's "Direct connection" host for `DIRECT_URL`.** `db.<ref>.supabase.co:5432`
  is IPv6-only on new projects and Render's egress is IPv4, so migrations fail there with
  `P1001: Can't reach database server` — while working fine from a laptop that has IPv6. The
  session pooler (`aws-0-<region>.pooler.supabase.com:5432`) is IPv4 and supports migrations. Both
  pooler URLs use the username `postgres.<project-ref>`, not `postgres`.
- **`backend/prisma/migrations/` must be committed.** Production runs `prisma migrate deploy`, which
  only *applies* migrations and never creates them. Run `npx prisma migrate dev --name init` once.
- **The Razorpay webhook is mounted before `express.json()`** in `app.ts`. Its HMAC is computed over
  the exact bytes; a re-serialised body would never verify. Don't move it.
- **Prisma cannot target a compound unique containing a NULL.** `CostRule` has a nullable `region`,
  so those writes are find-then-update rather than `upsert`.
- **Express 5 types route params as `string | string[]`.** Use `param(req, 'id')` from
  `lib/http.ts`, not `req.params.id`.
- Notifications are written *inside* the transaction that caused them, so a customer is never told
  about something that got rolled back.

**AI service**

- **`AI_SERVICE_TOKEN` (backend) and `SERVICE_TOKEN` (ai-service) must match exactly.** A mismatch
  shows up as every generation failing with a 502 while `/api/health` still looks fine — check
  `/api/health/ready`, which reports both database and AI service.
- **OpenAI credits are required.** With no balance every request fails with a 429
  `insufficient_quota`. A ChatGPT Plus subscription is not API access. Set a spend limit under
  Settings → Limits before going live.
- Image generation is optional (`IMAGE_PROVIDER=none` by default) and fails soft — the product works
  end to end without imagery. GPT Image returns base64, not a URL, so the AI service hands the
  bytes back and the backend uploads them to Supabase Storage — storage ownership stays in one place.

**Frontend**

- **`index.css` has two stacked layers.** The last commit appended ~368 lines (from ~line 611) that
  **re-declare** `.landing`, `.brand-mark`, `.button`, `.hero-*`, `.sidebar`, `.composer`, etc.
  Later rules win. Grep for *every* occurrence of a selector before changing it.
- Vite **throws** if `PORT` or `BASE_PATH` are unset. Running `vite` bare outside Replit fails.
- All deps are in `devDependencies` using pnpm `catalog:` versions from `pnpm-workspace.yaml`.
- Every interactive element carries a `data-testid` (`button-*`, `link-*`, `input-*`, `card-*`).

---

## Conventions

- Currency is always `₹8,240`. Never `Rs 8240`. Estimates are always a **range**
  (`₹7,400–₹8,400`); a bid and a final price are point values. Never blur the three.
- Errors are human-readable. Never a status code or stack trace. "Zari couldn't finish that design.
  Nothing is lost — try again."
- Empty states name the next action: "Your next outfit starts here." → *Create a design*.
- Mock and seed data uses realistic Indian names, studios and cities (Aanya Studio/Bengaluru, Mira
  Atelier/Mumbai, Rekha & Thread/Jaipur). No Lorem ipsum, no John Doe.
- Copy is calm, editorial, sentence-case. No emoji, no exclamation marks, no hype.

---

## What's left

1. **Wire the frontend to the API.** Extract `App.tsx` into `pages/ components/ services/ hooks/`,
   build a typed client + TanStack Query hooks, replace the mock consts with real calls.
2. **Build the missing designer screens** — dashboard, bids, copilot, earnings, quality. Only
   `/designer/profile` exists in the UI today; every one of those endpoints is already live.
3. **Build the ops console screens** — `/ops/qc`, `/ops/designers`, `/ops/disputes`,
   `/ops/cost-rules`. Same: the endpoints exist.
4. **Real version tree UI** (branch, compare, jump) and the **full-screen Budget Optimizer** with
   per-substitution toggles. These are the two features that make the product distinctive, and both
   are fully supported by the API already.
5. Persist guest designs client-side and implement the claim-on-signup transition.
6. Delete the dead Replit scaffolding (`artifacts/api-server/`, `lib/`) once nothing imports it.
