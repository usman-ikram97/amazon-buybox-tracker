const fs = require('fs');
const path = require('path');
const http = require('http');
const { google } = require('googleapis');

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');
const TOKEN_PATH = path.join(__dirname, 'token.json');

async function main() {
  const creds = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
  const { client_id, client_secret } = creds.installed;

  const redirectUri = 'http://127.0.0.1:3333/oauth2callback';
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirectUri);

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
  });

  const server = http.createServer(async (req, res) => {
    if (!req.url.startsWith('/oauth2callback')) return;

    const urlObj = new URL(req.url, redirectUri);
    const code = urlObj.searchParams.get('code');

    res.end('Authorization successful. You can close this tab.');
    server.close();

    const { tokens } = await oAuth2Client.getToken(code);
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
    console.log('Saved token to', TOKEN_PATH);
  });

  server.listen(3333, '127.0.0.1', async () => {
    console.log('Opening browser for auth...');

    const openMod = await import('open');
    const open = openMod.default;

    await open(authUrl);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});