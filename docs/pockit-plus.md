# Pockit Plus — how to launch it

Plus is fully built but **switched off**. While `PLUS_ENABLED` is not `true`:

- every account gets everything, including unlimited Ask Pock;
- the app shows no Plus row, no paywall and no question counter.

Grow the free user base first. When you're ready to turn Plus on:

## 1. App Store Connect (≈ 15 min)
1. Enrol in the **App Store Small Business Program** (15% fee instead of 30%).
2. *Your app → Subscriptions →* create a group **Pockit Plus** with two products:
   - `pockit_plus_monthly` — e.g. $4.99/month
   - `pockit_plus_yearly` — e.g. $39.99/year
3. On each, add an **Introductory Offer → Free trial** (e.g. 1 month). This is
   what the paywall shows as "Start 1 month free". Apple only offers it once per person.

## 2. RevenueCat (free until ~$2.5k/month revenue)
1. Create a project, add the iOS app, connect it to App Store Connect.
2. Create an entitlement **plus** with both products, and an offering **default**
   with a Monthly and an Annual package.
3. *Integrations → Webhooks:* URL `https://<your-site>/api/mobile/revenuecat`,
   Authorization header = a long random string.

## 3. Switch it on
- **Vercel env:** `PLUS_ENABLED=true`, `REVENUECAT_WEBHOOK_SECRET=<the same string>`; redeploy.
- **App:** set `EXPO_PUBLIC_REVENUECAT_IOS_KEY` (RevenueCat → API keys → Apple) and
  build a new TestFlight version (`eas build -p ios --profile production`).

Purchases only work in TestFlight / App Store builds (not Expo Go). Test with an
App Store sandbox account first.

## What Plus changes
- Free: 5 Ask Pock answers a month (resets on the 1st). Plus: unlimited.
- Everything else stays free for everyone.
- The server decides who has Plus (from RevenueCat's webhook); the phone never does.
- Cancelling keeps Plus until the paid period ends.

To give someone Plus by hand (a tester, a friend):
```sql
UPDATE pockit.user_profiles SET plus_until = now() + interval '1 year', plus_source = 'manual'
WHERE user_id = (SELECT id FROM pockit.users WHERE email = 'them@example.com');
```
