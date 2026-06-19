# Setup Guide

Complete local setup instructions for the Amazon Buybox Tracker.

---

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Node.js | ≥ 18 | `node --version` to verify |
| npm | ≥ 9 | Bundled with Node.js |
| Google account | — | To create API credentials |
| Windows | 10 / 11 | Task Scheduler integration |

---

## Step 1 — Clone the Repository

```bash
git clone https://github.com/YOUR_USERNAME/amazon-buybox-tracker.git
cd amazon-buybox-tracker
```

---

## Step 2 — Install Dependencies

```bash
npm install
npx playwright install chromium
```

---

## Step 3 — Google Sheets API Setup

### 3a. Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (e.g., `buybox-tracker`)
3. Enable the **Google Sheets API** for the project

### 3b. Create OAuth2 Desktop Credentials

1. Go to **APIs & Services → Credentials**
2. Click **Create Credentials → OAuth 2.0 Client ID**
3. Application type: **Desktop app**
4. Download the JSON file and save it as `credentials.json` in the project root

### 3c. Create Your Output Google Sheet

1. Create a new Google Sheet
2. Add a tab named `Sheet1` with headers:
   - Column A: `ASIN`
   - Column B: `Product Name`
3. Add your ASINs starting from row 2
4. Copy the Spreadsheet ID from the URL:
   `https://docs.google.com/spreadsheets/d/**YOUR_SPREADSHEET_ID**/edit`
5. Update `SPREADSHEET_ID` in `run.js`:
   ```js
   const SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID';
   ```

### 3d. Authenticate (First Run Only)

The project includes a small Express server that handles the OAuth2 callback. Run:

```bash
node run.js
```

On first run, the script will print a Google authorization URL. Open it in your browser, grant access, and the token is saved as `token.json` automatically. All subsequent runs use the saved token.

---

## Step 4 — Set Up Browser Profiles

Playwright uses persistent browser profiles to maintain Amazon delivery region and session state per marketplace. Create them once:

```bash
mkdir -p profiles/profile-DE profiles/profile-IT profiles/profile-FR profiles/profile-ES
```

### Warm Up Each Profile

For each marketplace, manually navigate to the Amazon domain and set the correct delivery location:

```bash
# Open a Playwright browser for DE (example script)
node -e "
const { chromium } = require('playwright');
chromium.launchPersistentContext('./profiles/profile-DE', {
  headless: false,
  locale: 'de-DE',
  viewport: { width: 1600, height: 1000 }
}).then(async ctx => {
  const page = await ctx.newPage();
  await page.goto('https://www.amazon.de');
  // Set your delivery country to Germany, then close
});
"
```

Repeat for `profile-IT` (amazon.it, locale `it-IT`), `profile-FR` (amazon.fr, locale `fr-FR`), and `profile-ES` (amazon.es, locale `es-ES`).

> **Important:** If Amazon shows prices in the wrong currency or "unavailable" for most products, the profile delivery region is incorrect. Re-warm the affected profile.

---

## Step 5 — Test the Automation

Enable test mode to run against a small ASIN subset:

```js
// run.js
const TEST_MODE = true;
const TEST_ASIN_LIMIT = 3;
```

Run:

```bash
node run.js
```

Verify a dated output tab and summary tab appear in your Google Sheet.

Disable test mode before scheduling:

```js
const TEST_MODE = false;
```

---

## Step 6 — Schedule with Windows Task Scheduler

1. Open **Task Scheduler** (`taskschd.msc`)
2. Click **Create Task**
3. **General tab:**
   - Name: `Buybox Tracker`
   - Run whether user is logged on or not: optional (requires password)
4. **Triggers tab → New:**
   - Weekly, Monday, your preferred time
5. **Actions tab → New:**
   - Program: full path to `node.exe` (e.g., `C:\Program Files\nodejs\node.exe`)
   - Arguments: `run.js`
   - Start in: `C:\path\to\buybox-tracker`
6. **Conditions tab:**
   - Uncheck "Stop if the computer switches to battery power" if on a laptop
7. **Settings tab:**
   - Enable "Run task as soon as possible after a scheduled start is missed"

### Prevent Sleep During Runs

Go to **Settings → System → Power & Sleep**:
- Plugged in, put PC to sleep: **Never** (during the run window)

---

## Configuration Reference

| Constant | Location | Description |
|---|---|---|
| `SPREADSHEET_ID` | `run.js:6` | Google Sheets document ID |
| `MARKETS` | `run.js:10` | List of marketplace codes and domains |
| `TEST_MODE` | `run.js:17` | Limit run to first N ASINs |
| `TEST_ASIN_LIMIT` | `run.js:18` | ASIN count when TEST_MODE is true |
| `DELAY_BETWEEN_ROWS_MS` | `run.js:20` | Milliseconds between row scrapes (default 7000) |
| `DELAY_BETWEEN_RETRIES_MS` | `run.js:21` | Milliseconds between retry attempts (default 15000) |
| `MAX_ATTEMPTS` | `run.js:22` | Retry attempts per ASIN × market (default 3) |
| `DEBUG_DIR` | `scrape.js:5` | Path for debug artifacts |
| `MARKET_CONFIG` | `scrape.js:7` | Domain, locale, and profile path per market |

---

## Adding a New Marketplace

1. Add a profile folder: `profiles/profile-XX`
2. Warm up the profile (see Step 4)
3. Add to `MARKET_CONFIG` in `scrape.js`:
   ```js
   XX: { domain: 'amazon.xx', locale: 'xx-XX', profile: 'profile-XX' },
   ```
4. Add to `MARKETS` in `run.js`:
   ```js
   { code: 'XX', domain: 'amazon.xx' },
   ```
5. Add any new language variants to `isUnavailable()` and `hasPremiumBeauty()` in `scrape.js`
