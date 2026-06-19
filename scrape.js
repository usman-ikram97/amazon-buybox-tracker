const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const DEBUG_DIR = path.join(__dirname, 'debug');

const MARKET_CONFIG = {
  DE: { domain: 'amazon.de', locale: 'de-DE', profile: 'profile-DE' },
  IT: { domain: 'amazon.it', locale: 'it-IT', profile: 'profile-IT' },
  FR: { domain: 'amazon.fr', locale: 'fr-FR', profile: 'profile-FR' },
  ES: { domain: 'amazon.es', locale: 'es-ES', profile: 'profile-ES' },
};

function hasPremiumBeauty(text) {
  const t = (text || '').toLowerCase();
  return (
    t.includes('premium beauty') ||
    t.includes('premium-beauty') ||
    t.includes('bellezza premium') ||
    t.includes('beauté premium') ||
    t.includes('belleza premium')
  );
}

function isUnavailable(text) {
  const t = (text || '').toLowerCase();
  return (
    t.includes('currently unavailable') ||
    t.includes('actuellement indisponible') ||
    t.includes('non disponibile') ||
    t.includes('no disponible') ||
    t.includes('keine hervorgehobenen angebote') ||
    t.includes('aucune offre mise en avant') ||
    t.includes('nessuna offerta in evidenza') ||
    t.includes('ofertas destacadas no disponibles') ||
    t.includes('no featured offers available')
  );
}

function isAmazonValidationPage(text, html) {
  const t = (text || '').toLowerCase();
  const h = (html || '').toLowerCase();

  return (
    t.includes('continue shopping') ||
    t.includes('continuer les achats') ||
    t.includes('seguir comprando') ||
    t.includes('continua gli acquisti') ||
    t.includes('weiter shoppen') ||
    t.includes('weiter einkaufen') ||
    t.includes('mit dem einkauf fortzufahren') ||
    t.includes('cliquez sur le bouton') ||
    t.includes('haz clic en el botón') ||
    t.includes('clicca sul pulsante') ||
    h.includes('/errors/validatecaptcha') ||
    h.includes('opfcaptcha')
  );
}

function safeFileName(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, '_');
}

async function saveDebug(page, asin, market, reason, extraText = '') {
  if (!fs.existsSync(DEBUG_DIR)) fs.mkdirSync(DEBUG_DIR, { recursive: true });

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const base = `${safeFileName(asin)}_${market}_${safeFileName(reason)}_${ts}`;

  const screenshotPath = path.join(DEBUG_DIR, `${base}.png`);
  const htmlPath = path.join(DEBUG_DIR, `${base}.html`);
  const textPath = path.join(DEBUG_DIR, `${base}.txt`);

  await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
  const html = await page.content().catch(() => '');
  fs.writeFileSync(htmlPath, html, 'utf8');

  const bodyText = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
  fs.writeFileSync(textPath, `${extraText}\n\n--- BODY TEXT ---\n${bodyText}`, 'utf8');

  return path.basename(screenshotPath);
}

async function softGoto(page, url) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
    return 'OK';
  } catch (e) {
    const bodyText = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');

    if (bodyText && bodyText.length > 500) {
      return 'OK';
    }

    throw e;
  }
}

