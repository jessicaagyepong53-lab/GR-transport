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
├── src/                     # Frontend JS (one file per page + shared helpers)
│   ├── api.js               # Shared fetch wrapper + auth helpers
│   ├── auth-modal.js        # PIN login modal + admin UI toggling
│   ├── auth.js              # Lightweight auth check for sub-pages
│   ├── nav.js                # Injects the sidebar nav on every page
│   ├── dashboard/reports/weekly/settings/recovery/truck/driver/year.js
├── server/
│   ├── index.js              # Express app setup, route mounting, error handling
│   ├── config/db.js          # MongoDB connection
│   ├── middleware/auth.js    # requireAdmin, PIN storage, touchLastSaved, etc.
│   ├── models/                # Mongoose schemas (Truck, YearEntry, WeeklyEntry, …)
│   ├── routes/                # One router per resource (see §5)
│   ├── utils/errors.js        # Shared AppError class, asyncHandler, validators
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
PORT=3000                                  # optional, defaults to 3000
NODE_ENV=development                       # "production" enables secure cookies
```

> The PIN itself is stored in the database (see `middleware/auth.js`), not read fresh from `ADMIN_PIN` on every request — `ADMIN_PIN` seeds the initial value. If you need to check the exact behavior, `getAdminPin`/`setAdminPin` live in `server/middleware/auth.js`.

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