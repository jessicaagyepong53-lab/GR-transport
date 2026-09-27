# GR-Transport Fleet Performance Dashboard

A self-hosted web dashboard for tracking a truck-transport business: weekly income and expenses per truck, driver assignments, supervisor salary payments, quarterly income tax, truck purchase/payment tracking, and year-over-year performance reporting all backed by MongoDB with a single-PIN admin login.

---

## 1. What this system does

- **Dashboard** (`index.html`) — fleet-wide KPIs, monthly/yearly charts, break-even tracking per truck, a heatmap of net income by truck × year, and a payment tracker for newly purchased trucks.
- **Weekly Entry** (`weekly.html`) — enter gross income, maintenance cost, and other expenses per truck per ISO week. Drafts are saved locally so unsaved work survives a page refresh.
- **Reports** (`reports.html`) — year-filterable summary (gross/net/expenditure), truck ranking, an annual summary table, the 26-trucks purchase balance tracker, quarterly income tax, supervisor salary payments, and CSV/JSON export.
- **Settings** (`settings.html`) — driver assignments, per-truck cost configuration, adding new trucks, PIN reset via a recovery key, and a reference-file library (insurance docs, receipts, etc.).
- **Recovery Bin** (`recovery.html`) — anything deleted (trucks, year entries, weekly entries) is soft-deleted and recoverable for 30 days before automatic permanent removal.
- **Truck Detail** (`truck.html`) and **Driver Performance** (`driver.html`) — per-truck/per-driver drill-down views.
- **Year Spreadsheet** (`year.html`) — a spreadsheet-style editor for a single year's truck/monthly/expense data.

### Access model

The system has exactly one admin role, unlocked with a single PIN (`/api/auth/verify`). Logged-out visitors get a **read-only** view — inputs are disabled and admin-only buttons are hidden via the `data-admin-only` / `data-admin-input` attributes, enforced client-side in `auth-modal.js` / `auth.js` and server-side via `requireAdmin` middleware on every write route. If the PIN is lost, it can be reset with a separate `RECOVERY_KEY` environment variable (`POST /api/settings/pin/reset`).

---

## 2. Tech stack

| Layer | Technology |
|---|---|
| Backend | Node.js, Express 4 |
| Database | MongoDB via Mongoose |
| Auth | JWT stored in an httpOnly cookie, single shared admin PIN |
| Frontend | Plain HTML/CSS/JS (no build step), Chart.js for charts |
| File uploads | Multer (in-memory, stored as binary in MongoDB) |
| Security middleware | Helmet (CSP), CORS, cookie-parser |
| Deployment | Vercel (`vercel.json`) or any Node host (`render.yaml` included for Render) |

---

## 3. Project structure

```
├── index.html              # Main dashboard
├── weekly.html             # Weekly income/expense entry
├── reports.html            # Reports & export
├── settings.html           # Admin settings
├── recovery.html           # Recovery bin (soft-deleted items)
├── truck.html               # Single-truck detail view
├── driver.html               # Single-driver performance view
├── year.html                # Year spreadsheet editor
├── all-equipment.html       # Equipment Hire: direct-link entry point (see §10)
├── mixers.html               # Equipment Hire: full dashboard
├── mixer-reports.html         # Equipment Hire: reports & utilization
├── mixer-clients.html          # Equipment Hire: client history
├── mixer-recovery.html          # Equipment Hire: recovery bin
├── mixer-settings.html           # Equipment Hire: PIN settings
├── src/                     # Frontend JS (one file per page + shared helpers)
│   ├── api.js               # Shared fetch wrapper + auth helpers
│   ├── auth-modal.js        # PIN login modal + admin UI toggling
│   ├── auth.js              # Lightweight auth check for sub-pages
│   ├── nav.js                # Injects the sidebar nav on every page
│   ├── mixer-nav.js           # Injects the Equipment Hire sidebar nav + page gating (see §10.2)
│   ├── mixer-frontend.js       # mixers.html logic (equipment, contracts, payment/return modal)
│   ├── dashboard/reports/weekly/settings/recovery/truck/driver/year.js
├── server/
│   ├── index.js              # Express app setup, route mounting, error handling
│   ├── config/db.js          # MongoDB connection
│   ├── middleware/auth.js    # requireAdmin, PIN storage, touchLastSaved, etc.
│   ├── middleware/rateLimit.js # Shared login/reset lockout logic (Truck Dashboard + Equipment Hire)
│   ├── models/                # Mongoose schemas (Truck, YearEntry, WeeklyEntry, Equipment, Contract, …)
│   ├── routes/                # One router per resource (see §5, §10.3)
│   ├── utils/errors.js        # Shared AppError class, asyncHandler, validators
│   ├── utils/contractHelpers.js  # Pure payment/client-history logic (see §10.6), unit tested
│   ├── utils/equipmentHelpers.js # Pure utilization logic (see §10.6), unit tested
│   └── seed.js                # Non-destructive seed script (see §6)
├── server.js                  # Local dev entrypoint (node server.js)
├── render.yaml                 # Render.com deployment config
└── vercel.json                  # Vercel rewrite config
```

