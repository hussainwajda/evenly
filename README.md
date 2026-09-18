# Evenly

> Formerly "Kharcha". Internal names (the `kharcha` on-device database, `kharcha_*` Supabase tables, backup format) are unchanged on purpose, so existing data, backups and sign-ins keep working.

A personal expense tracker that replaces the `monthly expenses.xlsx` spreadsheet. It's an installable, offline-first PWA designed as a phone app with bottom navigation.

## Features (v1)

- **Monthly budget:** a total plus optional per-category limits. It carries forward to later months, and a custom month start day (e.g. salary date) is supported.
- **Add expense:** a bottom sheet with a large amount field.
  - Type `chai 12` and it fills in both the name and the amount.
  - Names autocomplete from your history, including their usual category, amount and payment method.
  - Categories are picked automatically: first from your own history, then from keyword rules built from 4 years of the spreadsheet.
  - The default payment method is **UPI · Navi**.
  - Also supports date/time, notes, "not counted in spend" (for deals) and a monthly repeat.
- **Borrow & lend:** split a bill, pay on someone's behalf, or record that a friend paid for you. You can also log money lent, borrowed, received or repaid.
  - Each person has a running balance, a settle-up button and a WhatsApp reminder.
  - Monthly spend counts **only your share**. "Money out" is shown separately.
- **Home analysis:**
  - Budget ring, amount left, safe spend per day and projected month-end total
  - Spending pace vs budget
  - Categories ranked against their budgets
  - Daily bars (tap a bar to open that day)
  - Comparison with last month at the same point
  - Most frequent items and payment method split
  - People balances and recent expenses
- **Recurring expenses:** rent, wifi, recharge and similar show up on Home when due. Add or skip each one with a tap.
- **Excel import:** reads the day-block sheets on the device.
  - Guesses the month and year of each sheet, and you can correct them.
  - Auto-categorises every cell.
  - Side notes (to pay, take/give, deals, cr/dr) go to a review list, where you can turn them into expenses or people entries.
  - A whole import can be undone.
- **Cloud sync with Google sign-in (optional):** the app is offline-first; every change saves on the phone and is queued in the same transaction.
  - When you're online and signed in, changes upload to Supabase and changes from other devices download, including instant updates via Realtime.
  - If the same item changes on two devices, the latest change wins.
  - Setup steps: [SUPABASE_SETUP.md](SUPABASE_SETUP.md). Without it, the app runs local-only.
- **Data safety:** data is stored on the device (IndexedDB) and the app requests persistent storage.
  - JSON backup: download it, or share it to Drive or WhatsApp. Restore replaces all data from a backup.
  - CSV export.
  - A weekly backup reminder.

## Tech stack

React 19, TypeScript, Vite 8, Tailwind CSS v4, shadcn/ui (Radix) + Vaul bottom sheets, lucide icons, Dexie (IndexedDB) with a sync-outbox middleware, Supabase (Postgres + Google OAuth + Realtime, lazy-loaded), Recharts, vite-plugin-pwa (Workbox), React Router 7, Zustand, SheetJS (lazy-loaded), Vitest + fake-indexeddb.

Requires Node 20.19+.

## Scripts

```bash
npm install
npm run dev        # http://localhost:5173 (add --port to change)
npm test           # unit tests (logic + database)
npm run build      # typecheck + production build with service worker
npm run preview    # serve the production build
npm run icons      # regenerate PWA icons from public/favicon.svg
```

## Install on your Android phone

The service worker, camera and install features need **HTTPS**, so deploy the `dist/` folder to any static host:

1. `npm run build`
2. Deploy `dist/`, for example with `npx vercel deploy dist --prod` or `npx netlify deploy --dir dist --prod`, or on Cloudflare Pages. SPA fallback to `index.html` is needed; Vercel and Netlify handle it automatically for Vite projects.
   Deep links such as invite links (`/join/<token>`) need the host to serve `index.html` for unknown paths. `vercel.json` (Vercel) and `public/_redirects` (Netlify) already do this. Cloudflare Pages does it automatically.
3. Open the URL in Chrome on Android, then tap **⋮ → Install app** (or use *More → Install Evenly* inside the app).

To try it on your phone over Wi-Fi without deploying, run `npm run dev` and open `http://<your-PC-IP>:5173`. Installing and offline mode need HTTPS, though.

## Project structure

```
src/
  lib/          pure logic, unit-tested: money, dates/cycles, quick-add parser, categoriser,
                month stats, ledger balances, split maths, Excel sheet parser
  db/           Dexie schema, data functions, backup/CSV, import commit (+ tests)
  hooks/        live-query data hooks, theme
  stores/       UI state (selected month, open sheets)
  components/   app shell, bottom nav, sheets, charts, shared parts; ui/ = shadcn
  pages/        Home, Activity, People, Person, More, Budget, Categories,
                Payment methods, Recurring, Settings, Backup & export, Import
```

Money is stored as integer paise, and timestamps as epoch milliseconds.

## Future scope

- **Scan & pay with UPI (Android only):** scan a QR code in the app, open the chosen UPI app, and confirm when you come back to log the expense.
  - Since NPCI's OC-76A rule (April 2024), UPI apps decline link-based payments to personal and non-verified QR codes.
  - Browsers get no payment result back, so the flow is designed around confirming after returning to the app.
  - See `EXPENSE_PWA_PLAN.md` §2 for the research and the test plan.
- Sharing receipts into the app (Web Share Target)
