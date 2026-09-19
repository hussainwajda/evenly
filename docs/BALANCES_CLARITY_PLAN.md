# Evenly: Clear balances, two-person history & payment history (plan)

> Status: **built** (all 4 steps) · 2026-09-19 · builds on `GROUP_SPLITS_PLAN.md`
> Decisions: simplify is **group-wide** (no per-person toggle) and **off by default**; payment permissions as in §4.3; "Balanced out" label; private People entries can be linked to friends.

## 1. The problem

When people look at a balance like "Rahul owes Priya ₹450", they can't see **where the number came from**. That's what starts arguments. There are four causes in today's app:

1. **Simplify debts moves money between people who never shared a bill.** If A owes B ₹300 and B owes C ₹300, simplify shows "A pays C ₹300". A and C have never had a transaction together, and the app doesn't say why.
2. **Balances have no history.** Even with simplify off, "you owe Rahul ₹450" is a single number. You can't see the list of bills and payments that add up to it.
3. **Payments have no audit trail.** A payment record today stores only `from, to, amount, status`. It doesn't store:
   - **who recorded it** (you, the person who paid, or a third member)
   - **who confirmed it or said it wasn't received, and when**
   - **what it replaced** (if someone edited ₹500 down to ₹300, the old amount is lost)

   The server's activity log does record the actor, but only as a general feed, not per payment.
4. **Shares can show "settled" with no payment behind them.** With simplify on, anyone whose overall balance is ₹0 or better has all their shares shown as settled (`settledOverall`). The app also applies a general "settle up" payment silently to the oldest open bills. Either way, a share can turn ✓ and nobody knows why.

**Goal:** every number in the groups section can be tapped and traced back to the individual bills and payments behind it, with who did what and when.

---

## 2. Feature A: statement between two people

Tap any balance row, a member in People, or the new **"Between…"** filter to open a **statement for you and that person** (or any two members).

```
You  ⇄  Rahul                          Flat 402 · direct balance
────────────────────────────────────────────────────────────────
Filter: [All] [Bills] [Payments]   Sep 2026 ▾   ☐ show deleted

 3 Sep  Groceries ₹900 · you paid · Rahul's share ₹300    +₹300   ₹300
 5 Sep  Wifi ₹600 · Rahul paid · your share ₹300          −₹300     ₹0
 9 Sep  Dinner ₹1,200 · you paid · Rahul's share ₹400     +₹400   ₹400
12 Sep  Payment · Rahul → you · UPI · ✓ confirmed          −₹200   ₹200
         recorded by Rahul · confirmed by you (12 Sep 6:40 pm)
────────────────────────────────────────────────────────────────
Rahul owes you ₹200            ← exactly the number on the balance card
4 other bills in this group didn't involve money between you two.
[Share statement]  [Settle ₹200]
```

- **Each row shows how that bill or payment changed the balance, and the running total.** It uses the same maths as the direct (not simplified) balance, including how multi-payer bills are divided, so **the last line always equals the balance shown**. A test guarantees this for every pair.
- **Filters:** bills, payments or both · month or date range · show deleted items (greyed out, not counted) · search by title.
- **Share statement:** a WhatsApp or copy-text summary (and CSV) that you can send to the other person to settle an argument.
- **Friend view across groups (step 3):** the same statement for one person across **all** your shared groups, grouped by group, with a grand total. Matching is by their account, so it works across groups.
- **Optionally link a private People entry** (your old personal lend/borrow list, e.g. "Hussain") to that friend. Those private entries would then appear in the statement as a separate section marked **"Only you can see these"**. They're never uploaded to the group.

New pure function: `pairLedger(expenses, settlements, a, b) → rows[] { item, delta, running }`.

---

## 3. Feature B: "Why this amount?" for simplified balances

Simplify debts stays available, but it's no longer a black box.

- **Simplify stays a group-wide setting** (decided: no per-person toggle) and is now **off by default**, so new and existing groups show direct balances unless someone turns it on.
- **Tapping a simplified row** ("You pay Priya ₹300") opens an explanation:
  1. **Each person's total:** paid ₹X · their share ₹Y · payments sent · received = net.
  2. **Before → after:** the direct debts that were combined, e.g. "You owe Rahul ₹300 · Rahul owes Priya ₹300 → you pay Priya ₹300 directly and Rahul is clear." It's computed by following paths in the direct-debt graph, and it can be traced for any simplified payment.
  3. A line saying: **"Nobody pays more or less overall. Only the number of payments changes."**
