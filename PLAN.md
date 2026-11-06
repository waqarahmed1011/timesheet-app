# Timesheet App: Build Plan

Status: draft for review. Nothing is built yet.

## 1. What we're building

A mobile-friendly web app (installable on a phone like an app, works offline) where workers and subcontractor foremen submit weekly timesheets, a Project Manager and then the GC approve them, and the office gets a dashboard, a permanent weekly archive, payroll exports, and certified payroll reports.

## 2. Decisions so far

| Topic | Decision |
|---|---|
| Pay week | Sunday through Saturday |
| Who submits | Workers submit their own, or a foreman/sub submits for the whole crew |
| Hours entry | Per day, per project, per work phase. Weekly total is calculated |
| Multiple projects | Yes, one weekly sheet can have rows for several projects |
| Approvals | PM approves first, then GC. Both signed and dated |
| Mistakes | Approver can reject with a comment, or edit directly (edit is logged with old value, new value, who, when, why) |
| After final approval | Locked. Admin can reopen with a reason, which restarts approvals |
| Payroll scope | Only your own employees. Subs' hours are tracked for job cost and verification, not paid through payroll |
| State | Illinois |
| Payroll outputs | CSV/Excel, gross pay calc, Gusto + QuickBooks formats, in-app tax/deduction calc, federal WH-347, Illinois IDOL certified payroll |
| Wage rates | Mixed: worker base rate on private jobs, project wage determination on prevailing wage jobs |
| Signatures | Workers draw with finger; approvers type name + click |
| Login | Google sign-in (plus a fallback, see section 9) |
| Scale | Under 50 workers, under 10 active projects |
| Extras in v1 | Email reminders, offline entry |
| Hosting | Free tier to start |
| Phases | Admin-managed list, optional cost codes |
| Maintenance | Claude, on request. So code must be simple and well tested, and all business data editable from admin screens |

## 3. Users and roles

| Role | Can do |
|---|---|
| Admin (you / office) | Everything: users, companies, projects, phases, rates, wage determinations, reopen locked sheets, run payroll, exports |
| GC Approver | Final approval on any project. Edit or reject |
| Project Manager | First approval on their assigned projects only. Edit or reject |
| Foreman / Sub admin | Submit crew sheets for workers in their company. See their own company's history |
| Worker | Submit and sign their own sheet. See their own history |

One person can hold more than one role (e.g. you as Admin + GC Approver).

## 4. Timesheet lifecycle

```
Draft -> Submitted -> PM Approved -> GC Approved (Locked)
            |              |
            +--- Rejected -+--> back to Draft (worker fixes, re-signs, resubmits)

Locked --(admin reopens with reason)--> Submitted (both approvals required again)
```

Rules:
- Worker signs at submit. Signature stores image, typed name, timestamp, IP, device, and the certification text they agreed to.
- An approver edit does not re-require the worker's signature, but the sheet shows "Edited by PM on 11/9: Tue Excavation 10 -> 8, reason: left early" and the worker gets an email.
- Any edit after PM approval sends it back to PM.
- Nothing is ever hard-deleted. Voided sheets stay in the archive marked void.

## 5. Data model (database tables)

- **companies**: your company + each subcontractor. Flag: `is_own_company`.
- **users**: name, email, phone, roles, company, active flag, preferred language.
- **workers**: links to a user (or not, for crew members with no login). Employee vs sub worker, trade classification, base hourly rate, address, last 4 SSN, demographics needed for Illinois certified payroll, W-4 and IL-W-4 data (only for own employees, encrypted).
- **projects**: number, name, address, county, type (`private`, `il_prevailing_wage`, `federal_davis_bacon`), assigned PM, start/end dates, active flag.
- **phases**: name, cost code, active flag. Optional `project_phases` to limit which phases a project allows.
- **wage_determinations**: per project + classification: base rate, fringe rate, overtime rules, effective dates (Illinois rates change mid-project, usually every June/July).
- **timesheets**: worker, week start (always a Sunday), status, submitted by, submitted at, worker signature, totals.
- **timesheet_entries**: timesheet, date, project, phase, classification, hours, start time, end time (required on certified projects, see 8.3).
- **approvals**: timesheet, step (PM / GC), approver, action (approve / reject / edit), typed signature, comment, timestamp.
- **audit_log**: every create/update/delete across the system: table, record, field, old value, new value, user, reason, timestamp. Append-only.
- **payroll_runs**: pay week, status (draft / final), created by.
- **payroll_lines**: worker, regular hours, OT hours, rate, gross, each deduction, net, per project/classification.
- **exports**: every generated file (PDF, Excel, CSV) stored with who generated it, when, and a checksum, so you can always pull the exact file you sent.
- **sub_certified_payrolls**: uploaded PDFs of subcontractors' own certified payroll per project per week (you're responsible for collecting these on public jobs).

