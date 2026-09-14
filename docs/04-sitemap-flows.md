# STEP 4 — Sitemap & User Flows

## 4.1 Sitemap

```
/                              Landing (public)
/sign-in  /sign-up             Auth
/onboarding                    5-step, skippable, resumable

/overview                      COMMAND CENTRE — the 5 answers
/transactions                  Ledger: filter, sort, bulk edit, saved views
  /transactions/[id]           Detail: splits, receipt, provenance, audit
/budget                        Active budget + per-category tracking
  /budget/methods              Choose/configure budgeting method
/goals                         Goal list + feasibility
  /goals/[id]                  Detail: required savings, scenarios, contributions
/accounts                      Balances, reconciliation, transfers
  /accounts/[id]               Account register with running balance
/analytics                     Spending by category/merchant/time, patterns, timeline
  /analytics/patterns          Weekend vs weekday, fixed vs variable, top merchants
  /analytics/timeline          Chronological financial narrative
  /analytics/networth          Assets, liabilities, history
  /analytics/scenarios         What-if engine
/forecast                      Cash flow 7/30/60/90 + Safe to Spend
/recurring                     Subscription dashboard + detection queue
/debts                         Balances + payoff simulation (avalanche/snowball/custom)
/investments                   Holdings, allocation, gain/loss
/calendar                      Paydays, bills, invoices, contributions
/paycheck                      Income schedule + allocation planning
/business                      Business dashboard (revenue/expense/profit/margin/AR)
  /business/invoices           Invoices + items
  /business/customers          Customers
  /business/vendors            Vendors
  /business/mileage            Mileage log
/imports                       Import history + rollback
  /imports/new                 Upload (drag-drop, camera, paste, video)
  /imports/[id]/review         REVIEW QUEUE — accept/edit/merge/reject
/assistant                     AI chat grounded in the ledger
/insights                      Deterministic insights + monthly review
/settings                      Profile, currency, categories, rules, privacy,
                               notifications, workspaces, data export, danger zone
```

## 4.2 Flow — Onboarding

```
Sign up → verify shape of use
  Step 1  Primary use: Personal / Business / Both   → creates 1 or 2 workspaces
  Step 2  Base currency + timezone
  Step 3  Income: schedule (weekly/biweekly/semimonthly/monthly/irregular) + approx amount
  Step 4  Accounts: name + type + current balance (any number, "Add later" allowed)
  Step 5  Goal (optional) + budgeting method (default: category)
→ Seeds the default category tree
→ Offers "Load demo data" so the app is non-empty immediately
→ /overview
```
Every step is skippable. Nothing blocks reaching the dashboard. Progress is persisted so a
half-finished onboarding resumes rather than restarting.

## 4.3 Flow — Add a transaction manually

```
⌘K or "+" → quick-add sheet
  amount (keypad on mobile) → merchant (autocomplete from merchants table)
  → category (pre-filled from merchant_rules if a rule matches)
  → account → date (defaults today) → [personal|business]
Enter saves. Toast with Undo.
Optional expand: notes, tags, tax relevance, split, attach receipt.
```
The merchant→category pre-fill is what makes manual entry fast: by the third Shell transaction, the
category is already correct.

## 4.4 Flow — Create a budget

```
/budget → no budget yet → method chooser with a one-line explanation of each
  Category        → per-category amounts, prefilled with the user's 3-month averages
  Percentage      → needs/wants/savings split, validated to 100%
  Zero-based      → every dollar of expected income assigned; live "unassigned" counter
  Savings-first   → savings target taken off the top; remainder becomes the spendable budget
  Fixed/variable  → recurring_series auto-populate the fixed side; the rest is discretionary
  Custom          → user-defined buckets and rules
→ Choose period (monthly default) → Review → Activate
```
Prefilling from actual history is the difference between a budget that gets used and one abandoned
after a week.

## 4.5 Flow — Create a goal

```
/goals/new → name, kind, target, target date, priority, funding account
→ System computes: remaining, months left, required monthly / biweekly / weekly
→ FEASIBILITY (§8): compares required savings against
     average income − average expenses over the trailing 3 months
   If short:  "This goal needs about $X more per month than your recent available cash flow."
   Then offers scenarios generated from the user's OWN largest discretionary categories:
     "Restaurants −$150, Shopping −$100, Subscriptions −$50 → available $2,200"
→ Reverse mode: "I can save $1,000/month" → projected completion date
```
Every scenario states its assumptions inline. Nothing is presented as financial advice.

## 4.6 Flow — Upload a screenshot (the flagship)

```
/imports/new (or drag anywhere, or ⌘V paste, or mobile camera)
→ file hashed; if already imported, offer the existing import instead of re-processing
→ type detected → "Reading your file…" with a real per-stage progress list
→ AI extraction → Zod validation → normalisation → categorisation → duplicate scoring
→ /imports/[id]/review
     Review table. Low-confidence fields are outlined and focused first.
     Duplicates grouped at the top with the score and the REASONS shown:
       "98% — same amount, same date, merchant 0.94 similar, same account"
       [Merge] [Keep both] [Reject]
     Keyboard: j/k move · Enter accept · e edit · d mark duplicate · a accept all confident
→ "Import 23 transactions" → committed atomically with an import_id on every row
→ Toast: "23 imported · Undo import"
```

## 4.7 Flow — Screen recording

```
/imports/new → Video tab
→ Browser decodes the video locally (a notice states it is not uploaded)
→ Frame extraction with a live preview of kept frames and a count
      "2,714 frames scanned · 11 unique screens kept"
→ User can drop irrelevant frames before anything is sent
→ Only the kept JPEGs upload → vision extraction per frame
→ Cross-frame stitching merges rows visible in overlapping frames
→ Standard review queue, with provenance "frames 118–143"
```

## 4.8 Flow — Business

```
Workspace switcher (top-left) → Business
/business shows revenue, expenses, profit, margin, cash flow, outstanding AR, top expense categories
Invoice: new → customer → line items → totals computed → send → mark paid
  Marking paid creates an `income` transaction in the business workspace, linked to the invoice.
Expense: any transaction can be classified personal / business / split.
  Split opens percent-or-dollar entry; the split must total exactly the transaction amount.
Receipt: upload → extracted → attached → tagged reimbursable / tax-relevant (user-confirmed)
```
The workspace switcher is always visible and colour-coded. Combined Overview is an explicit menu
choice, never a default.

## 4.9 Flow — Ask the assistant

```
/assistant → "How much did I spend on food last month?"
→ model selects a tool: query_spending({category:'Food', period:'last_month'})
→ tool runs real SQL in the user's workspace
→ answer renders the NUMBER from the tool result, with:
     • the filters it used, in plain language
     • a "View 34 transactions" link that opens the exact ledger query
```
If the model tries to answer without a tool call, the response is rejected and retried with a
tool-use requirement. Numbers always come from the database.
