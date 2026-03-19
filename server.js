const https = require('https');
const http = require('http');

const PORT = process.env.PORT || 3000;
const ODDS_API_KEY = process.env.ODDS_API_KEY || '';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key, anthropic-version');

  console.log(req.method, req.url);

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Health check
  if (req.url === '/' || req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', oddsKey: !!ODDS_API_KEY, claudeKey: !!ANTHROPIC_API_KEY }));
    return;
  }

  // ── Claude API proxy ──
  if (req.url === '/claude' && req.method === 'POST') {
    if (!ANTHROPIC_API_KEY) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'ANTHROPIC_API_KEY not set on server' }));
      return;
    }
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      const options = {
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'Content-Length': Buffer.byteLength(body)
        }
      };
      const apiReq = https.request(options, (apiRes) => {
        let data = '';
        apiRes.on('data', chunk => data += chunk);
        apiRes.on('end', () => {
          console.log('Claude status:', apiRes.statusCode);
          res.writeHead(apiRes.statusCode, { 'Content-Type': 'application/json' });
          res.end(data);
        });
      });
      apiReq.on('error', (err) => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      });
      apiReq.write(body);
      apiReq.end();
    });
    return;
  }

  // ── Odds API proxy ──
  // Expects: /aussierules_afl?regions=au&markets=h2h&oddsFormat=decimal
  if (!ODDS_API_KEY) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'ODDS_API_KEY not set' }));
    return;
  }

  const path = req.url.startsWith('/') ? req.url.slice(1) : req.url;
  const separator = path.includes('?') ? '&' : '?';
  const apiUrl = `https://api.the-odds-api.com/v4/sports/${path}${separator}apiKey=${ODDS_API_KEY}`;
  console.log('Odds URL:', apiUrl.replace(ODDS_API_KEY, '***'));

  https.get(apiUrl, (apiRes) => {
    let data = '';
    apiRes.on('data', chunk => data += chunk);
    apiRes.on('end', () => {
      console.log('Odds status:', apiRes.statusCode, 'bytes:', data.length);
      res.writeHead(apiRes.statusCode, { 'Content-Type': 'application/json' });
      res.end(data);
    });
  }).on('error', (err) => {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  });
});

server.listen(PORT, () => {
  console.log(`Syndikate proxy on port ${PORT} | odds:${!!ODDS_API_KEY} claude:${!!ANTHROPIC_API_KEY}`);
});
