const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const { scrapeAsin } = require('./scrape');

const SPREADSHEET_ID = process.env.SPREADSHEET_ID || 'YOUR_SPREADSHEET_ID_HERE';

const HEADERS = ['ASIN', 'URL', 'Product Name', 'Market', 'Price', 'Premium Beauty', 'Buybox', 'Notes'];

const MARKETS = [
  { code: 'DE', domain: 'amazon.de' },
  { code: 'IT', domain: 'amazon.it' },
  { code: 'FR', domain: 'amazon.fr' },
  { code: 'ES', domain: 'amazon.es' },
];

const TEST_MODE = false;
const TEST_ASIN_LIMIT = 10;

const DELAY_BETWEEN_ROWS_MS = 7000;
const DELAY_BETWEEN_RETRIES_MS = 15000;
const MAX_ATTEMPTS = 3;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function escapeSheetName(title) {
  return `'${title.replace(/'/g, "''")}'`;
}

function formatPKTDateYYYYMMDD(d = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);

  const yyyy = parts.find(p => p.type === 'year').value;
  const mm = parts.find(p => p.type === 'month').value;
  const dd = parts.find(p => p.type === 'day').value;

  return `${yyyy}-${mm}-${dd}`;
}

async function getAuthClient() {
  const creds = JSON.parse(fs.readFileSync(path.join(__dirname, 'credentials.json'), 'utf8'));
  const token = JSON.parse(fs.readFileSync(path.join(__dirname, 'token.json'), 'utf8'));

  const { client_id, client_secret } = creds.installed;

  const oAuth2Client = new google.auth.OAuth2(
    client_id,
    client_secret,
    'http://127.0.0.1:3333/oauth2callback'
  );

  oAuth2Client.setCredentials(token);
  return oAuth2Client;
}

async function readValues(sheets, range) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range,
  });

  return res.data.values || [];
}

async function writeValues(sheets, range, values) {
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range,
    valueInputOption: 'RAW',
    requestBody: { values },
  });
}

async function getSheetTitles(sheets) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  return meta.data.sheets.map(s => s.properties.title);
}

async function createUniqueSheetTitle(sheets, baseTitle) {
  const titles = new Set(await getSheetTitles(sheets));

  if (!titles.has(baseTitle)) return baseTitle;

  let i = 2;
  while (titles.has(`${baseTitle} (${i})`)) i++;

  return `${baseTitle} (${i})`;
}

async function createSheet(sheets, title) {
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      requests: [
        {
          addSheet: {
            properties: { title },
          },
        },
      ],
    },
  });
}

function isBadResult(result) {
  const notes = (result.notes || '').toLowerCase();

  if (notes === 'unavailable') return false;

  return (
    !result.price ||
    !result.sellerText ||
    notes.includes('manual check required')
  );
}

function cleanNotes(result) {
  const notes = result.notes || '';

  if (!notes) return '';

  if (notes === 'Unavailable') return 'Unavailable';

  if (notes.includes('Amazon Validation Page')) {
    return 'Manual Check Required - Amazon Validation Page';
  }

  if (notes.includes('Page Load Failed')) {
    return 'Manual Check Required - Page Load Failed';
  }

  if (notes.includes('Data Not Extracted')) {
    return 'Manual Check Required - Data Not Extracted';
  }

  return '';
}

async function scrapeWithRetries(item, market) {
  let lastResult = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    console.log(`Scraping ${item.asin} ${market.code}, attempt ${attempt}`);

    const result = await scrapeAsin(item.asin, market.code);
    lastResult = result;

    if (!isBadResult(result)) {
      return {
        ...result,
        notes: cleanNotes(result),
      };
    }

    if (attempt < MAX_ATTEMPTS) {
      console.log(`Retry needed for ${item.asin} ${market.code}. Waiting...`);
      await sleep(DELAY_BETWEEN_RETRIES_MS);
    }
  }

  return {
    ...lastResult,
    price: lastResult?.price || '',
    premiumBeauty: lastResult?.premiumBeauty || 'No',
    buybox: lastResult?.buybox || 'No',
    notes: cleanNotes(lastResult) || 'Manual Check Required - Data Not Extracted',
  };
}

