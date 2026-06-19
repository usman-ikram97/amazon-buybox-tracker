# Troubleshooting

---

## No New Output Tab Created

**Symptom:** The script finishes but no new tab appears in Google Sheets.

**Causes and fixes:**

| Cause | Fix |
|---|---|
| Script crashed before writing | Check PowerShell output for error messages; run `node run.js` manually |
| Google auth token expired | Delete `token.json` and re-run to re-authenticate |
| Wrong Spreadsheet ID | Verify `SPREADSHEET_ID` in `run.js` matches your sheet URL |
| No ASINs in Sheet1 | Confirm rows exist starting at A2 in the `Sheet1` tab |

---

## `Unable to parse range` Error

**Symptom:** Google Sheets API throws a range parse error.

**Cause:** Tab names containing spaces, hyphens, or special characters must be wrapped in single quotes in range strings (e.g., `'2026-06-19'!A1:H1`).

**Fix:** The current `run.js` uses `escapeSheetName()` which wraps the title in single quotes and escapes internal single quotes. If you see this error, verify that `escapeSheetName` is being called before every range string.

---

## Wrong Currency or Delivery Country in Results

**Symptom:** Prices appear in GBP or USD instead of EUR, or products show "unavailable" across an entire marketplace.

**Cause:** The browser profile for that marketplace has its delivery region set to the wrong country.

**Fix:** Re-warm the affected profile:
1. Open a headed Playwright browser on the profile
2. Navigate to the Amazon domain (e.g., amazon.de)
3. Change the delivery address to the correct country
4. Close the browser (profile is saved automatically)

---

## `Manual Check Required — Amazon Validation Page`

**Symptom:** Many rows return this note, often in a cluster.

**Cause:** Amazon showed a CAPTCHA or "Continue Shopping" gate. The scraper attempted auto-recovery (clicking the button and re-navigating) but the page still could not be scraped cleanly.

**Fixes:**
- Check the `debug/` folder for the saved screenshot and HTML — confirm whether it was a true CAPTCHA or a soft gate
- Increase `DELAY_BETWEEN_ROWS_MS` in `run.js` to reduce detection risk
- Re-warm the affected marketplace profile (session may have expired)
- Wait and re-run; Amazon validation rate typically drops after a session cooldown

---

## `Manual Check Required — Page Load Failed`

**Symptom:** Some rows return this note, usually scattered.

**Cause:** The page did not load within the 90-second timeout, or the network request threw before content loaded.

**Fixes:**
- Check your internet connection
- Verify the ASIN is valid on the marketplace
- Increase the `timeout` in `softGoto()` if your connection is slow
- The retry logic will have already attempted 3 times before writing this note

---

## `Manual Check Required — Data Not Extracted`

**Symptom:** The page loaded, price and seller text are empty, debug files are saved.

**Cause:** Amazon's DOM layout for that product/marketplace did not match any of the CSS selectors in `getPrice()` or `getText()`.

**Diagnosis:**
1. Open the debug `.html` file in a browser
2. Inspect the price and buybox elements
3. Find the CSS selector that contains the data
4. Add it to the appropriate selector array in `scrape.js`

**Note:** Only update selectors if the issue repeats consistently. Amazon runs A/B tests — a selector that fails today may work tomorrow.

---

## Automation Stops Mid-Run

**Symptom:** The process stops part-way through; the output tab has fewer rows than expected.

**Causes and fixes:**

| Cause | Fix |
|---|---|
| Laptop went to sleep | Set plugged-in sleep to Never during run window |
| User closed the terminal | Run in a background session or use Task Scheduler with "Run whether logged on or not" |
| Unhandled exception | Check PowerShell output; look for stack trace |
| Network dropped | Re-run; rows already written to the sheet are not overwritten (a new tab is created) |

---

## Task Scheduler Fires But Nothing Happens

**Symptom:** Task Scheduler shows the task ran successfully, but no output tab was created.

**Checklist:**
- **Program/script:** must be the full path to `node.exe`, e.g., `C:\Program Files\nodejs\node.exe`
- **Arguments:** `run.js`
- **Start in:** must be the project root, e.g., `C:\automation\buybox-tracker`
- **User account:** the task must run as the same user that has the `token.json` and `credentials.json` files, and that has network access
- **Check Task History:** right-click the task → History → look for exit code or error

Test by running the action command manually in PowerShell:

```powershell
cd C:\automation\buybox-tracker
node run.js
```

---

## Premium Beauty Always Returns "No"

**Symptom:** All rows show `No` for Premium Beauty even for known Premium Beauty products.

**Cause:** Amazon may have changed the badge text or its location on the page.

**Fix:**
1. Manually open a Premium Beauty product on the relevant domain
2. Find the badge text in the page source
3. Add the text variant to `hasPremiumBeauty()` in `scrape.js`

---

## Refreshing Debug Artifacts

Debug files are saved in `debug/` with the pattern:

```
[ASIN]_[MARKET]_[REASON]_[TIMESTAMP].{png,html,txt}
```

Each failure saves three files. The folder can grow large over time — clean it periodically:

```powershell
Remove-Item C:\automation\buybox-tracker\debug\* -Force
```

---

## Re-authenticating Google Sheets

If the OAuth2 token expires or becomes invalid:

1. Delete `token.json`
2. Run `node run.js`
3. Follow the printed authorization URL
4. Grant access in the browser
5. The new `token.json` is saved automatically
