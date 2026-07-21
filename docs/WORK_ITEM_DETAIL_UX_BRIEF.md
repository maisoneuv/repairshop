# UX Brief — Work Item (Repair Order) Detail Page

**Audience:** UX designer sketching a new prototype. No knowledge of the data model required — every piece of information referenced here is available to the page.
**Date:** 2026-07-19

---

## 1. What this page is

A **work item** is one repair order: one customer, one device, one job — from the moment the device arrives until it's repaired, paid for, and back in the customer's hands. The detail page is the single place where staff work on that order.

**The one design goal:** at any moment, anyone opening this page must be able to answer, within 3 seconds:

> **"Whose move is it, and what exactly is that move?"**

Everything else on the page is supporting material.

## 2. Who uses it

| User | Cares about | Typical moment |
|---|---|---|
| **Technician** | The device, the fault, the fix. What work is on their plate. | At the bench, often on a tablet. |
| **Customer service (CS)** | The customer, money, communication, handover. | At the front desk with the customer standing there, or on the phone. |
| **Manager** | Is anything stuck or overdue? | Scanning, not reading. |

Both technician and CS see the **same page** — the page adapts by highlighting *their* next action, never by hiding information.

## 3. The lifecycle (order of stages)

Every order moves through these stages. Stage names may be customized per company, but the shape is fixed:

```
New → Diagnosis → Quote sent → Approved → (Waiting for parts) → In repair
    → Quality check → Ready for return → Closed
                                        ↘ Cancelled (possible from any stage)
```

Two branch rules the design must handle:

- **Warranty repairs skip money:** no quote, no approval, no payment. The pipeline visibly skips those stages (they should appear disabled/absent, not just greyed out mid-flow).
- **Declined quote → Cancelled:** the customer said no. The order still needs the device returned before it can close — cancellation is a mini-flow, not a dead end.

## 4. Page anatomy (top to bottom)

```
┌──────────────────────────────────────────────────────────────────┐
│ A. HEADER  RMA-1042  [Express]  ⚠ Due in 2 days                  │
│    Anna Kowalska · iPhone 13 Pro · at: Partner shop "FixLab"     │
│    ○──●──●──○──○──○──○──○   (stage pipeline, current stage lit)  │
├──────────────────────────────────────────────────────────────────┤
│ B. NEXT ACTION PANEL                                             │
│    Waiting on: CUSTOMER — quote sent 2 days ago                  │
│    To advance:  ✓ price estimated   ✗ customer decision recorded │
│    [ Record customer decision ]   [ Resend quote ]               │
├───────────────────────────┬──────────────────────┬───────────────┤
│ C. WORK CONTEXT (left)    │ D. EXECUTION (center)│ E. MONEY &    │
│    Device card            │    Task checklist    │    LOGISTICS  │
│    Reported issue         │    Activity timeline │    (right)    │
│    Condition at intake    │                      │    Statement  │
│    Diagnosis findings     │                      │    Journey    │
├───────────────────────────┴──────────────────────┴───────────────┤
│ F. TABS: Details (default, = C+D+E) · Parts · Documents · Emails │
└──────────────────────────────────────────────────────────────────┘
```

### A. Header — identity & orientation

Always visible (sticky on scroll):

- **Order number** (e.g. RMA-1042) — the thing everyone quotes on the phone.
- **Priority badge** only when Express. Standard priority shows nothing.
- **Due date** with urgency treatment: neutral normally, warning when close, alert when overdue.
- **Customer name** (links to customer) and **device** (model + short identifier).
- **Where the device physically is right now** — front desk / our workshop / in transit / at partner shop (named). This is the #1 phone-call question; it must not be buried.
- **Stage pipeline (stepper):** all stages in order, current one highlighted, completed ones checked, skipped ones (warranty) absent. Clicking a *legal next* stage advances the order; illegal jumps aren't clickable. Hovering a completed stage shows when it happened and who did it.

### B. Next Action panel — the centerpiece

One card, directly under the header. Never empty, never generic. Three elements:

1. **"Waiting on: ___"** — one line naming who owes the move: a role (technician, customer service), the **customer**, or the **partner shop**. Include how long they've been waiting ("for 2 days") — waiting time is the pressure gauge.
2. **Advance checklist** — the concrete conditions to leave the current stage (see §5 for the exact list per stage). Each unmet item is a link that scrolls/jumps to where you fix it.
3. **Primary action button(s)** — the single most likely next action for the *viewer's role*, prominent. One primary button; secondary actions smaller. The exact buttons per stage and role are in §5.

