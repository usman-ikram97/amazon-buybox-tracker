const path = require('path');
const { chromium } = require('playwright');

const MARKETS = {
  DE: { domain: 'amazon.de', profile: 'profile-DE', postalCode: '01067' },
  IT: { domain: 'amazon.it', profile: 'profile-IT', postalCode: '00118' },
  FR: { domain: 'amazon.fr', profile: 'profile-FR', postalCode: '75001' },
  ES: { domain: 'amazon.es', profile: 'profile-ES', postalCode: '01001' },
};

async function setupMarket(market, cfg) {
  console.log(`\nOpening ${market}: https://www.${cfg.domain}`);
  console.log(`Set postal code manually to: ${cfg.postalCode}`);
  console.log('Accept cookies if shown, confirm location, then close the browser window.');

  const context = await chromium.launchPersistentContext(
    path.join(__dirname, 'profiles', cfg.profile),
    {
      headless: false,
      viewport: { width: 1600, height: 1000 },
    }
  );

  const page = await context.newPage();
  await page.goto(`https://www.${cfg.domain}`, { waitUntil: 'domcontentloaded' });

  await page.waitForEvent('close', { timeout: 0 }).catch(() => {});
  await context.close().catch(() => {});
}

async function main() {
  for (const [market, cfg] of Object.entries(MARKETS)) {
    await setupMarket(market, cfg);
  }

  console.log('\nAll market profiles completed.');
}

main();