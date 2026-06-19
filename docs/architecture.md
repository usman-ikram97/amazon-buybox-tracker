# Architecture

## Overview

Amazon Buybox Tracker is a Node.js automation that reads ASINs from Google Sheets, scrapes Amazon product detail pages across four EU marketplaces using Playwright, and writes structured results back to Google Sheets.

---

## Component Map

```
┌─────────────────────────────────────────────────┐
│                  run.js (Orchestrator)          │
│                                                 │
│  1. Auth → Google Sheets API                    │
│  2. Read ASINs from input sheet                 │
│  3. For each market × ASIN → scrapeWithRetries  │
│  4. Write output rows to dated sheet tab        │
│  5. Build and write summary tab                 │
└────────────────────┬────────────────────────────┘
                     │ calls
                     ▼
┌─────────────────────────────────────────────────┐
│              scrape.js (Scraper)                │
│                                                 │
│  • Launches Playwright persistent context       │
│  • Navigates to amazon.[domain]/dp/[ASIN]       │
│  • Detects: validation page → auto-recover      │
│  • Detects: unavailable → short-circuit         │
│  • Extracts: price, premium beauty, buybox      │
│  • On failure: saves debug artifacts            │
│  • Returns structured result object             │
└────────────────────┬────────────────────────────┘
                     │ reads/writes
                     ▼
┌─────────────────────────────────────────────────┐
│            Persistent Browser Profiles          │
│                                                 │
│  profiles/profile-DE   (amazon.de session)      │
│  profiles/profile-IT   (amazon.it session)      │
│  profiles/profile-FR   (amazon.fr session)      │
│  profiles/profile-ES   (amazon.es session)      │
└─────────────────────────────────────────────────┘
```

---

## Data Flow

```
Google Sheets (input)
  └─ Sheet1!A:B  →  [{ asin, productName }]
                         │
                         ▼
              for each market in [DE, IT, FR, ES]
                for each item in ASINs
                         │
                         ▼
              scrape.js
                └─ https://www.amazon.[domain]/dp/[ASIN]?th=1
                         │
                    ┌────┴────────────────────┐
                    ▼                         ▼
              Happy path                 Exception paths
              ─────────                  ───────────────
              price                      Validation page → recover & retry
              premiumBeauty              Unavailable → return early
              buybox (Yes/No)            Page load fail → save debug
              notes: ''                  Data missing → save debug
                    └────┬────────────────────┘
                         ▼
              output row: [ASIN, URL, Name, Market,
                           Price, PremiumBeauty,
                           Buybox, Notes]
                         │
                         ▼
Google Sheets (output)
  └─ [YYYY-MM-DD]!A:H   →  all output rows
  └─ [Summary - YYYY-MM-DD]!A:G  →  per-market summary
```

---

## Retry Strategy

```
scrapeWithRetries(item, market)
  │
  ├─ attempt 1 → isBadResult? → sleep 15s → attempt 2
  ├─ attempt 2 → isBadResult? → sleep 15s → attempt 3
  └─ attempt 3 → return best result (or fallback with Manual Check Required note)

isBadResult = missing price OR missing sellerText
           AND notes != 'unavailable'  (unavailable is a valid terminal state)
```

---

## Google Sheets Integration

- **Auth**: OAuth2 via `google-auth-library`. Token stored in `token.json`. One-time setup via local Express server on port 3333.
- **Read**: `spreadsheets.values.get` — Sheet1 column A:B
- **Write**: `spreadsheets.values.update` with `valueInputOption: RAW`
- **Sheet management**: `spreadsheets.batchUpdate` to create new tabs; uniqueness guard prevents name collisions on same-day re-runs

---

## Scheduler

Production scheduling is handled by **Windows Task Scheduler**:

- Trigger: Weekly, Monday, 13:00 PKT
- Action: `node run.js`
- Working directory: project root
- Requirement: machine must be awake and connected

---

## File Structure

```
buybox-tracker/
├── run.js              # Orchestration: reads inputs, drives scraper, writes output
├── scrape.js           # Playwright scraper: one ASIN × one market per call
├── package.json
├── package-lock.json
├── credentials.json    # ← NOT committed (Google OAuth2 client credentials)
├── token.json          # ← NOT committed (OAuth2 access/refresh token)
├── profiles/           # ← NOT committed (persistent Playwright browser profiles)
│   ├── profile-DE/
│   ├── profile-IT/
│   ├── profile-FR/
│   └── profile-ES/
└── debug/              # ← NOT committed (auto-generated failure artifacts)
    └── [asin]_[market]_[reason]_[timestamp].{png,html,txt}
```
