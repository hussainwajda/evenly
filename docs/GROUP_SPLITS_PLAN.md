# Evenly: Shared groups & splits (design)

> Status: brainstorm / design for review · 2026-09-19
> References: Splitwise (groups, split methods, simplify debts, settle up, activity) · Google Pay / PhonePe "split bill" (per-person paid status) · NPCI UPI rules (see §8)

---

## 1. What changes, in one picture

Today, a split in Evenly is **private**. "Hussain owes you ₹278" exists only on your phone, and Hussain never sees it.

With shared groups:

```
You add "Dinner ₹900, paid by you, split equally with Rahul & Priya" in group "Flat 402"
        │
        ▼
Shared group record (Supabase, visible only to group members)
        │
        ├──► Your Evenly:   expense "Dinner" ₹300 (your share) · Rahul owes you ₹300 · Priya owes you ₹300
        ├──► Rahul's Evenly: expense "Dinner" ₹300 · "You owe <you> ₹300"   ← added automatically
        └──► Priya's Evenly: expense "Dinner" ₹300 · "You owe <you> ₹300"   ← added automatically
```

- Every member gets **their own share as a personal expense automatically**, with category, date and "paid by". It counts toward their budget and dashboard like any other expense.
- Balances, "mark as paid" and settle-up are **shared**: when Rahul marks his ₹300 as paid, you see it, and you can confirm you received it.
- Edits and deletes update everyone's copy. Each change shows in an activity feed ("Priya changed Dinner from ₹900 to ₹960").

---

## 2. Features (Splitwise parity + UPI-style extras)

### Groups & people
| Feature | Notes |
|---|---|
| Create a group | Name, icon/emoji, type (Flat, Trip, Couple, Office, Other) |
| **Invite by link** | `https://<app>/join/<token>`. Share it on WhatsApp through the share sheet, or show it as a QR code in person. Links can expire, be limited in uses, and be revoked. |
| Join | Open the link, sign in with Google, see a preview ("Flat 402 · 3 members"), then **Join** |
| Placeholder members | Add "Rahul" before he joins (like Splitwise). When he joins via the link, he **claims** the placeholder and inherits its expenses. |
| Friends (1-to-1) | A friend is a 2-person group behind the scenes, so the same code serves both |
| Leave / remove | Only allowed when that person's balance is ₹0 (or the owner forces it, keeping history) |
| Profile | Display name, photo (from Google), **UPI ID** (used for settle-up, §5) |

### Adding a shared expense (from the existing + sheet)
- **Who:** choose "Just me" (today's personal expense), a **group**, or **friends**.
- **Paid by:** You · another member · **multiple payers** (e.g. you ₹600 + Rahul ₹300).
- **Split method:**

| Method | Example | Rule |
|---|---|---|
| Equally | ₹900 ÷ 3 = ₹300 each | Choose who's included. Paise are rounded fairly (largest remainder), so shares always add up to the total. |
| Exact amounts | ₹400 / ₹300 / ₹200 | Must add up to the total. Shows "₹20 left to assign" live. |
| Percentages | 50% / 30% / 20% | Must add up to 100% |
| Shares | 2 : 1 : 1 (a couple counts as 2) | Proportional |
| Adjustments | Equal, then +₹50 for Priya (extra dessert) | Equal split of the remainder |
| Itemized (later) | Line items assigned to people, with tax and tip spread proportionally | Phase 3 |

- **Presets:** "Split by 2 / by 3 / equally with everyone" as one-tap chips, and a remembered default per group.
- **Paid for someone else:** the payer isn't included in the split, so their share is ₹0 (like today's "For them").

### Balances, "Done" and settling up
- **Group balance card:** "You are owed ₹1,240", with a per-person breakdown.
- **Simplify debts** (per-group toggle, on by default): minimises the number of payments. If A owes B ₹100 and B owes C ₹100, that becomes A pays C ₹100.
- **Mark as done at two levels:**
  1. **Per expense, per person (UPI-split style):** each share shows a status, **Pending → Paid → Confirmed**. The person who owes taps "I've paid"; the person who paid taps "Received" to confirm, or can mark someone as paid for cash.
  2. **Settle up (Splitwise style):** record a payment of any amount, full or partial, from A to B. It's applied to the oldest open shares first, so their statuses update automatically.
- **Reminders:** "Remind Rahul" opens WhatsApp with a message listing what's pending. UPI payment requests can't be used any more; see §8.
- **Totals everywhere:** People/Groups screen: "You'll get ₹X · you owe ₹Y across all groups".

### Activity, comments, receipts
- A **per-group activity feed**: added, edited, deleted, paid, confirmed, joined, left. Each entry records who did it and when.
- **Comments** on an expense ("was the tip included?").
- **Receipt photo** on an expense (stored in Supabase Storage). Phase 2.
- **Undo delete** (soft delete, restorable for 30 days).

