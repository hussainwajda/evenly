# Cloud sync setup (Supabase + Google sign-in)

Evenly works fully offline without this. These steps turn on **Continue with Google** and cloud sync. It takes about 15 minutes, and the free tiers are enough.

## 1. Create the Supabase project

1. Go to <https://supabase.com/dashboard> and create a new project. Pick the **Mumbai (ap-south-1)** region for the lowest latency in India.
2. Once it's ready, open **SQL Editor â†’ New query**.
3. Paste the whole file `supabase/migrations/20260915000000_kharcha_sync.sql` and click **Run**. This creates:
   - the `kharcha_records` table, with row-level security so each account only sees its own rows
   - the `kharcha_push` upload function, where the latest change wins
   - Realtime updates for that table

## 2. Create Google OAuth credentials

1. Open <https://console.cloud.google.com/> and create a new project, or pick an existing one.
2. Go to **Google Auth Platform â†’ Branding**:
   - App name: Evenly
   - Support email and developer contact: your email
3. Go to **Audience**: choose **External**, and add your Gmail as a **Test user**. You can publish the app later if other people will use it.
4. Go to **Clients â†’ Create client â†’ Web application**:
   - **Authorized JavaScript origins:** `http://localhost:5188` (dev), plus your deployed URL, e.g. `https://evenly.vercel.app`
   - **Authorized redirect URIs:** `https://<your-project-ref>.supabase.co/auth/v1/callback`
     (find the exact value in Supabase under **Authentication â†’ Sign In / Providers â†’ Google**)
5. Copy the **Client ID** and **Client secret**.

## 3. Turn on Google in Supabase

1. Go to Supabase **Authentication â†’ Sign In / Providers â†’ Google**: turn it on, paste the Client ID and secret, and save.
2. Go to **Authentication â†’ URL Configuration**:
   - **Site URL:** your deployed URL, or `http://localhost:5188` while developing
   - **Redirect URLs:** add `http://localhost:5188/**` and `https://<your-domain>/**`

## 4. Connect the app

1. In Supabase go to **Project Settings â†’ API Keys** and copy:
   - the **Project URL**
   - the **Publishable key** (`sb_publishable_â€¦`)
2. In the `kharcha` folder, copy `.env.example` to `.env.local` and fill in both values:
   ```
   VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
   ```
   Both are meant to be public, because row-level security protects the data. `.env.local` is git-ignored anyway.
3. Restart `npm run dev`, open **More â†’ Account & sync**, and tap **Continue with Google**.
4. For a deployed build, add the same two variables in your host's project settings (Vercel/Netlify â†’ Environment variables) and redeploy.

## 5. Turn on shared groups (Splitwise-style splitting)

1. In the Supabase **SQL Editor**, open a new query.
2. Paste the whole file `supabase/migrations/20260919000000_kharcha_groups.sql` and click **Run**. It adds:
   - profiles (your name and UPI ID)
   - groups, members, invite links, shared expenses and payments, and an activity log
   - row-level security, so only a group's members can see it
3. Invite links look like `http://localhost:5173/join/â€¦`. They're already covered by the `http://localhost:5173/**` redirect URL from step 3. For a deployed app, add `https://<your-domain>/**` too.

## How sync behaves

- **Offline first:** every change is written to the phone's database together with a queue entry, in one transaction. Nothing waits for the network.
- **When it syncs:**
  - right after sign-in
  - about 2 seconds after an edit
  - when the phone comes back online
  - when the app is reopened
  - every 5 minutes
  - immediately when another device changes something (Realtime)
- **Conflicts:** if the same expense is edited on two devices, the change made later wins, going by the device clock.
- **First sign-in on a phone:** everything already on it is uploaded. Default categories and settings never overwrite what's already in your cloud copy.
- **Signing in with a different Google account** on a phone that synced with another account asks whether to replace the phone's data, merge it into the new account, or cancel.

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Cloud database not set up (run the SQL migration)" | Run step 1.3 again in the SQL Editor. |
| Google says `redirect_uri_mismatch` | The redirect URI in Google must be exactly `https://<ref>.supabase.co/auth/v1/callback`. |
| After login you land on the wrong URL, or see "requested path is invalid" | Add your app's URL to Supabase **Redirect URLs** (step 3.2). |
| "Access blocked: app not verified" / not a test user | Add your Gmail as a test user (step 2.3). |
| Installed app opens Chrome for login and doesn't come back | Finish the login, then reopen Evenly from the home screen; the session is saved. |
| Something looks out of date | **Account & sync â†’ Re-download** fetches the full cloud copy again. |
