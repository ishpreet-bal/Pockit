# Launch checklist

The state of Pockit before its first App Store release, from a full pass through the
website, the server and the iPhone app (October 24, 2026). Tick things off here as
they are done.

## Fixed in this pass

- [x] **Split expenses**: split a purchase N ways, or mark it paid for someone. Only your share counts in your budget, and Owed to you tracks paybacks.
- [x] **Delete account in the app** (Apple guideline 5.1.1(v)). It disconnects banks, and hands a shared space to another member instead of deleting it.
- [x] **Privacy policy and terms** at `/privacy` and `/terms`, linked from sign-up, Settings and the paywall.
- [x] **Forgot password**: one-hour, single-use email link (needs Resend, below).
- [x] **Row-level security is now enforced.** Production connects as a database role that skips RLS, so the policies never applied. Requests now run as `pockit_app` (migration 0012). This also fixed a policy loop and three places that broke under real RLS.
- [x] **The App Store build points at the live server.** Before, it would have tried `localhost`.
- [x] App icon, splash and Android icons redrawn in the brand orange (were the old purple).
- [x] Add a purchase showed the new-category box twice when you had several accounts.
- [x] The website test suite's sign-up helper had fallen behind the form.

Verified: 310 unit tests; the website smoke suite (30/30); the security suite, including 2FA; every app screen, as a new user and as a demo user; and the full flow under enforced RLS (sign-up, shared spaces, splits, bank sync, deletion).

## You need to do: before submitting

### 1. Deploy what's built
- [ ] Vercel → redeploy `ios-app`, then run the migrations (`POST /api/admin/migrate` with `ADMIN_SECRET`). That applies **0009 to 0013**.
- [ ] Open `/api/health` afterwards and check it reports no problems.

### 2. A domain of your own
- [ ] Buy one (about $15/year), for example `pockitapp.com`, and add it in Vercel → Domains.
- [ ] Set `APP_URL` to it, and change `EXPO_PUBLIC_API_URL` in `mobile/eas.json` to it.
- [ ] Needed because email has to come from a domain you own, and `pockit-7xmx.vercel.app` looks unofficial in the App Store.

### 3. Keys in Vercel

| Key | Needed for | Where |
|---|---|---|
| `OPENAI_API_KEY` + `AI_PROVIDER=openai` (or `ANTHROPIC_API_KEY`) | Pock, receipts, screenshot import | platform.openai.com |
| `RESEND_API_KEY`, `EMAIL_FROM` | Forgot password | resend.com: verify your domain, then create a key |
| `SUPPORT_EMAIL` | Contact line on /privacy and /terms | An address you read |
| `ADMIN_EMAILS` | Your admin access | your email |
| `TWELVEDATA_API_KEY` | Real stock prices (otherwise "sample prices") | twelvedata.com, free tier |
| `GOOGLE_MAPS_API_KEY` | Better trip search and routes (optional) | Google Cloud |
| `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV` | Bank connection, see below | dashboard.plaid.com |
| `REVENUECAT_WEBHOOK_SECRET`, `PLUS_ENABLED` | Only when you start charging | RevenueCat |

### 4. Bank connection (Plaid)
- [ ] **Don't launch with `PLAID_ENV=sandbox`**: real people would see fake test banks. Either leave the Plaid keys unset at launch (the app shows "coming soon"), or apply for Plaid **production** access first.
- [ ] Production access is reviewed by Plaid. It needs your privacy policy URL, a company or sole-proprietor profile, and a description of the use. Plaid charges per connected account; check current pricing.

### 5. Apple
- [ ] Apple Developer Program ($99 USD/year). Then App Store Connect → new app with bundle id `com.ishpreetbal.pockit`.
- [ ] `eas build -p ios --profile production`, then `eas submit`. Install it through **TestFlight** on your own phone and use it for a few days first.
- [ ] Store listing: screenshots (6.9" and 6.5" iPhone), description, keywords, category Finance.
  - Support URL: your site.
  - Privacy policy URL: `https://<domain>/privacy`.
- [ ] **App Privacy** answers. Collected and linked to the user, none used for tracking:
  - Contact info (name, email)
  - Financial info
  - User content (receipt photos, questions)
  - Identifiers (user id)
  - Coarse location only when planning a trip, and not stored
- [ ] **Review notes**: give Apple a demo login (an account with demo data loaded). Reviewers reject apps they can't sign in to.
- [ ] Age rating questionnaire (Finance, no objectionable content).

### 6. Read these yourself
- [ ] `/privacy` and `/terms` are written to match what the code does, but they aren't legal advice.
  - Confirm the governing law (written as Ontario).
  - Confirm the 30-day backup statement matches your Supabase plan.
  - If you can, have someone qualified glance at them.

## Should do: worth building before or soon after launch

- [ ] **Error monitoring** (Sentry or similar). Right now a crash on someone's phone is invisible to you. Needs a free Sentry account and its DSN key.
- [ ] **Hear about feedback.** "Send feedback" saves to the database only; nobody is notified. Once Resend is set up, email it to `SUPPORT_EMAIL`.
- [ ] **Verify email at sign-up.** A mistyped email means password reset can never reach that person.
- [ ] **Database backups.** Supabase's free plan has no point-in-time restore. For people's financial records, the Pro plan (daily backups) is worth it.
- [ ] **Vercel plan.** The free Hobby plan is for non-commercial use. Once Pockit charges for Plus, it needs Vercel Pro.
- [ ] **The website still uses the old look** (navy, different fonts). The app is cream and orange with DM Sans and Tinos. Either restyle the website or point people to the app.
- [ ] Split expenses work in the app only; the website shows correct totals but has no split button.
- [ ] Accounts screen in the app: show each account's balance.
- [ ] Export from the app (only the website can export today).
- [ ] Tests: the investing suite waits too briefly for search on a cold dev server, and the UI suite needs its fixture account (`ish@example.com`).

## Can wait

- Investing works and is clearly labelled "for learning"; real prices need the Twelve Data key.
- Android: the app is configured, but iPhone first is the right call.

## Rough month plan

1. **Week 1**: domain, Vercel keys, migrations, Resend, Apple Developer account.
2. **Week 2**: first TestFlight build; use it daily. Apply for Plaid production.
3. **Week 3**: fix what you find, write the store listing, take screenshots, demo account for review.
4. **Week 4**: submit. Review usually takes 1–3 days, and a first rejection with a fixable note is normal.