### Personal side (what makes it "Evenly" and not just Splitwise)
- Your share is added to **your** expenses automatically, with **your** category. You can re-categorise your copy without changing it for others.
- **My spend** counts your share only. **Money out** counts what you actually paid, same as today.
- Group expenses appear in Activity with a group badge, and in Home's category bars, budget and projection.
- Settlements **don't** count as spending. They move the People/Groups balances, same as today's lend/repay entries.

---

## 3. Architecture

Personal data stays exactly as it is: a local-first Dexie database synced to `kharcha_records`, which only you can read. Shared data gets its **own scope**: group records that every member can read.

```
┌──────────────────── Phone / Mac (PWA) ────────────────────┐
│ Dexie (local, offline-first)                               │
│  personal tables ──outbox──► kharcha_records (own rows)    │
│  group cache: groups, members, groupRecords                │
│  groupOutbox ──────────────► kharcha_group_push(group, …)  │
│  derived: my share of each group expense → transactions    │
│           (source='group', not uploaded as personal data)  │
└────────────────────────────────────────────────────────────┘
                    ▲ Realtime (per group)
┌─────────────────────── Supabase ──────────────────────────┐
│ profiles · groups · group_members · group_invites          │  relational + RLS by membership
│ group_records (expense | settlement | comment, JSON docs)  │  same last-write-wins + rev design as personal sync
│ RPCs: create_group, create_invite, preview_invite,         │
│       join_group, leave_group, remove_member,              │
│       claim_placeholder, kharcha_group_push                │
└────────────────────────────────────────────────────────────┘
```