async function handleContinueShopping(page, url) {
  const bodyText = await page.locator('body').innerText({ timeout: 5000 }).catch(() => '');
  const html = await page.content().catch(() => '');

  if (!isAmazonValidationPage(bodyText, html)) {
    return false;
  }

  const buttonSelectors = [
    'button:has-text("Continue Shopping")',
    'button:has-text("Continuer les achats")',
    'button:has-text("Seguir comprando")',
    'button:has-text("Continua gli acquisti")',
    'button:has-text("Weiter shoppen")',
    'button:has-text("Weiter einkaufen")',
    'button[type="submit"]',
    'input[type="submit"]',
  ];

  for (const sel of buttonSelectors) {
    const btn = page.locator(sel).first();
    if (await btn.count()) {
      await btn.click({ timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(5000);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
      await page.waitForTimeout(6000);
      return true;
    }
  }

  return true;
}

async function getText(page, selectors, timeout = 4000) {
  for (const sel of selectors) {
    const txt = await page.locator(sel).first().innerText({ timeout }).catch(() => '');
    if (txt && txt.trim()) return txt.trim();
  }
  return '';
}

async function getPrice(page) {
  const selectors = [
    '#corePrice_feature_div span.a-price span.a-offscreen',
    '#corePriceDisplay_desktop_feature_div span.a-price span.a-offscreen',
    '#apex_desktop span.a-price span.a-offscreen',
    '#priceblock_ourprice',
    '#priceblock_dealprice',
    '#price_inside_buybox',
  ];

  for (const sel of selectors) {
    const txt = await page.locator(sel).first().textContent({ timeout: 4000 }).catch(() => '');
    if (txt && txt.trim()) return txt.trim();
  }

  return '';
}

async function scrapeAsin(asin, market) {
  const cfg = MARKET_CONFIG[market];
  const url = `https://www.${cfg.domain}/dp/${asin}?th=1`;

  const context = await chromium.launchPersistentContext(
    `C:\\automation\\buybox-tracker\\profiles\\${cfg.profile}`,
    {
      headless: true,
      locale: cfg.locale,
      viewport: { width: 1600, height: 1000 },
    }
  );

  const page = await context.newPage();

  const result = {
    price: '',
    premiumBeauty: 'No',
    sellerText: '',
    buybox: 'No',
    notes: '',
  };

  try {
    await softGoto(page, url);
    await page.waitForTimeout(4000);

    await handleContinueShopping(page, url);

    const bodyText = await getText(page, ['body'], 10000);
    const html = await page.content().catch(() => '');

    if (isAmazonValidationPage(bodyText, html)) {
      result.notes = 'Manual Check Required - Amazon Validation Page';
      await saveDebug(page, asin, market, 'amazon_validation_page', `URL: ${url}`);
      await context.close().catch(() => {});
      return result;
    }

    const mainText = await getText(page, ['#centerCol', '#ppd', '#dp-container'], 8000);
    const buyboxText = await getText(page, ['#desktop_buybox', '#rightCol', '#buybox'], 8000);

    if (hasPremiumBeauty(mainText)) {
      result.premiumBeauty = 'Yes';
    }

    const unavailable = isUnavailable(buyboxText) || isUnavailable(mainText);

    if (unavailable) {
      result.sellerText = 'Unavailable';
      result.buybox = 'No';
      result.price = '';
      result.notes = 'Unavailable';
      await context.close().catch(() => {});
      return result;
    }

    result.price = await getPrice(page);

    const lines = buyboxText
      .split('\n')
      .map(x => x.trim())
      .filter(Boolean);

    const amazonLine = lines.find(x => x.toLowerCase() === 'amazon');

    if (amazonLine) {
      result.sellerText = 'Amazon';
      result.buybox = 'Yes';
    } else {
      result.sellerText = lines.slice(0, 10).join(' | ');
      result.buybox = result.sellerText.toLowerCase().includes('amazon') ? 'Yes' : 'No';
    }

    if (!result.price || !result.sellerText) {
      result.notes = 'Manual Check Required - Data Not Extracted';
      await saveDebug(
        page,
        asin,
        market,
        'data_not_extracted',
        `URL: ${url}\nPrice: ${result.price}\nPremium Beauty: ${result.premiumBeauty}\nSeller Text: ${result.sellerText}\nBuybox: ${result.buybox}\nBuybox Text:\n${buyboxText}\nMain Text Sample:\n${mainText.slice(0, 2000)}`
      );
    }
  } catch (e) {
    result.notes = 'Manual Check Required - Page Load Failed';
    await saveDebug(page, asin, market, 'page_load_failed', `URL: ${url}\nError: ${e.message}`).catch(() => {});
  }

  await context.close().catch(() => {});
  return result;
}

module.exports = { scrapeAsin };