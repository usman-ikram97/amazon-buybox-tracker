# Changelog

All notable changes to this project are documented here.

## [1.0.0] — June 2026

### Added
- Initial production deployment
- Multi-market scraping: Amazon DE, IT, FR, ES
- Playwright-based PDP scraper with persistent browser profiles per market
- Price extraction with fallback CSS selector chain
- Premium Beauty badge detection (multilingual: DE, IT, FR, ES)
- Buybox ownership detection via buybox region text parsing
- Unavailable product detection (multilingual phrases)
- Amazon validation/CAPTCHA page detection and auto-click recovery
- 3-attempt retry loop with 15-second back-off between retries
- 7-second inter-row delay to reduce bot-detection risk
- Debug artifact capture on failure: screenshot, full HTML, body text
- Google Sheets API integration (OAuth2) for both read and write
- Automatic dated output tab creation with uniqueness guard
- Summary tab generation with per-market and totals breakdown (Buybox %)
- Windows Task Scheduler integration for weekly Monday runs
- TEST_MODE flag for reduced ASIN subset during development
- Structured Notes column values for downstream triage