**Why this design:**
- It reuses the proven sync engine (outbox, push/pull by revision, last-write-wins, Realtime), keyed by **group** instead of user.
- The security-critical parts (who's a member, invites, joining) are **real relational tables with RLS and server functions**, not client-writable JSON.
- It stays **offline-first**: add a group expense on a train with no network, and it's queued and uploaded later. Your personal copy of your share appears instantly.
- Each member's personal expense is **derived** on their own device from the shared record. Nobody writes into anyone else's private data, and privacy stays intact: members see group data, never each other's personal expenses.

### Server tables (Postgres)
```sql
profiles        (user_id pk → auth.users, display_name, avatar_url, upi_id, updated_at)
groups          (id uuid pk, name, icon, kind, simplify_debts bool, default_split jsonb,
                 created_by, created_at, archived_at)
group_members   (id uuid pk, group_id fk, user_id uuid null  -- null = placeholder
                 display_name, role 'owner'|'member', joined_at, left_at,
                 unique(group_id, user_id))
group_invites   (token text pk (random 22 chars), group_id, created_by, expires_at,
                 max_uses, uses, revoked_at)
group_records   (group_id, kind 'expense'|'settlement'|'comment', id text, data jsonb,
                 deleted bool, client_updated_at bigint, rev bigint (sequence),
                 updated_by uuid, server_updated_at, primary key (group_id, kind, id))
```
RLS: a user can read `groups`, `group_members` and `group_records` only where they are a member (`exists (select 1 from group_members where group_id = … and user_id = auth.uid() and left_at is null)`). Writes go only through the RPCs, which check membership.

### Shared record shapes (JSON)
```ts
GroupExpense {
  id, title, amount /*paise*/, categoryId, occurredAt, note, createdBy /*memberId*/,
  payers: { memberId, amount }[],                 // Σ = amount
  split:  { method: 'equal'|'exact'|'percent'|'shares'|'adjust',
            entries: { memberId, value }[] },      // the input, so it can be edited later
  shares: { memberId, amount }[],                 // computed result, Σ = amount
  receiptPath?, deletedAt?
}
Settlement {
  id, from /*memberId*/, to, amount, method: 'upi'|'cash'|'bank'|'other',
  occurredAt, note, expenseId? /* when it's a per-expense "mark paid" */,
  status: 'recorded' | 'confirmed', confirmedBy?, confirmedAt?
}
Comment { id, expenseId, memberId, text, createdAt }
```

### Local (Dexie v3)
- New tables: `groups`, `groupMembers`, `groupRecords` (cache), `groupOutbox`, `groupSyncState`.
- Transaction gets `groupId`, `groupExpenseId` and `origin: 'personal'|'group'`.
- Derived group rows are **skipped by the personal sync middleware**. Every device rebuilds them from the group cache, so they're never duplicated in the cloud.
- A local-only **category override** map stores your re-categorisation of a group expense.

---

## 4. Maths (pure functions, unit-tested like `split.ts`)

- `computeShares(method, total, entries)` → shares that always add up to the total exactly, using the largest-remainder method for paise.
- `memberNet(group)` → per member: Σ paid − Σ share − Σ settlements sent + Σ settlements received.
- `pairwiseDebts(group)` → who owes whom, without simplification.
- `simplifyDebts(nets)` → the classic greedy min-cash-flow: repeatedly match the largest creditor with the largest debtor. For n members this needs at most n−1 payments.
- `applySettlement(openShares, payment)` → allocates a payment to the oldest open shares between those two people (FIFO), producing each share's paid/partial status.
- Invariants tested: Σ nets = 0; balances are unchanged by simplify; editing an expense after a share was paid keeps the payment as credit and recomputes what's left.

---

## 5. Settling up with UPI (what's actually possible)

| Want | Allowed? | Evenly does |
|---|---|---|
| Send Rahul a UPI "payment request" | ❌ NPCI ended P2P collect requests on 1 Oct 2025 | A WhatsApp reminder with the amount and your UPI ID |
| Open GPay pre-filled to pay Rahul's UPI ID | ❌ UPI apps decline links to personal IDs (NPCI OC-76A) | Show Rahul's **UPI ID** with a **Copy** button, and an **Open UPI app** button that just launches the app so you can paste or scan |
| Pay in person | ✅ | Rahul shows **his** UPI QR from Evenly (built from his profile UPI ID and the amount), and you scan it with your UPI app. That's a normal scan-and-pay. |
| Record it | ✅ | When you return to Evenly: "Did ₹300 to Rahul go through?" → records the settlement as "I've paid" → Rahul confirms "Received" |

This reuses the "Scan → Pay → Confirm" idea from the original plan (§2 of `EXPENSE_PWA_PLAN.md`).

---

## 6. Screens

1. **People → "Groups & friends"**: group cards (icon, name, members, "you're owed ₹840"), friends list, and a totals header. "New group" button.
2. **Group page** (desktop: 2 columns):
   - Header: name, member avatars, "Invite"
   - Balance card, with **Settle up** and **Remind** buttons
   - Expense feed by month. Each row reads "Rahul paid ₹900 · you owe ₹300", with per-person status dots.
   - Tabs: Expenses · Balances · Activity · Settings
3. **Add/Edit expense sheet**: new "Split" step. Pick a group or friends, then **Paid by**, then **Split method** (segmented control with per-member inputs and a live "₹X left" counter), plus the "÷2 / ÷3 / Everyone" chips.
4. **Expense detail**: amount, payer(s), each member's share and status (Pending / Paid / Confirmed with actions), comments, receipt, history.
5. **Settle up sheet**: suggested payments from simplified debts, amount (editable for partial payments), method, UPI helpers (§5).
6. **Invite sheet**: link with copy/share, QR, expiry settings, pending placeholders.
7. **Join page** `/join/:token`: group preview, sign in with Google, "Join". If a placeholder matches your name: "Are you Rahul?", which claims it.
8. **Profile** (in Account): display name, UPI ID (validated `name@bank`), your QR.

---

## 7. Edge cases (decided up front)

- **Edits after payment:** the share recomputes and payments stay as credit. If someone has overpaid, the difference shows as "you owe back ₹X".
- **Deleting an expense that has payments:** allowed. Its payments become general settlements, so balances stay correct.
- **Concurrent edits:** the latest change wins per record, and the activity feed shows both.
- **Offline:** the queue retries with idempotent ids. Invites and joining need to be online (clear message).
- **Leaving with a balance:** blocked unless it's ₹0 or the owner overrides.
- **Placeholders never claimed:** they keep working as named people, like today's local People.
- **Existing local splits** (today's "Split with Hussain") stay personal. An optional "Move to group…" converts them.
- **Privacy:** group members see only group records. Personal budgets and expenses are never shared.
- **Invite abuse:** tokens are long and random, can expire and be revoked, joining requires sign-in, and there's a group size limit (e.g. 50).
- **Money:** always integer paise; shares always add up to the total; ₹ only (currencies later).

---

## 8. Phases

| Phase | Scope | Est. |
|---|---|---|
| **1. Core groups** | Profiles (+UPI ID), create group, invite link + QR, join, placeholders + claim; shared expense with equal/exact/percent/shares; single payer; your share added automatically to each member's expenses; balances + simplify debts; per-share Paid → Confirmed; settle up; activity feed; offline queue + Realtime; tests | ~2 weeks part-time |
| **2. Polish** | Multiple payers, adjustments, friends (1-to-1) view, comments, receipt photos, WhatsApp reminders, UPI QR/copy helpers, desktop 2-column group page, group CSV export | ~1 week |
| **3. Nice to have** | Push notifications (web push, Supabase Edge Function), itemized bills, recurring group expenses (rent split), group budgets & insights, multi-currency for trips | later |

---

## 9. Decisions needed from you

1. **Who can edit or delete a shared expense?** Any member, like Splitwise (recommended, with everything logged in activity), or only the person who created it?
2. **Is "Confirmed by receiver" required,** or is the payer's "I've paid" enough to settle? Recommendation: "I've paid" settles it immediately, and the receiver can dispute it.
3. **Simplify debts on by default** for new groups? Recommended: yes.
4. **Web push notifications in phase 1,** or phase 3? Push needs an extra Supabase Edge Function and permission prompts.
5. **Should today's People tab become "Groups & friends"**, keeping the private "lend/borrow" ledger inside it?
