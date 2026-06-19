# Engineering Decisions

Key technical choices made during design and development, with rationale.

---

## 1. Playwright over Puppeteer or Selenium

**Decision:** Use Playwright with Chromium.

**Why:** Playwright's persistent context API (`chromium.launchPersistentContext`) is purpose-built for session reuse. A single call gives a browser that loads an existing user profile — carrying cookies, localStorage, and delivery region preferences from previous Amazon sessions. Puppeteer has no native persistent context equivalent, and Selenium's profile support is significantly more complex to configure.

**Trade-off:** Playwright binary is larger. Acceptable for a desktop automation.

---

## 2. One Browser Context Per Scrape Call, Not One Per Run

**Decision:** Open and close a browser context for every `scrapeAsin()` call rather than reusing one context across all ASINs.

**Why:** Amazon occasionally sets session state (delivery region, validation flags) that carries forward within a context. Closing and reopening the context for each ASIN starts fresh from the stored profile, preventing state contamination between products. The performance cost (~2–3s per open/close) is acceptable given the 7-second inter-row delay already in place.

---

## 3. Persistent Browser Profiles Per Marketplace

**Decision:** Four separate Playwright persistent profiles — one per Amazon domain (DE, IT, FR, ES).

**Why:** Amazon displays pricing and availability based on the delivery region inferred from cookies and browser history. Without a pre-warmed profile, Amazon may default to delivering to the machine's country (Pakistan in this case), rendering European prices and availability data meaningless. Persistent profiles store the manually-set delivery region and Amazon session so every automated run behaves identically to a signed-in local browser.

---

## 4. CSS Selector Fallback Chain for Price Extraction

**Decision:** `getPrice()` tries six CSS selectors in sequence before returning empty string.

**Why:** Amazon's DOM structure is not consistent across A/B tests, marketplace domains, or product types. Different product categories (standard listings, deal prices, marketplace offers) use different wrapper elements. A fallback chain is more resilient than a single selector and avoids hardcoding assumptions about which layout variant will appear.

---

## 5. Multilingual Text Detection

**Decision:** All detection functions (`isUnavailable`, `hasPremiumBeauty`, `isAmazonValidationPage`) check for phrases in all four supported languages rather than relying on CSS classes or structured data.

**Why:** Amazon's structured data and class names are not always consistently populated across locales. Page text — even when scraped across languages — is the most reliably present signal. Checking all language variants in a single function makes the detection logic locale-agnostic and easy to extend.

---

## 6. 7-Second Delay Between Rows

**Decision:** Hard-coded 7-second sleep between each ASIN scrape.

**Why:** Amazon employs bot-detection heuristics based on request frequency. Rapid sequential page loads from the same IP/session trigger validation pages (CAPTCHAs, "Continue Shopping" gates). A 7-second gap mimics human browsing cadence and significantly reduces the validation page rate observed during testing.

**Trade-off:** Total runtime for a full run is roughly `n_asins × 4_markets × 7s`, approximately 1.5 hours for a typical ASIN list. Acceptable for a weekly batch job.

---

## 7. Three-Attempt Retry with 15-Second Back-off

**Decision:** Retry each failed scrape up to 3 times with a 15-second wait between attempts.

**Why:** Transient failures (network hiccups, slow page loads, brief Amazon validation pages) resolve on retry. Three attempts covers the majority of transient cases without inflating runtime excessively. Fifteen seconds gives Amazon's session state time to settle after a validation page encounter.

---

## 8. `isBadResult` Excludes "Unavailable" from Retries

**Decision:** A result with `notes === 'unavailable'` is not retried, even though it has no price or seller text.

**Why:** "Unavailable" is a confirmed business state, not a scrape failure. Retrying it wastes time and adds unnecessary load. The distinction between "we couldn't scrape it" and "Amazon says it's unavailable" is semantically important for downstream reporting.

---

## 9. Structured Notes Column Values

**Decision:** The Notes column uses a fixed vocabulary: blank, `Unavailable`, `Manual Check Required - Amazon Validation Page`, `Manual Check Required - Page Load Failed`, `Manual Check Required - Data Not Extracted`.

**Why:** A fixed vocabulary makes the output filterable and parseable. Downstream reviewers and future automation can filter or count notes by type. Free-form error messages would require human interpretation and make the summary sheet calculations unreliable.

---

## 10. Windows Task Scheduler Over Cloud Orchestration

**Decision:** Schedule with Windows Task Scheduler rather than n8n Cloud, GitHub Actions, or a cloud VM.

**Why:** The scraper requires a local Chromium instance with persistent browser profiles. Cloud orchestration platforms cannot access localhost browser profiles. Running Playwright in a headless cloud environment requires either a server with a full browser installation or a Playwright-as-a-service setup — both add meaningful infrastructure cost and complexity. Windows Task Scheduler is free, reliable for a weekly cadence, and requires no additional services.

**Known limitation:** The machine must be awake at run time. Acceptable trade-off for the current weekly cadence.

---

## 11. Debug Artifacts Saved to Local `debug/` Folder

**Decision:** On any scrape failure, save a screenshot (PNG), full page HTML, and body text to a timestamped file in `debug/`.

**Why:** Amazon page issues are difficult to reproduce. A saved snapshot of the exact page state at failure time makes post-hoc diagnosis possible without re-running the scraper. This was critical during development for distinguishing CAPTCHA pages from layout changes from genuine network errors.

---

## 12. Same-Day Re-Run Safety (Sheet Uniqueness Guard)

**Decision:** `createUniqueSheetTitle()` appends `(2)`, `(3)`, etc. if a tab for today already exists.

**Why:** If the script is re-run on the same day (e.g., after a mid-run failure), it creates a new tab rather than overwriting or erroring. This preserves partial results from the first run and makes re-runs safe to trigger without manual cleanup.