- **Honest share statuses:** a share that's clear only because of simplify shows **"Balanced out"** (ⓘ explains) instead of ✓ Paid. A share covered by a general payment says **"Covered by Rahul's ₹500 payment on 12 Sep"** and links to that payment.

---

## 4. Feature C: payment history and audit trail

### 4.1 Data (backward compatible)

Add optional fields to each `Settlement`. Existing payments without them still work:

```ts
createdBy: string        // group-member id of whoever recorded it
createdAt: number
history: {               // appended on every change, never rewritten, max 50 entries
  at: number
  by: string             // member id
  action: 'recorded' | 'confirmed' | 'disputed' | 'edited' | 'deleted' | 'restored'
  amount?: number        // for 'edited': new amount
  prevAmount?: number    // for 'edited': old amount
  note?: string
}[]
```

- **Server (small SQL migration):**
  - `group_push` also logs `expenseId`, `method`, `prev_amount`, `from`, `to` in the activity summary.
  - The server already records the real actor (`auth.uid()`), so the history can't be faked from the phone, and the app can cross-check the two.
  - New read: `fetchRecordHistory(groupId, recordId)`, the server's activity rows for one payment or bill.
- **Older payments:** their history is rebuilt from the server activity log. It's shown when online and cached afterwards.

### 4.2 Screens

- **New "Payments" tab** in the group: `Expenses · Payments · Activity · People`.
  - Lists every payment, including disputed and deleted ones.
  - Filters: person (from/to) · status (waiting / confirmed / not received / deleted) · method · month.
  - A summary line on top: "₹4,200 settled this month · 1 waiting for confirmation · 1 disputed".
- **Payment details sheet:**
  ```
  ₹500 · Rahul → You · UPI · 12 Sep
  ● Recorded by Rahul ............. 12 Sep, 10:02 am
  ● Edited by Rahul: ₹600 → ₹500 .. 12 Sep, 10:05 am
  ● Confirmed by You .............. 12 Sep, 6:40 pm
  What it paid off:
    Groceries (3 Sep) ₹300  ✓ fully paid
    Dinner (9 Sep)    ₹200  of ₹400 (₹200 still open)
  ```
  **"What it paid off"** answers "why is my amount lower now". It comes from the same oldest-bills-first allocation that sets share statuses. `shareStatuses` gets refactored to also return which payment covered which share.
- **Bill details:** each person's status line names who did it: "Marked paid by Aaditya (cash) · 12 Sep", linking to the payment.
- **Activity feed:** entries name both people and the amount. For example, "Rahul recorded ₹500 to you" instead of "recorded a payment".

### 4.3 Rules to prevent disputes

- **Only the receiver** can Confirm or mark Not received.
- **Deleting a payment** is allowed only for the person who recorded it or the receiver. A deleted payment stays in history ("deleted by X") and can be restored.
- **Marking someone else's share as paid** (e.g. cash) is allowed only for the person who is owed. It's recorded as "marked by X".

---

## 5. Build order

| Step | What | Size |
|---|---|---|
| **1** | `pairLedger` + tests (running total = direct balance for every pair) · two-person statement screen (filters, share text/CSV) · open it from balance rows and People | ~2–3 days |
| **2** | "Why this amount?" explanation · simplify off by default (group-wide) · honest share labels (Balanced out / Covered by payment) | ~2 days |
| **3** | Payment audit fields + history + SQL migration · Payments tab with filters · payment details with timeline and "what it paid off" · permission rules · clearer activity text | ~3 days |
| **4** | Friend view across all groups · optional link to a private People entry | ~2 days |

Every step is tested (pure maths first), type-checked, and verified in the preview on phone and desktop layouts.

---

## 6. Decisions needed

1. **Per-person view toggle:** let each person switch Direct/Simplified for themselves, with the group setting only as the default? *(Recommended: yes.)*
2. **Payment permissions (§4.3):** only the receiver confirms or disputes, and only the recorder or receiver can delete? *(Recommended: yes. Today anyone can do anything.)*
3. **Shares cleared by simplify:** show "Balanced out" instead of ✓ Paid? *(Recommended: yes.)*
4. **Linking private People entries to friends (step 4):** wanted, or keep them fully separate?