---

## 4. Setup

### Requirements
- Node.js 18+
- A MongoDB connection string (Atlas or self-hosted)

### Environment variables

Create a `.env` file in the project root:

```bash
MONGO_URI=mongodb+srv://...              # required
JWT_SECRET=some-long-random-string       # required in production
ADMIN_PIN=1234                            # initial admin PIN (first run only — see note below)
RECOVERY_KEY=some-other-long-secret       # used to reset a forgotten PIN
MIXER_PIN=1234                            # initial Equipment Hire PIN (first run only — same pattern as ADMIN_PIN)
MIXER_JWT_SECRET=some-other-long-random-string  # required in production, separate from JWT_SECRET
MIXER_RECOVERY_PIN=some-other-secret      # used to reset a forgotten Equipment Hire PIN
PORT=3000                                  # optional, defaults to 3000
NODE_ENV=development                       # "production" enables secure cookies
```

> The PIN itself is stored in the database (see `middleware/auth.js`), not read fresh from `ADMIN_PIN` on every request — `ADMIN_PIN` seeds the initial value. If you need to check the exact behavior, `getAdminPin`/`setAdminPin` live in `server/middleware/auth.js`. The Equipment Hire PIN follows the identical pattern in `server/routes/mixerAuth.js`, entirely independent of the Truck Dashboard's PIN.

### Install & run

```bash
npm install
npm run dev      # nodemon, auto-restarts on change
# or
npm start        # plain node
```

The app serves both the API (`/api/*`) and the static frontend from the project root when **not** running on Vercel (`process.env.VERCEL` unset).

### Seeding data

```bash
npm run seed
```

`server/seed.js` is **non-destructive** — it uses `$setOnInsert` upserts everywhere, so re-running it never overwrites data you've already entered through the website. It can optionally import weekly entries, quarterly tax, and salary payments directly from a `Transport.xlsx` spreadsheet if one is found at the path configured in that file.

### Running tests

```bash
node --test server/utils/*.test.js
```

Covers the pure calculation logic behind the Equipment Hire payment ledger, condition/deposit flagging, client-history aggregation, and utilization math (§10.6/10.7) — no database required. There is no request-level (e.g. supertest) coverage of the Express routes or Mongoose models yet, on either side of the app.

---

## 5. API overview

All endpoints are mounted under `/api`. Endpoints that create/update/delete data require the admin cookie (set after a successful `/api/auth/verify`).

| Resource | Base path | Notes |
|---|---|---|
| Auth | `/api/auth` | `POST /verify`, `GET /status`, `POST /logout` |
| Trucks | `/api/trucks` | CRUD trucks, plus `/:.id/years` for per-year gross/exp/weeks |
| Weekly | `/api/weekly` | Per-truck weekly entries; also exposes `/ranges`, `/compare`, `/current-vs-range` for the range-vs-baseline widgets |
| Monthly | `/api/monthly` | Fleet-level monthly rollups; `/bulk/:year` replaces a whole year at once |
| Expenses | `/api/expenses` | Yearly maintenance/other/supervisor-salary breakdown |
| Quarterly Tax | `/api/quarterly-tax` | Per-quarter income tax, keyed by `truckId` (fleet-wide entries use `_fleet`) |
| Salary Payments | `/api/salary-payments` | Individual dated supervisor salary payments |
| Drivers | `/api/drivers` | Driver name/notes/start-dates per truck |
| Dashboard | `/api/dashboard` | `/full` (everything the dashboard needs in one call), `/kpis`, `/yearly-totals`, `/heatmap` |
| Reports | `/api/reports` | `/summary` (year-filterable KPIs + ranking), `/export` (CSV/JSON) |
| Recovery | `/api/recovery` | List/restore/permanently-delete soft-deleted items |
| Settings | `/api/settings` | App info, PIN reset, reference-file upload/download/delete |

