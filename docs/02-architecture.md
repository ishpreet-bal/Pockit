# STEP 2 — Architecture

## 2.0 Decision summary

| Layer | Choice | Rationale |
|---|---|---|
| Frontend | Next.js 15 App Router, React 19, TypeScript (strict) | Server Components keep financial aggregation on the server; one deploy target; first-class on Vercel. |
| Styling | Tailwind CSS v4 + CSS custom-property design tokens | Tokens give real dark/light theming; Tailwind keeps components small. |
| Charts | Recharts | Composable, SSR-safe, no licence cost, adequate for every chart in the spec. |
| Backend | Next.js Route Handlers + Server Actions | A separate backend buys nothing at this scale and costs a network hop plus a second deploy. Revisit if background processing outgrows serverless. |
| Database | PostgreSQL (Supabase-hosted), schema `pockit` | Relational integrity, `numeric`/`bigint` money, window functions for running balances, RLS. |
| ORM | Drizzle | Typed SQL that stays SQL, real migrations, no query-engine binary to ship to a serverless runtime. |
| Auth | First-party: scrypt + HMAC-signed httpOnly session cookies | No vendor lock-in, full control of audit logging and session revocation, portable to any Postgres. |
| Storage | `StorageDriver` abstraction; default `postgres` driver | Works with zero extra configuration and is private by construction. `supabase` and `vercel-blob` drivers are implemented behind the same interface. |
| AI | `AiProvider` abstraction; `anthropic` \| `openai` \| `heuristic` | The spec explicitly demands no permanent tie to one model. `heuristic` means the app is useful with no API key at all. |
| Jobs | Inline for small work; `job_runs` table + Vercel Cron for recurring | Avoids a queue dependency in the MVP while keeping a seam for one. |
| Deployment | Vercel (app), Supabase (Postgres) | Git-push deploys, edge CDN, serverless functions co-located with the DB region. |

## 2.1 Why not the obvious alternatives

**Why not Supabase Auth?** The available Supabase project already hosts an unrelated application.
Sharing `auth.users` across two products couples their user tables and their security postures. A
first-party session layer is ~200 lines, removes the coupling, and makes the app portable to Neon,
RDS, or Prisma Postgres by changing one environment variable.

**Why not Prisma?** Prisma ships a query engine binary and generates a client at build time; on
serverless this costs cold-start time and bundle size. Drizzle compiles to plain SQL.

**Why not a separate NestJS/Fastify backend?** Every financial aggregation already runs on the server
inside a React Server Component. Splitting the tiers would add latency and a second deployment for no
isolation benefit, because both tiers would hold the same database credentials.

**Why not float or `numeric` for money in the application layer?** JS has no decimal type. `numeric`
crosses the driver boundary as a string and gets coerced to a float by careless code. Storing
`bigint` minor units makes the failure mode impossible rather than merely discouraged.

## 2.2 Module map

```
app/                    Routes (App Router). Thin: auth-guard, fetch, render.
  (marketing)/          Public landing + legal
  (auth)/               sign-in, sign-up, onboarding
  (app)/                Authenticated shell
    overview/ transactions/ budget/ goals/ accounts/ analytics/
    calendar/ business/ imports/ assistant/ settings/
  api/                  Route handlers (upload, ai, export, files, cron)
lib/
  money/                Money type. Integer minor units. No I/O.          ← pure
  finance/              THE engine: ledger, budgets, goals, forecast,     ← pure
                        safe-to-spend, recurring, duplicates, insights,
                        scenarios, debt, networth, patterns
  db/                   Drizzle schema, migrations, scoped repositories
  auth/                 password, session, guards, rate limit
  ai/                   provider interface + drivers + prompts + schemas
  import/               parsers (csv, xlsx, pdf, image, frames), pipeline
  storage/              driver interface + postgres/supabase/blob drivers
  validation/           Zod schemas shared by API + forms
components/
  ui/                   Design-system primitives
  charts/               Recharts wrappers with tokens applied
  finance/              Domain components (money, category, account…)
```

**The rule that keeps this honest:** `lib/money` and `lib/finance` have **zero imports** from `app/`,
`lib/db`, or `lib/ai`. They take plain data and return plain data. That is what makes them testable,
and it is why every page can share one implementation of every number.

## 2.3 Data flow for a financial figure

```
RSC page  →  repository (workspace-scoped query)  →  rows
          →  lib/finance/* pure function          →  computed result
          →  component renders + links to the drill-down query
```

No figure is ever computed in a component. No figure is ever computed twice.

## 2.4 AI provider strategy

