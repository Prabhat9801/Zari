# Deploying Zari — step by step

Do services deploy karne hain, dono Docker se, dono ek hi GitHub repo se:

| Service | Folder | Kya hai | Database chahiye? |
|---|---|---|---|
| `zari-ai-service` | [ai-service/](ai-service/) | Python + FastAPI + OpenAI. Design generation, costing, budget plans. | Nahi — stateless |
| `zari-api` | [backend/](backend/) | Node + Express + Prisma. Auth, designs, orders, escrow, QC. | Haan — Supabase Postgres |

**Order matter karta hai:** AI service pehle deploy karo, phir API — kyunki API ko AI service ka URL chahiye.

Frontend ([artifacts/zari/](artifacts/zari/)) abhi API se wired nahi hai — [Step 7](#step-7--frontend-abhi-nahi) dekho.

---

## Step 1 — Supabase (database + image storage)

1. https://supabase.com/dashboard → **New project**
2. Region: **Mumbai (ap-south-1)**
3. Database password set karo aur **kahin note kar lo** — baad me padha nahi ja sakta (reset hi kar sakte ho)
4. Project ban jaane ke baad: **Project Settings → Database → Connection string → URI tab**

   Yahan **do alag connection strings** chahiye. Ye interchangeable nahi hain:

   | Chahiye | Kaunsa | Port | Kyun |
   |---|---|---|---|
   | `DATABASE_URL` | **Transaction pooler** | `6543` | Chalti hui app iska use karti hai |
   | `DIRECT_URL` | **Session pooler** | `5432` | Migrations sirf isse chalti hain |

   > ⚠️ **"Direct connection" mat chuno.** Supabase ka direct host
   > (`db.<ref>.supabase.co:5432`) naye projects pe **IPv6-only** hai. Render ka egress
   > IPv4 hai, to deploy pe migrations `P1001: Can't reach database server` de kar fail
   > hongi. Aapke laptop se chal jaayega (ghar pe IPv6 hai) aur Render pe tootega.
   > **Session pooler** (`aws-0-<region>.pooler.supabase.com:5432`) IPv4 pe hai aur
   > migrations support karta hai — wahi use karo.
   >
   > Dono pooler URLs me username `postgres.<project-ref>` hota hai, sirf `postgres` nahi.

   `DATABASE_URL` ke end me ye add karna hai:
   ```
   ?pgbouncer=true&connection_limit=1
   ```

   Dono me `[YOUR-PASSWORD]` ko apne asli password se replace karo. Password me special characters ho to URL-encode karo — `@` → `%40`, `#` → `%23`.

   Final kuch aisa dikhega:
   ```
   DATABASE_URL=postgresql://postgres.abcdefgh:MyPass123@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1
   DIRECT_URL=postgresql://postgres:MyPass123@db.abcdefgh.supabase.co:5432/postgres
   ```

5. **Storage → New bucket** → naam `zari-media` → **Public bucket** tick karo → Create
6. **Project Settings → API** → ye do copy karo:
   - **Project URL** → `SUPABASE_URL`
   - **`service_role`** secret key → `SUPABASE_SERVICE_ROLE_KEY`

   > ⚠️ `service_role` key row-level security bypass karti hai. Ye sirf server pe rahegi — kabhi frontend me ya git me mat daalna.

---

## Step 2 — OpenAI (AI ke liye)

1. https://platform.openai.com → sign up / sign in

   > Ye **API platform** hai, `chatgpt.com` nahi. ChatGPT Plus subscription se API access **nahi** milta — dono alag billing hain.

2. **Settings → Billing** → payment method add karo aur **credits kharido**

   > Credits ke bina har request `429 insufficient_quota` se fail hogi. Ye sabse common wajah hai jab AI service deploy to ho jaata hai par kaam nahi karta.

3. **Dashboard → API keys → Create new secret key** → naam `zari-ai-service`
4. Key **turant copy karo** — `sk-proj-...` se shuru hoti hai, aur sirf ek baar dikhti hai
5. **Settings → Limits** me monthly spend limit set kar do

Image generation (GPT Image) **isi key se** chalti hai — alag account nahi chahiye. Par image models ke liye organisation verification maang sakta hai (**Settings → Organization**).

---

## Step 3 — Shared secret banao

Dono services ek shared secret se baat karti hain. Abhi bana lo, dono jagah wahi value daalni hai:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Output kahin paste kar ke rakho. Isko `SERVICE_TOKEN` bhi bolenge aur `AI_SERVICE_TOKEN` bhi — **value bilkul same honi chahiye**.

Isi tarah do JWT secrets bhi bana lo (dono alag-alag):

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

---

## Step 4 — AI service deploy karo (pehle ye)

**Render → New → Web Service → GitHub repo `Zari` connect karo**

Settings:

| Field | Value |
|---|---|
| Name | `zari-ai-service` |
| Language | **Docker** |
| Branch | `main` |
| **Root Directory** | `ai-service` |
| Dockerfile Path | `Dockerfile` |
| Region | Singapore |
| Instance Type | Starter (ya Free — [neeche note](#free-vs-starter) padho) |
| Health Check Path | `/health` |

> **Root Directory sabse important field hai.** Ye Render ko batata hai ki repo ke kis folder me jaana hai. Khaali chhoda to Render root pe Dockerfile dhoondhega, milega nahi, aur build fail hoga.

**Environment Variables:**

```
SERVICE_TOKEN      = <Step 3 wala shared secret>
OPENAI_API_KEY     = sk-proj-...
MODEL_ID           = gpt-5
REASONING_EFFORT   = high
MAX_OUTPUT_TOKENS  = 16000
IMAGE_PROVIDER     = none
ENVIRONMENT        = production
```

`PORT` set karne ki zarurat nahi — Dockerfile default `9000` deta hai aur Render usko override kar deta hai.

**Create Web Service** dabao. Build ~3-5 min lega.

Deploy hone ke baad:
- Service page se **URL copy karo** — `https://zari-ai-service-xxxx.onrender.com`
- Browser me `<URL>/health` kholo → `{"status":"ok","service":"zari-ai",...}` aana chahiye

---

## Step 5 — API deploy karo

**Render → New → Web Service → wahi repo**

| Field | Value |
|---|---|
| Name | `zari-api` |
| Language | **Docker** |
| Branch | `main` |
| **Root Directory** | `backend` |
| Dockerfile Path | `Dockerfile` |
| Region | Singapore |
| Health Check Path | `/api/health` |

**Environment Variables:**

```
NODE_ENV                  = production
PORT                      = 8080
LOG_LEVEL                 = info

DATABASE_URL              = <Step 1 — pooled, port 6543>
DIRECT_URL                = <Step 1 — direct, port 5432>

JWT_ACCESS_SECRET         = <Step 3 ka pehla secret>
JWT_REFRESH_SECRET        = <Step 3 ka doosra secret>
ACCESS_TOKEN_TTL          = 15m
REFRESH_TOKEN_TTL_DAYS    = 30

CORS_ORIGINS              = *
AI_SERVICE_URL            = <Step 4 ka URL, trailing slash ke bina>
AI_SERVICE_TOKEN          = <Step 3 wala shared secret — same value>
AI_SERVICE_TIMEOUT_MS     = 120000

SUPABASE_URL              = <Step 1>
SUPABASE_SERVICE_ROLE_KEY = <Step 1>
SUPABASE_STORAGE_BUCKET   = zari-media

OTP_PROVIDER              = console

ADVANCE_PERCENT           = 40
PLATFORM_FEE_PERCENT      = 10
FIT_WINDOW_DAYS           = 7
GUEST_FREE_GENERATIONS    = 1

RUN_SEED_ON_START         = true
```

**Create Web Service** dabao.

Deploy ke waqt logs me ye dikhna chahiye:

```
[zari-api] Applying database migrations...
Applying migration `0_init`
[zari-api] Seeding reference data...
Seeded 24 cost rules
Seeded 3 demo designers (password: zari-demo-2026)
[zari-api] Starting API...
Database connection established
Zari API listening — from inspiration to stitching
```

Migrations apne aap chal jaati hain (`docker-entrypoint.sh` me `prisma migrate deploy` hai) — Supabase me 46 tables ban jaayenge.

**Deploy successful hone ke baad `RUN_SEED_ON_START` ko `false` kar do** aur save karo. Seed dobara chalane ki zarurat nahi.

---

## Step 6 — Verify

```bash
curl https://zari-api-xxxx.onrender.com/api/health
# {"status":"ok","service":"zari-api"}

curl https://zari-api-xxxx.onrender.com/api/health/ready
# {"status":"ok","checks":{"database":true,"aiService":true}}

curl https://zari-ai-service-xxxx.onrender.com/health
# {"status":"ok","service":"zari-ai","model":"gpt-5"}
```

**`/api/health/ready` sabse kaam ka hai** — ye dono cheezein ek saath check karta hai:

| Result | Matlab |
|---|---|
| `database: false` | `DATABASE_URL` galat, ya password me special char encode nahi kiya |
| `aiService: false` | `AI_SERVICE_URL` galat/trailing slash hai, **ya** token dono jagah match nahi kar raha |
| Dono `true` | Sab wired hai ✅ |

Seed ke baad ye demo accounts ban jaate hain (password sab ka `zari-demo-2026`):
`aanya@zari.demo`, `mira@zari.demo`, `rekha@zari.demo`, `ops@zari.demo`

---

## Step 7 — Razorpay (jab payments chahiye)

Ye baad me kar sakte ho — iske bina baaki sab kaam karta hai, bas orders pay nahi ho paayenge.

1. https://dashboard.razorpay.com → sign up (Test mode ke liye KYC nahi chahiye)
2. **Account & Settings → API Keys → Generate Test Key**
   - `RAZORPAY_KEY_ID` — `rzp_test_` se shuru
   - `RAZORPAY_KEY_SECRET` — **sirf ek baar dikhta hai**, abhi copy karo
3. **Account & Settings → Webhooks → Add New Webhook**
   - URL: `https://zari-api-xxxx.onrender.com/api/payments/webhook`
   - Active events: `payment.captured`, `payment.failed`, `refund.processed`
   - Secret: koi strong string khud banao
4. Render → `zari-api` → Environment me ye teen add karo:
   ```
   RAZORPAY_KEY_ID         = rzp_test_...
   RAZORPAY_KEY_SECRET     = ...
   RAZORPAY_WEBHOOK_SECRET = <wahi string jo webhook form me daali>
   ```
5. Save → API apne aap redeploy hogi

Designer payouts ke liye alag se **RazorpayX** activate karna padta hai. Tab tak payouts `PENDING` rehte hain aur ops manually mark karta hai.

---

## Step 8 — Frontend (abhi nahi)

Frontend abhi bhi mock data wala demo hai — **API se connected nahi hai**. Deploy kar sakte ho, par wo backend se baat nahi karega.

Jab wire ho jaaye, tab Static Site banana:

| Field | Value |
|---|---|
| Root Directory | *(khaali — monorepo root)* |
| Build Command | `pnpm install && pnpm --filter @workspace/zari run build` |
| Publish Directory | `artifacts/zari/dist/public` |

Aur environment me `PORT=5173`, `BASE_PATH=/` dena padega (Vite config inke bina throw karta hai).

Frontend live hone ke baad `zari-api` ka `CORS_ORIGINS` `*` se badal ke asli URL kar dena:
```
CORS_ORIGINS = https://zari.onrender.com
```
(trailing slash nahi, comma se multiple URLs)

---

## Troubleshooting

| Problem | Wajah | Fix |
|---|---|---|
| Build: "no Dockerfile found" | **Root Directory** khaali chhoda | `backend` ya `ai-service` set karo |
| Boot pe crash, "Invalid environment configuration" | Koi required env var missing hai | Logs me exact variable ka naam likha hoga |
| `database: false` | Password me `@` / `#` encode nahi kiya | `%40` / `%23` karo |
| Migrations fail, `P1001: Can't reach database server` | `DIRECT_URL` me **direct connection** (`db.<ref>.supabase.co`) daal diya — wo IPv6-only hai, Render IPv4 hai | **Session pooler** use karo: `aws-0-<region>.pooler.supabase.com:5432`, username `postgres.<ref>` |
| Migrations fail, "prepared statement" error | `DIRECT_URL` me transaction pooler (6543) daal diya | Session pooler port `5432` hona chahiye |
| Har generation 502 deti hai | Token mismatch | `SERVICE_TOKEN` aur `AI_SERVICE_TOKEN` byte-for-byte same karo |
| AI service 429 `insufficient_quota` deta hai | OpenAI credits khatam | platform.openai.com → Billing → credits add karo |
| `/bin/sh^M: bad interpreter` | Entrypoint CRLF me commit hua | `.gitattributes` isko rokta hai — repo se ho to `git add --renormalize .` |
| Pehli request bahut slow | Free instance sleep se uth raha hai | Neeche wala note padho |

### Free vs Starter

`render.yaml` me `plan: starter` likha hai (~$7/mo per service). **Free** bhi chun sakte ho, par:

- Free instances 15 min inactivity ke baad **sleep** ho jaate hain
- Cold start ~50 sec lagta hai, uske upar 4-concept generation ka time
- Frontend ko lagega ki request hang ho gayi

Free se shuru karo agar sirf test karna hai. Real users ke liye kam se kam API ko Starter pe rakho.

---

## Redeploy kaise hota hai

`main` pe push karte hi Render apne aap redeploy karta hai (auto-deploy default on hai).

Sirf env var badla hai to code push ki zarurat nahi — Render → service → **Environment** → change → **Save Changes** → wo khud redeploy kar dega.

Manually chahiye to: service page → **Manual Deploy → Deploy latest commit**.

---

## Note: render.yaml

Repo me [render.yaml](render.yaml) bhi hai (Render Blueprint). Wo dono services ek saath bana deta hai, par uska ek chicken-and-egg problem hai — API ko AI service ka URL chahiye jo abhi bana hi nahi hota, isliye placeholder daal ke baad me update karna padta hai.

**Upar wala manual route zyada seedha hai.** Blueprint tab use karo jab aap same setup baar-baar dohra rahe ho.

---

## Local development

```bash
cp backend/.env.example backend/.env          # DB + AI token bharo
cp ai-service/.env.example ai-service/.env    # same AI token + OpenAI key
docker compose up --build
```

API `http://localhost:8080` pe, AI service `http://localhost:9000` pe (`/docs` bhi milega). Migrations container start pe khud chalti hain.

Supabase ke bina chalana ho to:
```bash
docker compose --profile local-db up --build
```
aur dono URLs ko `postgresql://zari:zari@postgres:5432/zari` kar do.
