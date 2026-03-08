// Check if /api/listings returns photos AND if the proxy works
const https = require('https');

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    }).on('error', reject);
  });
}

async function main() {
  // Step 1: Get listings
  const listRes = await fetch('https://mallan.nyc/api/listings?type=buy&limit=3');
  console.log('API status:', listRes.status);
  const data = JSON.parse(listRes.body.toString());
  console.log('Listings:', data.count);

  if (!data.listings || data.listings.length === 0) {
    console.log('No listings returned!');
    return;
  }

  // Step 2: Check media on first listing with photos
  for (var i = 0; i < data.listings.length; i++) {
    var l = data.listings[i];
    var addr = (l.address.streetNumber || '') + ' ' + (l.address.streetName || '');
    console.log('\n[' + i + '] ' + addr.trim() + ' | media: ' + (l.media ? l.media.length : 0));
    if (l.media && l.media.length > 0) {
      var proxyPath = l.media[0].url;
      console.log('    Proxy path: ' + proxyPath);

      // Test the proxy
      var proxyUrl = 'https://mallan.nyc' + proxyPath;
      try {
        var proxyRes = await fetch(proxyUrl);
        console.log('    Proxy status: ' + proxyRes.status);
        console.log('    Content-Type: ' + (proxyRes.headers['content-type'] || 'none'));
        console.log('    Body size: ' + proxyRes.body.length + ' bytes');
        if (proxyRes.status !== 200) {
          console.log('    Response body: ' + proxyRes.body.toString().substring(0, 200));
        }
      } catch (e) {
        console.log('    Proxy error: ' + e.message);
      }
      break; // only test first one
    }
  }
}

main().catch(console.error);