```ts
interface AiProvider {
  extractTransactions(input: ExtractionInput): Promise<ExtractionResult>  // structured, schema-validated
  answerQuestion(input: AssistantInput): Promise<AssistantResult>          // tool-calling over the ledger
  narrate(input: NarrationInput): Promise<string>                          // explains numbers it did NOT compute
  readonly capabilities: { vision: boolean; documents: boolean; tools: boolean }
}
```

Three drivers:

- **`anthropic`** (default when `ANTHROPIC_API_KEY` is set) — vision + document understanding + tool use.
- **`openai`** — same interface, for portability.
- **`heuristic`** (always available, no key) — genuinely functional for structured input: CSV/XLSX
  column inference, statement-line regex parsing, merchant normalisation, and rule-based
  categorisation from `merchant_rules` plus a seeded lexicon. It reports `vision: false`, and the UI
  disables image upload accordingly rather than pretending.

**Safety rule enforced in code:** `answerQuestion` cannot return a number the model invented. The
model is given *tools* that run real SQL aggregates; the numbers in the answer come from tool results,
and the response carries the tool calls so the user can verify. `narrate` receives pre-computed
figures and may only phrase them.

## 2.5 Ingestion pipeline

```
upload → hash (idempotency) → type detect → route to parser
   ├─ csv/xlsx      → deterministic parse → column mapping (inferred, user-confirmable)
   ├─ pdf (text)    → text extraction → line parser
   ├─ pdf (scanned) → page raster → vision provider
   ├─ image         → vision provider
   └─ video         → CLIENT extracted keyframes → vision provider
                                 ↓
             Zod validation (reject, never coerce silently)
                                 ↓
      normalise: dates → ISO, amounts → minor units, merchant → canonical
                                 ↓
          categorise: merchant_rules → lexicon → AI suggestion
                                 ↓
        duplicate score (deterministic, explainable, 0-100)
                                 ↓
           import_candidates  (nothing has touched the ledger yet)
                                 ↓
                  REVIEW UI  → accept / edit / merge / reject
                                 ↓
        transactions  (+ provenance row, + import batch link for rollback)
```

## 2.6 Video — the part most likely to be built wrong

Server-side video processing on Vercel is not viable: no ffmpeg in the runtime, a 4.5 MB request-body
limit on serverless functions, and hard execution-time caps. Uploading a private video of a banking
app to a server is also the worst privacy trade in the product.

**So the video never leaves the browser.**

1. `<video>` element decodes locally via `requestVideoFrameCallback`.
2. Sample at ~2 fps into an `OffscreenCanvas`.
3. Compute a **64-bit dHash** per frame; drop frames within a Hamming distance of 6 of the previous kept frame (scroll stalls, cursor movement, re-renders).
4. Keep a scroll-delta heuristic: if consecutive frames differ only by a vertical translation, keep both — that is new transaction content entering the viewport.
5. Downscale survivors to ≤1568 px on the long edge, encode JPEG q0.8.
6. Upload only those frames, tagged with their source timestamp range.
7. Server runs vision extraction per frame, then **stitches**: rows appearing in overlapping frames are matched on (date, amount, normalised merchant) and collapsed, with `sourceFrames: [118..143]` retained as provenance.

Result: a 90-second scroll recording typically yields 8–15 frames instead of 2,700, the video stays on
the device, and provenance still points at exact frames.

## 2.7 Background jobs

MVP work is inline (imports are interactive; the user is watching). Recurring work — recurring-expense
detection, net-worth snapshots, notification evaluation, monthly review generation — runs from
`app/api/cron/*` on Vercel Cron, guarded by a shared secret, and recorded in `job_runs` for
observability and idempotency. If a job outgrows the function limit, the seam to move it to a queue
worker is the `job_runs` row, not a rewrite.

## 2.8 Deployment & monitoring

- **App:** Vercel, GitHub-linked, production on the designated branch.
- **DB:** Supabase Postgres, `pockit` schema, `ca-central-1` (matching a CAD-primary user).
- **Migrations:** Drizzle SQL files, applied deliberately — never auto-applied on boot.
- **Monitoring:** structured JSON logging (`lib/log.ts`) with a request ID; `audit_logs` for security
  events; `ai_extractions` records every model call with token counts and latency for cost tracking;
  `/api/health` reports DB reachability and driver selection.
- **Errors:** route-level `error.tsx` boundaries; server errors log the cause and return an opaque ID.

## 2.9 Mobile progression (recommendation)

1. **Now — responsive PWA.** Installable, offline shell, camera capture via `<input capture>`, share
   target for "share a receipt to Pockit". Covers every action in §34.
2. **If needed — Capacitor wrapper.** Adds native share-sheet and background upload for ~a week of work,
   reusing 100% of the UI.
3. **Only if justified — React Native.** Warranted only by background sync or widgets. It means a
   second UI codebase; the shared `lib/finance` engine would move to a workspace package.

Do not start at 3.
