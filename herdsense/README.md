# HerdSense (React + Vite)

HerdSense is a cows-only farm app with four main sections:

1. **Health & Alerts (Free)**
- Ear-tag based identity (camera OCR + manual confirmation)
- Clean cow cards with one-line risk summary and quick reason
- Overall Health Risk score (0-100%) with LOW/MODERATE/HIGH badge
- One-day spikes are shown as **Moderate (Recheck)** unless persistent/extreme
- Collapsible details: why flagged, contributing factors, quick checks, advanced table
- Demo Mode toggle for stable LOW/MODERATE/HIGH examples
- Signal sanity checks clamp minute values to 0-1440 to prevent unrealistic numbers
- Hardware inspection prompts + built-in **Report Issue** workflow

2. **Optimization (Pro): Save Money + Increase Output**
- Weekly Money Snapshot (estimated spend/revenue/profit + change vs last week)
- Cow Profit Cards (cost/day, output/day, status trend, recommendation)
- Inventory & Planning (days of feed remaining + cost forecasts until sale/cull)
- Schedule & Reminders (milking plan + recurring tasks + monthly calendar)
- Resource Efficiency (LOW/MODERATE/HIGH with clear next actions)

3. **Herd Manager**
- Cow CRUD: add/edit/delete/archive/restore
- Search by ear tag or name
- Active herd + Past animals views
- Ear tag uniqueness validation
- DOB-first workflow (auto age from DOB; fallback approximate age if unknown)

4. **Settings**
- Farm timezone + core cost inputs
- Hardware labels (feeding station, water point, shade zone)
- Baseline recalibration warning when feeding station label/location changes

## Run

```bash
npm install
npm run dev
```

Open the local Vite URL printed by the dev server.

## Demo mode

Use **Health & Alerts → Simulate day** to inject deterministic anomalies:
- Cow A: trough -25%, meals -16%, activity -21%, lying +13%, hot/humid
- Cow B: alone +55%, eating -19%, due_days=9
- Cow C: water visits -35%, eating -15%, hot/humid day

You can also reset demo data and manage cows from **Herd Manager**.

## Key app modules

- Health scoring: `src/engines/insights_engine.js`
- Pro optimization logic: `src/engines/optimization_engine.js`
- Calendar recurrence + completion history: `src/engines/calendarEngine.js`
- Persisted state + CRUD: `src/hooks/useFarmData.js`
- Deterministic demo generator: `src/data/demoData.js`
- Calendar regression script: `scripts/test-calendar-engine.mjs` (`npm run test:calendar`)
- Health sample regression script: `scripts/test-insights-sample.mjs` (`npm run test:insights`)

## Python reference modules

- `insights_engine.py`
- `optimization_engine.py`
- `calendar_engine.py`
- `data_store.py`
- `money_report.py`

These are offline helper/reference modules and do not require external APIs.