### C. Work context (left column) — technician's zone

- **Device card:** photo (from intake pictures), make/model, serial/identifier, warranty badge if applicable (with claim number and purchase date).
- **Reported issue** — what the customer said is wrong.
- **Condition at intake** — scratches, cracks, etc. (protects the shop from disputes).
- **Accessories received** — charger, case, box…
- **Diagnosis findings** — what the technician found (appears from the Diagnosis stage onward; before that, show an empty state: "No diagnosis yet").
- **AI summary** of the order, when available — collapsed by default.

### D. Execution (center column)

- **Task checklist:** the order's tasks (diagnosis, repair steps, quality check, customer calls…), each with type, assignee, status, due date. The task that currently **blocks stage progress is pinned on top** and visually marked as blocking. Completed tasks collapse.
- **Activity timeline:** one merged, reverse-chronological stream of *everything* — stage changes (who, when), notes, emails sent, payments recorded, tasks completed, device movements. This answers "did we ever tell the customer?" without hunting through tabs. Filter chips: All / Notes / Emails / Payments / Status.
- **Add note** input at the top of the timeline — writing a note must be one click, zero navigation.

### E. Money & logistics (right column) — CS's zone

**Settlement statement** — not loose fields, a statement:

```
Estimated price      450.00 PLN
Final price          480.00 PLN
Prepaid             −100.00 PLN
─────────────────────────────
BALANCE DUE          380.00 PLN   ● unpaid
```

- **Balance due is the hero number** — big, color-coded (red unpaid / green settled). It's what CS needs when the customer is at the counter.
- Below it: payments received (amount, method, when, which register).
- For **warranty repairs** this whole panel collapses to a "Warranty — no charge" badge.

**Journey panel** — logistics as a 3-leg trip, current leg highlighted:

```
Intake:  drop-off in person → Main Street shop   ✓ done
Repair:  at partner "FixLab"                     ● now
Return:  courier → customer address              ○ upcoming
```

### F. Tabs

- **Details** (default) = the layout above.
- **Parts** — parts/inventory used, with count badge.
- **Documents** — intake photos, signed forms, invoices; count badge.
- **Emails** — full email history + compose; count badge. (Sent emails also appear in the timeline; the tab is the full-fidelity view.)

## 5. Stage-by-stage specification

This is the heart of the brief. For each stage: who owes the move, what the **advance checklist** shows (all items must be met to move on), and the **primary button per role**. "CS" = customer service.

---

### 🆕 New — device just registered

- **Waiting on:** Customer service / Manager
- **Show prominently:** device + condition + accessories (verify intake was captured), intake photos, due date.
- **Advance checklist:** ▢ technician assigned ▢ device physically received (location = our shop) ▢ reported issue filled in
- **Primary action — CS/Manager:** `Assign technician & start diagnosis`
- **Primary action — Technician:** `Start diagnosis` (self-assign)

### 🔍 Diagnosis — finding out what's wrong

- **Waiting on:** Technician
- **Show prominently:** reported issue, condition at intake, diagnosis task.
- **Advance checklist:** ▢ diagnosis task completed ▢ findings written ▢ estimated price entered *(skip price for warranty)*
- **Primary action — Technician:** `Complete diagnosis` (one flow: enter findings + estimated price + mark task done)
- **Primary action — CS:** none — show "Waiting on technician since ___".
- **Branch:** warranty orders go straight to **Approved/In repair** after diagnosis.

### 📨 Quote sent — waiting for the customer

- **Waiting on:** the Customer (after CS sends the quote)
- **Show prominently:** estimated price, when the quote was sent, **days waiting** (escalating urgency after e.g. 3 days), customer phone/email click-to-contact.
- **Advance checklist:** ▢ quote sent to customer ▢ customer decision recorded
- **Primary action — CS:** `Send quote` (opens email composer pre-filled with quote template) → then `Record customer decision` (Approve / Decline + reason)
- **Primary action — Technician:** none — "Waiting on customer".
- **Branch:** Decline → **Cancelled** flow (§ below), device must still be returned.

### ✅ Approved — green light