function buildSummary(outputRows) {
  const summaryHeaders = [
    'Market',
    'Total Rows',
    'Buybox Yes',
    'Buybox No',
    'Unavailable',
    'Manual Check Required',
    'Buybox %',
  ];

  const summary = [];

  for (const market of MARKETS) {
    const rows = outputRows.filter(r => r[3] === market.code);

    const total = rows.length;
    const buyboxYes = rows.filter(r => r[6] === 'Yes').length;
    const buyboxNo = rows.filter(r => r[6] === 'No').length;
    const unavailable = rows.filter(r => r[7] === 'Unavailable').length;
    const manualCheck = rows.filter(r => String(r[7]).includes('Manual Check Required')).length;
    const buyboxPct = total ? `${((buyboxYes / total) * 100).toFixed(1)}%` : '0.0%';

    summary.push([
      market.code,
      total,
      buyboxYes,
      buyboxNo,
      unavailable,
      manualCheck,
      buyboxPct,
    ]);
  }

  const totalRows = outputRows.length;
  const totalBuyboxYes = outputRows.filter(r => r[6] === 'Yes').length;
  const totalBuyboxNo = outputRows.filter(r => r[6] === 'No').length;
  const totalUnavailable = outputRows.filter(r => r[7] === 'Unavailable').length;
  const totalManualCheck = outputRows.filter(r => String(r[7]).includes('Manual Check Required')).length;
  const totalBuyboxPct = totalRows ? `${((totalBuyboxYes / totalRows) * 100).toFixed(1)}%` : '0.0%';

  summary.push([
    'TOTAL',
    totalRows,
    totalBuyboxYes,
    totalBuyboxNo,
    totalUnavailable,
    totalManualCheck,
    totalBuyboxPct,
  ]);

  return [summaryHeaders, ...summary];
}

async function main() {
  console.log('Buybox tracker started');

  const auth = await getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  const today = formatPKTDateYYYYMMDD();

  const outputTitle = await createUniqueSheetTitle(sheets, today);
  await createSheet(sheets, outputTitle);
  await writeValues(sheets, `${escapeSheetName(outputTitle)}!A1:H1`, [HEADERS]);

  const rows = await readValues(sheets, "'Sheet1'!A2:B");

  let items = rows
    .map(r => ({
      asin: (r[0] || '').trim(),
      productName: (r[1] || '').trim(),
    }))
    .filter(x => x.asin);

  if (TEST_MODE) {
    items = items.slice(0, TEST_ASIN_LIMIT);
    console.log(`TEST MODE: running first ${items.length} ASINs`);
  }

  const output = [];

  for (const market of MARKETS) {
    console.log(`Starting market: ${market.code}`);

    for (const item of items) {
      const url = `www.amazon.${market.code.toLowerCase()}/dp/${item.asin}`;

      const scraped = await scrapeWithRetries(item, market);

      output.push([
        item.asin,
        url,
        item.productName,
        market.code,
        scraped.price || '',
        scraped.premiumBeauty || 'No',
        scraped.buybox || 'No',
        scraped.notes || '',
      ]);

      await sleep(DELAY_BETWEEN_ROWS_MS);
    }
  }

  if (output.length) {
    await writeValues(
      sheets,
      `${escapeSheetName(outputTitle)}!A2:H${output.length + 1}`,
      output
    );
  }

  const summaryTitle = await createUniqueSheetTitle(sheets, `Summary - ${today}`);
  await createSheet(sheets, summaryTitle);

  const summaryRows = buildSummary(output);

  await writeValues(
    sheets,
    `${escapeSheetName(summaryTitle)}!A1:G${summaryRows.length}`,
    summaryRows
  );

  console.log(`Buybox tracker finished. Output tab: ${outputTitle}`);
  console.log(`Summary tab: ${summaryTitle}`);
}

main().catch(e => {
  console.error('Buybox tracker failed:', e);
  process.exit(1);
});