## 6. Screens

**Worker / Foreman (phone first)**
1. Home: this week's sheet status, past weeks list.
2. Timesheet: week picker (Sun-Sat), add rows (project + phase), hours per day grid, start/end time when the project requires it, running totals.
3. Crew mode (foreman): pick workers, fill the same grid for each, or "copy Monday to all".
4. Review and sign: summary, certification text, signature pad, submit.
5. History: any past week, download PDF.

**Approvers**
6. Approval queue: filtered by project/week, shows flags (over 40 hours, missing days, edited, late).
7. Sheet detail: approve, reject with comment, or edit inline with required reason.

**Admin / Office**
8. Dashboard (section 7).
9. Weekly archive: every week, every sheet, status, bulk download.
10. Payroll: pick week, review regular/OT per employee, run calc, export.
11. Certified payroll: pick project + week, generate WH-347 / IDOL file, attach statement of compliance, store.
12. Setup screens: companies, users/workers, projects, phases, wage determinations, reminder schedule.
13. Audit log viewer: filter by sheet, user, date.

## 7. Dashboard

- This week: sheets expected vs submitted vs PM approved vs GC approved.
- Missing timesheets list with "send reminder" button.
- Hours by project and by phase (this week, last 4 weeks, project to date).
- Labor cost by project (hours x rate), own employees vs subs.
- Overtime watch: anyone over 40 or trending there.
- Pending approvals per approver, oldest first.
- Certified payroll status per prevailing wage project (generated? subs' uploaded?).

## 8. Payroll and certified payroll

### 8.1 Overtime
- Default Illinois rule: 1.5x after 40 hours in the Sun-Sat week, across all projects combined.
- **Correction to an assumption:** on Illinois prevailing wage jobs, overtime is set by the wage determination for each trade in that county, not just the 40-hour rule. Many trades get 1.5x after 8 hours a day, 1.5x on Saturday, 2x on Sunday and holidays. So OT rules are stored per classification in `wage_determinations`, and the calc applies whichever rule pays more.
- When an employee works private and prevailing wage hours in the same week, OT is assigned in date order and the rate used is the rate of the hours that go over. This is covered by unit tests.

### 8.2 Exports
- **Generic Excel/CSV:** employee, week, project, phase, regular, OT, double time, rate, gross.
- **Gusto:** Gusto's hours import CSV. I'll build to the template you download from your Gusto account so the column names match exactly.
- **QuickBooks:** QuickBooks Online has no plain CSV import for timesheets. Options: (a) let Gusto keep syncing to QuickBooks as it likely does now, (b) push time through the QuickBooks API (needs an Intuit developer app, OAuth, more setup), (c) QuickBooks Desktop IIF file if you're on Desktop. Recommendation: (a) first, (b) later if needed. Need to confirm whether you're on QuickBooks Online or Desktop.
- **Job cost report:** hours and labor cost by project and cost code, for both own employees and subs.

### 8.3 Certified payroll
- **Federal WH-347** filled PDF, plus the Statement of Compliance page, signed by admin.
- **Illinois:** monthly submission to IDOL's certified payroll portal. Illinois requires more than the federal form; per 820 ILCS 130/5 (verify current version before we build this phase) the record includes each worker's name, address, phone, last 4 of SSN, gender, race, ethnicity, veteran status, classification, hours **and starting and ending times** each day, hourly rate, fringe, and deductions. That's why start/end times are required on IL prevailing wage projects. I'll build the export to IDOL's current upload template.
- Subcontractors' certified payroll: upload slot per sub per project per week, with a dashboard flag when missing.

### 8.4 In-app tax and deduction calculation (you asked for this; my objection is below)
The app would calculate federal income tax withholding (IRS Pub 15-T), Social Security, Medicare, Illinois income tax (flat 4.95% minus IL-W-4 allowances), and any other deductions (union dues, etc.), then net pay.

**Why I think this is a mistake as a primary system:**
- You still pay Gusto to run payroll, file the 941s, IL-941, unemployment, W-2s. If the app also calculates taxes, you have two systems giving two different numbers for the same paycheck. The one that matters legally is the one that paid the worker, which is Gusto.
- A certified payroll that shows deductions different from what the worker was actually paid is a false certified payroll. That's a real legal exposure on public jobs, not a rounding issue.
- Tax tables change every January and sometimes mid-year. That becomes a recurring maintenance task you'd be asking me to do, with your workers' paychecks depending on it.

Think of it like keeping a second set of books by hand next to QuickBooks: it'll drift, and when an auditor asks which one is right, the answer is "the other one."

**What I'll do instead:** build it in Phase 4 in "shadow mode." The app calculates, then you upload Gusto's payroll register, and the app shows a side-by-side comparison. WH-347 / IDOL reports use Gusto's actual numbers by default. If after 6-8 weeks the app matches Gusto to the cent, we can discuss trusting it. If you still want the app to be the source of truth, that's your call, but you should make it knowing the above.

## 9. Login

Google sign-in as you asked, **plus email magic link as a fallback.** Reason: plenty of laborers don't have a Google account, use a work phone, or share a phone with family. If the only way in is Google, those people end up texting hours to the foreman, which is the problem you're trying to fix. Workers with no login at all can still be covered by foreman crew sheets.

## 10. Offline

The app is installable on the phone (PWA). Entries are saved on the device first and synced when signal comes back. Signing and submitting can happen offline; the submit time recorded is when they signed, and the server marks when it was received. Approvals require being online.

## 11. Reminders (email)

- Saturday evening: "Submit your timesheet for this week" to anyone without a submitted sheet.
- Monday morning: second reminder + list of missing sheets to their foreman and you.
- PM / GC: daily digest of sheets waiting on them.
- Worker: notice when their sheet is rejected or edited.

Email only on the free plan. Text messages cost money per message; can add later.

## 12. Tech stack

| Part | Choice | Why |
|---|---|---|
| App | Next.js + TypeScript | One codebase for frontend and backend, large ecosystem, easy for me to maintain |
| Database | PostgreSQL on Supabase (free tier) | Real relational database, good for payroll and audit data |
| ORM | Prisma | Schema and migrations in one file, readable |
| Auth | Auth.js with Google + email magic link | |
| Email | Resend (free, 3,000 emails/month) | |
| PDFs | pdf-lib (fill WH-347) + @react-pdf/renderer (timesheets) | |
| Excel | exceljs | |
| Signatures | signature_pad | |
| Offline | Service worker + IndexedDB | |
| Hosting | Netlify or Cloudflare free tier | See the warning below |
| Tests | Vitest (OT, week boundaries, approval rules, payroll math) + Playwright (end-to-end submit and approve) | |

### Free tier warnings (read these)
- **Vercel's free plan forbids commercial use.** You're a business, so either use Netlify/Cloudflare free, or pay Vercel $20/month. I've planned for Netlify/Cloudflare.
- **Supabase free pauses a project after 7 days with no activity** and has no point-in-time backups. Weekly use should keep it awake, but holidays could pause it.
- **The bigger issue:** once the app stores SSN digits, W-4 data and payroll figures (Phase 3/4), a free database with no real backup is not acceptable. One bad day and you've lost certified payroll records you're legally required to keep for years. Plan on Supabase Pro (~$25/month) before Phase 3 goes live. Until then I'll add a nightly backup export to a file you control.

## 13. Build phases

**Phase 1: Core timesheets (MVP)**
Setup screens, Google + magic link login, timesheet grid, worker and crew submission, drawn signature, PM then GC approval, reject/edit with audit log, locking and reopen, weekly archive, per-sheet PDF and weekly Excel download, basic dashboard.
Done when: one real project runs on it for 2 weeks in parallel with paper.

**Phase 2: Payroll hours + reminders + offline**
Rates, regular/OT calc, gross pay, Gusto CSV, generic Excel, job cost report, email reminders, offline mode.
Done when: the app's regular/OT hours for 2 pay weeks match what Gusto actually paid.

**Phase 3: Certified payroll**
Project types, wage determinations, classifications, start/end times, worker demographic fields, WH-347 PDF, IDOL export, Gusto payroll register import for deductions, sub certified payroll uploads. Upgrade database before go-live.
Done when: one month of IDOL submission produced from the app is accepted.

**Phase 4: In-app tax/deduction calc (shadow mode)**
As described in 8.4.

## 14. How you'll know it isn't working

- More than 1 in 5 workers still missing their sheet by Monday noon after the first 3 weeks: the login or entry flow is too hard. Fix that before adding anything else.
- PMs approving everything within seconds of opening it: they're rubber-stamping. The flags in the approval queue aren't doing their job.
- App OT hours differ from Gusto's for any worker in a pay week: stop and fix before trusting exports.
- You're still keeping a paper or Excel copy "just in case" after Phase 1 is done: something about the archive or downloads isn't trusted, and we should find out what.

## 15. Still open (need from you before or during Phase 1)

1. Company name and logo for the PDFs.
2. Starting list of work phases and cost codes, if you use cost codes.
3. Is there one GC approver or several? Same for PMs per project?
4. Submission deadline (e.g. Monday 10am) and what happens to late sheets.
5. Lunch: do workers enter net hours, or start/end with an automatic unpaid lunch deduction?
6. QuickBooks Online or Desktop?
7. A Gusto hours import template downloaded from your account.
8. One current Illinois prevailing wage project's wage determination, to test against.
9. Holidays you observe (affects prevailing wage OT).