- **Waiting on:** Technician / Manager
- **Show prominently:** approved price (now locked as the agreed amount), prepayment if any.
- **Advance checklist:** ▢ parts availability confirmed (either "no parts needed" or parts reserved/ordered)
- **Primary actions — Technician:** `Start repair` · `Order parts` (moves to Waiting for parts)

### 📦 Waiting for parts *(optional stage)*

- **Waiting on:** Supplier (external)
- **Show prominently:** which parts, expected arrival date, days waiting.
- **Advance checklist:** ▢ all parts received
- **Primary action — Technician/Manager:** `Parts received — start repair`

### 🔧 In repair

- **Waiting on:** Technician — or **Partner shop** if the repair is outsourced.
- **Show prominently:** repair tasks; for partner repairs: partner name, device location / transit state, days at partner.
- **Advance checklist:** ▢ all repair tasks done ▢ (partner) device back from partner
- **Primary action — Technician:** `Mark repair complete`
- **Primary action — CS (partner case):** `Log device sent to partner` / `Log device received back`

### 🧪 Quality check

- **Waiting on:** Technician (ideally a different one than the repairer — nice-to-have, not enforced)
- **Show prominently:** what was repaired, QC task.
- **Advance checklist:** ▢ quality-check task done ▢ **final price set** *(skip for warranty)*
- **Primary action — Technician:** `Pass quality check` · secondary `Fail — back to repair`

### 🛎 Ready for return — the money-and-handover stage

- **Waiting on:** CS first (notify), then the Customer (collect).
- **Show prominently:** **BALANCE DUE** (hero), customer notified yes/no + when, days since notified, return method (pickup in person vs. courier), pickup location.
- **Advance checklist:** ▢ customer notified ▢ balance paid in full ▢ device handed over / shipped
- **Primary actions — CS**, in order as each completes: `Notify customer` (email/SMS template) → `Record payment` (amount, method, register) → `Confirm handover` / `Create shipment`
- **Primary action — Technician:** none.
- This stage is designed for the counter moment: customer standing there, CS needs balance due + handover in two clicks.

### 🏁 Closed — done

- Page becomes **read-only summary**: total paid, margin (final price vs. repair cost — visible to Manager only), total duration, per-stage durations, link to invoice.
- Single action: `Reopen` (Manager only, asks for a reason).

### 🚫 Cancelled — from any stage

- **Must capture:** cancellation reason (required, short picklist + free text).
- **If the device is still at the shop:** the Next Action panel stays alive with one job: return the device. Checklist: ▢ customer notified ▢ device returned. Show any diagnostic fee due, if the company charges one.
- Visual: muted/grey treatment overall, but *not* an error state — cancellations are routine.

---

## 6. Cross-cutting design rules

- **Same page, role-aware emphasis.** Never hide data by role; only the *primary button* and panel ordering adapt. (Technician on tablet: work context first. CS: money & logistics first. On desktop both are visible anyway.)
- **Waiting time is the universal pressure signal.** Wherever we say "waiting on X", show for how long, and escalate visual urgency at sensible thresholds.
- **Every checklist item is a link** to the exact spot where it gets fixed — no dead-end "you can't do this yet" messages.
- **Status can always also be changed manually** (the stepper), for edge cases the buttons don't cover — but the checklist warns when advancing with unmet items ("Advance anyway?" confirmation, reason logged).
- **Mobile/tablet:** columns stack in role-relevant order; header + Next Action panel stay sticky. Technicians will use this at the bench.
- **Empty states teach the flow:** e.g. Diagnosis findings before diagnosis = "The technician's findings will appear here once diagnosis starts."
- **Never color alone** for status meaning — always color + label/icon.

## 7. Out of scope for this prototype

- The customer-facing status page (future idea; the stage model is designed to support it).
- Editing the stage pipeline itself (admin settings, separate screen).
- The work item *list/board* views — this brief covers only the detail page.

## 8. Open questions for the designer to explore

1. Stepper with 8+ stages on mobile — horizontal scroll, condensed dots, or "stage 4 of 8" summary?
2. Should the Next Action panel merge *into* the header as one unit, or stay a separate card? (Sticky behavior favors merging.)
3. Where does `Record customer decision` live best — button in the panel, or inline on the quote block in the money column?
4. Timeline density: expanded entries vs. one-line entries with expand-on-click.