The Equipment Hire subsystem has its own separate set of endpoints — see §10.3.

### Error response format

Every error — validation failure, not-found, auth failure, unexpected server error — comes back as:

```json
{ "error": "Human-readable message" }
```

with an appropriate HTTP status code:

| Status | Meaning |
|---|---|
| 400 | Bad input — missing field, wrong type, out-of-range year/week/quarter, malformed id, etc. |
| 401 | Wrong PIN / wrong recovery key |
| 403 | Not logged in as admin (from `requireAdmin`) |
| 404 | Resource not found, or an unmatched `/api/*` route |
| 409 | Conflict — e.g. truck ID already exists |
| 500 | Unexpected server error (logged server-side, message hidden from the client) |

This is implemented centrally in `server/utils/errors.js`:

- **`AppError`** — throw `new AppError('message', statusCode)` from anywhere inside a route and it becomes that exact JSON response.
- **`asyncHandler(fn)`** — wraps every async route handler so a thrown error or rejected promise is forwarded to Express's error handling instead of crashing the process or hanging the request.
- **Validation helpers** — `toYear`, `toWeek`, `toQuarter`, `toMonth`, `toNumber`, `toTruckId`, `toObjectId`, `toDateString`, `requireFields`. These reject bad input immediately (e.g. a non-numeric `gross`, a week outside 1–53, a malformed Mongo id) rather than letting `NaN` or `undefined` silently corrupt totals.
- **`globalErrorHandler`** — registered last in `server/index.js`. Also normalizes Mongoose `ValidationError`/`CastError`, Mongo duplicate-key errors, and malformed JSON request bodies into the same `{ error }` shape.
- Unmatched `/api/*` routes return a JSON 404 instead of falling through to the SPA's `index.html` fallback.
- The Equipment Hire routes (`equipment-routes.js`, `contract-routes.js`, `mixerAuth.js`) now use this exact same `AppError`/`asyncHandler` pattern — see §10.3.

---

## 6. Data model (high level)

| Model | Purpose |
|---|---|
| `Truck` | Truck ID, driver, cost breakdown (`pricePaid`, `insurance`, `maintenanceCost`, `initialPayment`, `paymentEntries[]`), end-of-term status, sheet notes |
| `YearEntry` | One doc per truck per year: `gross`, `exp`, `net`, `weeks` — kept in sync automatically from `WeeklyEntry` rollups |
| `WeeklyEntry` | One doc per truck per year per ISO week: `gross`, `maint`, `other`, `daysWorked`, `notes`, `remarks` |
| `MonthlyEntry` | Fleet-level (`truckId: '_fleet'`) monthly gross/exp, recomputed from weekly entries |
| `ExpenseBreakdown` | Per-year `maint`/`other`/`supervisorSalary` fleet totals |
| `SalaryPayment` | Individual dated supervisor salary payments (source of truth for `supervisorSalary` when present) |
| `QuarterlyTax` | Per-quarter income tax amounts |
| `ReferenceFile` | Uploaded documents (insurance, receipts, etc.), stored as binary in MongoDB |
| `Trash` | Soft-deleted items with a 30-day expiry, restorable via the Recovery Bin |

The Equipment Hire subsystem's models (`Equipment`, `Contract`) are documented separately in §10.4.

