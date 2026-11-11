# Launch checklist

The state of Pockit before its first App Store release. Tick things off here as they
are done. Last updated November 10, 2026.

## Step 0: fix the two-project mix-up on Vercel (do this first)

There are **two** Vercel projects building this same code:

| Project | Its address | Keys |
|---|---|---|
| **pockit-7xmx** (keep) | `pockit-7xmx-five.vercel.app` | Has your real `DATABASE_URL`, `AUTH_SECRET`, `ANTHROPIC_API_KEY`, `TWELVEDATA_API_KEY`, `ADMIN_EMAILS`… |
| **pockit** (remove) | `pockit-nine.vercel.app` | Every variable exists but is **empty**. Its logs say so: "DATABASE_URL… the variable EXISTS on this deployment but its value is empty". |

This is why your keys seemed to "stop working". The newer deployments went to the project whose values are blank.

- [ ] In **pockit-7xmx**: Settings → Git → **Production Branch** → `ios-app`. Then Deployments → redeploy the latest `ios-app` build to Production.
- [ ] In **pockit**: Settings → scroll down → **Delete Project**. Deleting it leaves the code and your other project alone, and nothing will build twice again.
- [ ] Open `https://pockit-7xmx-five.vercel.app` in a **private browser window**. If you see a Vercel login screen instead of Pockit, go to pockit-7xmx → Settings → Deployment Protection and set **Vercel Authentication** to **Only Preview Deployments**. The iPhone app and Apple's reviewers can't log in to Vercel.
- [ ] On your laptop, in `mobile/.env`, set `EXPO_PUBLIC_API_URL=https://pockit-7xmx-five.vercel.app` (not `pockit-7xmx.vercel.app`, which isn't yours). The App Store build already uses the right address (`mobile/eas.json`).
- [x] Run the database migrations (0009 to 0015 applied November 10).
- [ ] After each deploy that adds updates (now **0016** and **0017**), open `/setup` and run it again. Then `/api/health` should say `"rowLevelSecurity": "enforced by the database (authenticated)"`.

## Done

- [x] **Look around first works without signing up**, on the website and in the app.
  - It creates a guest account with sample money and starts the tour, and everything works for real.
  - Guests can't connect a bank or create shared spaces, and get a few AI answers a day.
  - **Create my account** deletes the guest and starts sign-up.
  - Leftover guests are removed daily (Vercel cron, needs `CRON_SECRET`).
- [x] **Sign-up asks Buddy-style questions**:
  - what brings you here, who you're budgeting for, pay, bills, where your money goes (becomes your first budget), what you have, what you're saving for, reminders
  - then next steps that fit your answers
- [x] **Plan a trip uses real cars**: the US EPA fuel-economy database, 50,303 vehicles from 1984 to 2027. The old demo menu, which offered a "Ford Camry", is gone.
- [x] **AI consent** (Apple 5.1.2(i)).
  - Before anything goes to OpenAI or Anthropic, Pockit names the company, says what is sent, and asks.
  - The server refuses AI calls without a yes, and asks again if you switch AI companies.
  - Changeable in Settings.
- [x] **Report a Pock answer**: every AI answer has "Wrong or unhelpful? Report".
- [x] **Feedback in the app**, emailed to `SUPPORT_EMAIL`.
- [x] Split expenses, delete account, privacy policy and terms, forgot password.
- [x] Row-level security actually enforced.
- [x] Website restyled to match the app.
- [x] Brand-orange icons.

## Keys in Vercel (project pockit-7xmx)

| Key | Needed for | Status |
|---|---|---|
| `DATABASE_URL`, `AUTH_SECRET`, `ADMIN_SECRET`, `ADMIN_EMAILS` | Everything | Set |
| `ANTHROPIC_API_KEY`, or `OPENAI_API_KEY` + `AI_PROVIDER=openai` | Pock, receipts, screenshot import | Anthropic set; add OpenAI if you want it |
| `TWELVEDATA_API_KEY` | Real stock prices | Set |
| `CRON_SECRET` | Daily bank sync and guest cleanup | **Add**: any long random string |
| `BANK_TOKEN_KEY` | Encrypts stored bank logins | **Add** before anyone connects a real bank: any long random string, then never change it |
| `RESEND_API_KEY`, `EMAIL_FROM`, `SUPPORT_EMAIL` | Forgot password, feedback emails, contact on /privacy | **Add** (needs your own domain for `EMAIL_FROM`) |
| `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV` | Bank connection | Sandbox keys to try it; production keys for real banks (see below) |
| `GOOGLE_MAPS_API_KEY` | Reliable trip search and routes | **Recommended**: without it, trips use free OpenStreetMap services that have no uptime promise |

Set each one for **Production** (and Preview, if you want previews to work too), then redeploy. Vercel only applies variable changes to new deployments.

## The App Store plan

Apple doesn't reject apps for being built with Claude or any other AI tool. It rejects apps that are thin, broken, or careless with privacy. How Pockit stands on each:

| What Apple rejects | Pockit |
|---|---|
| Thin wrapper, no unique value (4.2) | Budgeting, bills, safe-to-spend, split expenses, trips, goals and investing exist without the AI; Pock is one feature, not the app |
| Forced sign-up (5.1.1(v)) | Look around first: a full guest mode, no account needed |
| No account deletion (5.1.1(v)) | Settings → Delete account |
| Sharing data with third-party AI without asking (5.1.2(i)) | Consent screen naming the company, enforced by the server |
| AI content without safeguards | Pock is limited to your own numbers, says it gives no financial advice, and every answer can be reported |
| Privacy disclosures | `/privacy` lists every company that receives data, and why |
| Broken flows | Website suite passes 30/30, plus 360 unit tests and every app screen checked as a new user, a guest and a demo user. **You still need a few days on TestFlight on a real iPhone**, which is what Apple will use |
| HTTPS only (App Transport Security) | The app only talks to `https://…vercel.app` |

### Steps

1. [ ] Apple Developer Program ($99 USD/year), Individual.
2. [ ] In `mobile/`: `npx eas build -p ios --profile production`, then `npx eas submit -p ios`. Expo's servers build it, so no Mac is needed.
3. [ ] **TestFlight**: install it on your iPhone and use it daily for a week.
   - Go through: sign up, setup questions, add a purchase, split it, scan a receipt, Ask Pock (allow the AI), plan a trip, look around as a guest, delete an account.
4. [ ] Store listing.
   - Name (if "Pockit" is taken, try "Pockit: Budget & Bills"), subtitle, description and keywords.
   - Category Finance.
   - Screenshots: 6.9" and 6.5" iPhone.
   - Support URL and privacy URL `https://pockit-7xmx-five.vercel.app/privacy`, or your own domain once you have one.
5. [ ] **App Privacy** answers. Data collected and linked to the user, none used for tracking:
   - Contact info (name, email)
   - Financial info
   - User content (receipt photos, questions)
   - Identifiers (user id)
   - Coarse location only when planning a trip, not stored
6. [ ] **Review notes**, pasted into App Store Connect: *"No account is needed: tap 'Look around first' to explore with sample money. To test sign-in, use: [a demo email and password you create]. Pock (AI) asks for permission before sending anything to the AI provider; tap Allow to try it. Bank connection is not enabled in this version."*
7. [ ] Age rating questionnaire. The AI chat may count as an "AI assistant" question in the current form; answer honestly, since Pock is limited to money topics.
8. [ ] Submit. Review usually takes 1–3 days, and a first rejection with a fixable note is normal; reply in App Store Connect.

## Bank connection (Plaid)

Built and tested end to end (`e2e/bank.mjs` against a local stand-in for Plaid, `e2e/fake-plaid.mjs`):
connect on the bank's secure page, accounts and balances arrive, 180 days of transactions come in and are
categorised (your own "remember this" rules first, then Pockit's known merchants, then Plaid's category),
pending purchases wait until they post, the bank's corrections and removals are applied, a daily sync runs
by itself, an expired login shows **Sign in** and reconnects without doubling anything, and disconnecting keeps
your history. Safe to spend counts chequing minus what's owed on cards; savings isn't spending money.

- [ ] **Try it with Plaid's sandbox first.** Plaid dashboard → Developers → Keys. In Vercel (pockit-7xmx) add
  `PLAID_CLIENT_ID`, `PLAID_SECRET` (the **Sandbox** secret) and `PLAID_ENV=sandbox`, redeploy, then in the app:
  Accounts → Connect a bank → pick any bank → username `user_good`, password `pass_good`.
- [ ] **Test with your own bank for free**: Plaid's free **Trial plan** (new teams in the US and Canada) uses real
  production data. In the Plaid dashboard, request production access on the Trial plan, then in Vercel swap
  `PLAID_SECRET` for the **Production** secret and set `PLAID_ENV=production`, and redeploy. Check
  `/api/health`: it should say `"bankConnection": "production"`.
- [ ] **For the beta with real banks**: apply for Plaid production access (it needs the privacy policy URL,
  a sole-proprietor or company profile, and a description of the use), then swap in the **Production** secret and
  `PLAID_ENV=production`. Don't open the beta to other people while it's on sandbox: they'd see fake test banks.
- [ ] `CRON_SECRET` must be set for the daily bank sync (and the guest cleanup).

## Read these yourself

- [ ] `/privacy` and `/terms` match what the code does, but they aren't legal advice.
  - Confirm the governing law (written as Ontario).
  - Confirm the 30-day backup statement matches your Supabase plan.

## Worth doing soon after launch

- [ ] **Crash reporting** (Sentry): a crash on someone's phone is invisible to you today. Needs a free Sentry account.
- [ ] **Verify email at sign-up**, so a mistyped address doesn't lock someone out of password reset.
- [ ] **Database backups**: Supabase Pro (daily backups) for people's financial records.
- [ ] **Vercel Pro** once you charge for Plus (Hobby is non-commercial).
- [ ] **A domain of your own** (about $15/year): needed for `EMAIL_FROM`, and it looks more trustworthy than a `.vercel.app` address.
- [ ] Website setup still uses the older questions. The app's new ones are the main path.
- [ ] Split expenses on the website (totals there are already correct).

## Rough month plan

1. **This week**: Step 0 above, add `CRON_SECRET`, run migrations, enrol in the Apple Developer Program.
2. **Week 2**: first TestFlight build; use it daily. Apply for Plaid production.
3. **Week 3**: fix what you find, write the store listing, take screenshots, set up a review account.
4. **Week 4**: submit.

## Plan a trip: Google Maps

Without a key, Plan a trip searches places and routes with free OpenStreetMap services. They work, but nobody
promises they stay up. For launch:

1. [ ] Google Cloud console → create a project → enable **Places API (New)** and **Routes API**.
2. [ ] Credentials → Create API key → restrict it to those two APIs.
3. [ ] Vercel → `GOOGLE_MAPS_API_KEY` → redeploy. `/api/health` then shows `"maps": "google"`.

Google gives a monthly free allowance; set a budget alert in Google Cloud billing so nothing surprises you.

Fuel use comes from the EPA ratings of the exact car, or, for a car not in the list, from the median of real cars
with the same year, engine size, body and drivetrain. The gas price starts from a typical Canadian figure and
should be set to what the person actually pays (it's remembered).

## Automated checks (free, no Claude usage)

GitHub Actions runs these on GitHub's machines (`.github/workflows/`):

- **CI**, on every push: lint, typechecks (website and app), unit tests, and the end-to-end suites (website,
  bank connection, split with friends, trips) on a database set up like production.
- **Production health**, every six hours: checks `/api/health` and that the website and app load. A failure
  emails you (GitHub → Settings → Notifications → Actions). Run it by hand from the Actions tab any time.

Private repositories get a monthly allowance of free Actions minutes; these use a small part of it.

## What it costs to run (estimates, November 2026)

| Service | Now (testing, a few users) | At launch, charging for Plus |
|---|---|---|
| Apple Developer Program | US$99/year | US$99/year |
| Vercel (website + server) | Free (Hobby) | US$20/month (Pro; Hobby is non-commercial) |
| Supabase (database) | Free | US$25/month (Pro: daily backups, never pauses) |
| Plaid (bank connection) | Free Trial plan (real banks, a small number of connections) | Pay as you go, roughly US$0.25–0.60 per connected bank per month (check your Plaid dashboard) |
| Anthropic (Pock) | Pay per use: cents per conversation | Grows with use; set a monthly limit in the Anthropic console |
| Google Maps (trips) | Monthly free credit covers light use | Pay per use beyond it; set a budget alert |
| Resend (emails) | Free tier | Free tier until thousands of emails a month |
| A domain | about $15–20/year | same |
| RevenueCat (subscriptions) | Free | Free to a revenue threshold, then a small share |

Rough totals: **about $10/month** while testing (Apple's fee spread over the year), **about US$55–70/month plus
per-bank Plaid fees** once launched commercially.

## Users

`/admin` shows how many people have an account, new sign-ups (today, week, month, and a 30-day chart), how many
were active, banks connected, Plus subscribers, guests and deleted accounts. Counts only. It opens for the emails
in `ADMIN_EMAILS` (sign in on the website first); in the app, admins see **More → Pockit stats**.

## Getting paid for Pockit Plus (later)

Built but switched off (`PLUS_ENABLED`). Subscriptions inside an iPhone app go through Apple's in-app purchase:

1. App Store Connect → Agreements, Tax, and Banking: sign the Paid Apps agreement, add your bank account and tax
   forms. Apple pays out monthly.
2. Join the App Store Small Business Program (Apple keeps 15% instead of 30% while you earn under US$1M/year).
3. App Store Connect → your app → Subscriptions: create "Pockit Plus" (monthly and yearly prices).
4. RevenueCat (free account): add the app and the subscription, then set `EXPO_PUBLIC_REVENUECAT_IOS_KEY` for the
   app build and, in Vercel, `REVENUECAT_WEBHOOK_SECRET` (the same value in RevenueCat's webhook settings, pointed
   at `https://<your site>/api/mobile/revenuecat`).
5. Set `PLUS_ENABLED=true` in Vercel and ship a new app build.
