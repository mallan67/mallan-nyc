/**
 * Does an authorized MediaURL actually RESOLVE to bytes?
 *
 * Maya observed live 404s from /api/media/proxy. The proxy allows the host and
 * attaches the bearer, so the question is whether the provider's own MediaURL
 * serves an image for a listing that CLAIMS PhotosCount > 0. This probes the
 * exact URL the provider handed us, authorized and unauthorized, and records
 * the status and content-type for each. A 404 here is a PROVIDER fact; a 404
 * only when unauthorized is a MALLAN fact. They are not the same defect.
 */
const BASE = process.env.TRESTLE_API_URL || 'https://api.cotality.com/trestle';

async function token() {
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: process.env.IDX_CLIENT_ID,
    client_secret: process.env.IDX_CLIENT_SECRET,
    scope: 'api',
  });
  const r = await fetch(BASE + '/oidc/connect/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!r.ok) throw new Error('token ' + r.status);
  return (await r.json()).access_token;
}

const tok = await token();

// Pull fresh Media rows for a listing that claims photos, including the
// display-authorization field — a photo we may not display is not a defect.
const qs = new URLSearchParams({
  $filter: "ResourceRecordKey eq '1189393822'",
  $select: 'ResourceRecordKey,MediaURL,Order,MediaStatus,MediaCategory,InternetEntireListingDisplayYN,PreferredPhotoYN',
  $orderby: 'Order asc',
  $top: '3',
});
const mr = await fetch(BASE + '/odata/Media?' + qs, { headers: { Authorization: 'Bearer ' + tok } });
console.log('Media query HTTP', mr.status);
const media = (await mr.json()).value || [];
console.log('rows:', media.length);

for (const m of media) {
  console.log('\n--- Order ' + m.Order + ' | status=' + m.MediaStatus +
    ' | category=' + m.MediaCategory + ' | IEDY=' + m.InternetEntireListingDisplayYN + ' ---');
  console.log('url:', String(m.MediaURL).slice(0, 110) + '...');

  for (const mode of ['authorized', 'unauthorized']) {
    try {
      const r = await fetch(m.MediaURL, {
        redirect: 'follow',
        headers: mode === 'authorized' ? { Authorization: 'Bearer ' + tok } : {},
      });
      const buf = mode === 'authorized' && r.ok ? await r.arrayBuffer() : null;
      console.log('  ' + mode.padEnd(13) + ' HTTP ' + r.status +
        ' | content-type=' + (r.headers.get('content-type') || '-') +
        (buf ? ' | bytes=' + buf.byteLength : ''));
    } catch (e) {
      console.log('  ' + mode.padEnd(13) + ' THREW ' + String(e).slice(0, 120));
    }
  }
}
