# Trying Pockit on your iPhone

There are two ways. Start with **A** — it's free and takes about 10 minutes.

## Before either: put the latest server online
The app talks to your Pockit website, so the website needs this branch.
1. Vercel → your project → **Settings → Git** → Production Branch = `ios-app`
   (or merge `ios-app` into the branch Vercel deploys). Let it redeploy.
2. Vercel → **Settings → Environment Variables**, add:
   - `ADMIN_EMAILS` = your email (gives you admin mode: Plus, unlimited, Developer screen)
   - `PLUS_ENABLED` = `false` (Plus stays hidden from everyone else)
   Then **Redeploy** so they take effect.
3. Open `https://<your-site>/setup` once, so the new database changes (0006–0008) are applied.
4. (Optional) add Anthropic credit so Ask Pock answers.

## A. Expo Go — free, no Apple account (best for trying it out)
On your **computer** (Node.js 20+ installed):
```
git clone https://github.com/ishpreet-bal/Pockit.git
cd Pockit/mobile
npm install
cp .env.example .env
```
Edit `mobile/.env`: set `EXPO_PUBLIC_API_URL=https://<your-site>` and `EXPO_PUBLIC_PREVIEW=0`.
```
npx expo start --tunnel
```
On your **iPhone**: install **Expo Go** from the App Store, open the **Camera**, scan the
QR code in the terminal. Pockit opens inside Expo Go. Sign up or sign in with the
email you put in `ADMIN_EMAILS` → **More → Developer** appears.

Works in Expo Go: every screen, sign-in, real data, Face ID, test reminders.
Doesn't: the real app icon, and App Store purchases (those need build B).
Edits on your computer appear on the phone instantly while `expo start` is running.

## B. TestFlight — the real app, installable like any other ($99/yr Apple Developer)
1. Join the Apple Developer Program (developer.apple.com), wait for approval (≈ 1–2 days).
2. On your computer, in `Pockit/mobile`:
   ```
   npm install -g eas-cli
   eas login                      # free Expo account
   eas build --platform ios --profile production
   eas submit --platform ios
   ```
   Let EAS create the Apple certificates when it asks. Put `EXPO_PUBLIC_API_URL`
   in EAS too: `eas env:create --name EXPO_PUBLIC_API_URL --value https://<your-site>`.
3. App Store Connect → your app → **TestFlight** → add yourself (and friends) as testers.
4. Install **TestFlight** on your iPhone → Pockit appears → Install.