**Important derived-value rule:** supervisor salary is a real cost paid out of income. Anywhere fleet-wide totals are computed (`routes/dashboard.js`, `routes/reports.js`, and the dashboard's client-side `getYearlyKPIs`), salary is added to expenditure **and** subtracted from net income — not just one or the other — so `gross − exp == net` always holds.

**Truck payment tracker rule** (Reports page, 26-trucks payment balance): payment entries are read in the order they were added and summed into "Total Paid" only until that running total reaches the truck's Total Cost. Once the truck is paid off, a divider appears and any further entries (insurance, extra fees, etc.) are still listed for the record but no longer affect Total Paid / Remaining Balance / the progress bar.

---

## 7. Error handling & validation summary

Every write endpoint now validates its input before touching the database:

- **Years** must be a real integer between 2000–2100.
- **Weeks** must be an integer 1–53.
- **Quarters** must be 1–4.
- **Months** must be a valid 3-letter abbreviation (`Jan`–`Dec`).
- **Money fields** (`gross`, `exp`, `maint`, `other`, `amount`, cost fields, etc.) must be finite numbers; most reject negatives.
- **Dates** (salary payment `datePaid`) must be `YYYY-MM-DD` and parse to a real date.
- **Mongo ids** (`:id` params for recovery items, salary payments, reference files) must match a 24-character hex ObjectId shape before a DB lookup is even attempted.
- **Truck IDs** are trimmed and upper-cased consistently everywhere they're accepted.
- Required fields are checked up front with a single combined "Missing required field(s): …" message rather than failing deep inside a query.

If you add new routes, use the same pattern:

```js
const { asyncHandler, AppError, toYear, toNumber } = require('../utils/errors');

router.post('/something', requireAdmin, asyncHandler(async (req, res) => {
  const year = toYear(req.body.year);
  const amount = toNumber(req.body.amount, 'amount', { allowNegative: false });
  // ... no try/catch needed — asyncHandler forwards any thrown error
  res.json({ success: true });
}));
```

---

## 8. Deployment

- **Vercel** — `vercel.json` rewrites `/api/*` to the serverless function; `process.env.VERCEL` disables the static-file/SPA-fallback middleware in `server/index.js` since Vercel handles that separately.
- **Render** — `render.yaml` defines a standard Node web service; set `MONGO_URI`, `JWT_SECRET`, and `ADMIN_PIN` as environment variables/secrets in the Render dashboard.
- **Anywhere else** — it's a standard Express app; `npm start` behind any Node-capable host or reverse proxy works.

---

## 9. Known limitations / things to know

- `server/middleware/auth.js` (PIN storage, `requireAdmin`, `touchLastSaved`, `getLastSaved`) is treated as a black box by every route in this codebase — if you need to change how PIN storage or the "last saved" timestamp works, that's the file to look at.
- There's a single shared admin PIN for the whole business — there's no per-user login or role system.
- The truck-payment payoff-cutoff logic (§6) is **order-dependent**: it relies on the sequence payment entries were saved in, not on labels like "Insurance." If an insurance entry is logged before the truck is fully paid off, it will count toward the balance at that point in the sequence, matching how real payoff schedules work.
- See §10.7 for the equivalent known gap on the Equipment Hire side (no request-level test coverage).

---

## 10. Equipment Hire Subsystem

A second, self-contained mini-app living alongside the Truck Dashboard — its
own MongoDB collections, its own PIN, its own login cookie (`mixerAuthToken`,
separate from the Truck Dashboard's `gr_auth`). Reached from the Truck
Dashboard via the "Equipment Hire" nav link, or directly via a bookmarked
link to `all-equipment.html`.

### 10.1 Pages

| Page | Purpose |
|---|---|
| `all-equipment.html` | The **only** page a direct/bookmarked link can reach (see §10.2). Full equipment list with search/filter; logged-in users get Add/Edit/Delete forms and status changes directly here. |
| `mixers.html` | Full dashboard — equipment cards by category, contract list, ending/overdue notifications, and the payment ledger + condition-aware return modal per contract. |
| `mixer-reports.html` | KPI summary, equipment-by-category breakdown, Equipment Utilization table (30/90/365-day window), hire contracts table, CSV/JSON export. |
| `mixer-clients.html` | Client history — per-client aggregation across all their contracts, flags clients with an overdue balance or a withheld deposit. |
| `mixer-recovery.html` | Soft-deleted equipment/contracts, 30-day recovery bin (same pattern as the Truck Dashboard's). |
| `mixer-settings.html` | Mixer PIN management, recovery PIN, PIN reset flow. |

### 10.2 Access model & page gating

Only `all-equipment.html` is reachable by a direct or bookmarked link. The
other five pages redirect to `all-equipment.html` unless the visit carries
`?dash=1` in the URL or arrived via a referrer that had `dash=1` (i.e. came
from the Truck Dashboard's own "Equipment Hire" nav link). This check runs
synchronously in `src/mixer-nav.js`, before any page content or nav chrome
builds, so a restricted page never flashes on screen for an unauthorized
visitor — and the sidebar itself only ever offers "All Equipment" to a direct
visitor, since the other links would just bounce them straight back.

Mixer PIN login (`POST /api/mixer-auth/verify`) and mixer PIN reset
(`POST /api/mixer-settings/pin/reset`) are both rate-limited with the same
3-strikes/15-minute (escalating to 24h on a repeat lockout) pattern as the
Truck Dashboard's own login/reset, under their own `mixerlogin` /
`mixerpinreset` scopes — so none of the four lockout counters (`login`,
`pinreset`, `mixerlogin`, `mixerpinreset`) can ever interfere with each other.

### 10.3 API overview

| Method | Path | Notes |
|---|---|---|
| GET/POST/PUT/DELETE | `/api/equipment` | CRUD equipment; `POST/PUT` validate category against `Equipment.CATEGORIES` |
| POST/DELETE | `/api/equipment/:id/maintenance` | Maintenance log entries; auto-adjusts `cost.maintenanceCost` |
| GET | `/api/equipment/utilization?days=N` | Days-on-hire %, capped at 100% for overlapping contracts, income split proportionally on multi-item contracts |
| GET/POST/PUT/DELETE | `/api/contracts` | CRUD contracts; items validated deeply on create/update (valid category, positive quantity) |
| POST/DELETE | `/api/contracts/:id/payments` | Add/remove a payment on the ledger; `paymentStatus` recalculates automatically |
| PUT | `/api/contracts/:id/return` | Records condition + deposit refund in one step (see §10.5) |
| GET | `/api/contracts/clients/history` | Per-client aggregation, powers `mixer-clients.html` (see §10.6) |
| POST/GET | `/api/mixer-auth` | `/verify`, `/status`, `/logout` — separate PIN from the Truck Dashboard |
| GET/PUT/POST | `/api/mixer-settings` | PIN management, recovery PIN, `/pin/reset` |
| GET/POST/DELETE | `/api/mixer-recovery` | Soft-delete recovery bin for equipment/contracts |

### 10.4 Data model

| Model | Purpose |
|---|---|
| `Equipment` | `equipmentId`, `category`, `model`, `status` (`available`/`on-hire`/`maintenance`/`retired`), `cost` (`pricePaid`, `insurance`, `maintenanceCost`), `maintenanceLog[]`, soft-delete via `deletedAt` |
| `Contract` | Client info, `items[]` (category/equipmentId/quantity), `startDate`/`endDate`, `rate`/`rateUnit`, `totalValue`, `deposit`, `paymentDueDate`, `payments[]` (see below), `returned`/`returnedDate`/`returnNotes`, `conditionStatus`, `depositRefund`, soft-delete via `deletedAt` |
| `Contract.payments[]` | One entry per payment received (`date`, `amount`, `method`, `note`) — the source of truth for `paymentStatus`/balance, replacing what used to be a single manually-set flag |

### 10.5 Return & maintenance-routing rule

`PUT /api/contracts/:id/return` captures `conditionStatus` (`good` /
`minor-wear` / `damaged`) and `depositRefund` together in one step. The
equipment listed on that contract is then routed automatically: `damaged` →
`maintenance` status, anything else → `available`. There's no separate
manual step to send damaged equipment to maintenance — it happens as a side
effect of recording the return.

### 10.6 Utilization & client-history calculation rules

- **Utilization** (`server/utils/equipmentHelpers.js`): a piece of equipment's
  hire days are computed by merging all its contract date-ranges into
  non-overlapping spans first, so two contracts double-booking the same unit
  on paper don't push it past 100%. Income on a multi-item contract is split
  proportionally by each line item's quantity against the contract's total
  item quantity, not divided evenly or credited wholesale to one item.
- **Client history** (`server/utils/contractHelpers.js`): clients are grouped
  by name case-insensitively. A contract is **overdue** once it has a balance
  owing, hasn't been returned, and its `paymentDueDate` has passed (no due
  date set = never flagged). A deposit is **withheld** once the contract is
  returned and the refund given was less than what was collected. Any client
  with at least one flagged contract sorts to the top of the list.

### 10.7 Testing & known gaps

`server/utils/contractHelpers.js` and `server/utils/equipmentHelpers.js` are
pure functions with no database dependency, unit tested directly:

```bash
node --test server/utils/*.test.js
```

This covers payment-status boundaries (unpaid/partial/paid/overpaid),
overdue/withheld-deposit flagging, utilization capping under overlapping
contracts, and proportional income splitting. There is **no** request-level
(e.g. supertest) coverage of the Express routes or Mongoose models
themselves yet — same gap as the Truck Dashboard side of the app (§9).