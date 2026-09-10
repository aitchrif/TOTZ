const FLOOR_GUARD_DATA = 'https://yymwpnztjlyfxongwmsw.supabase.co/functions/v1/forge-floor-guard-data';

function safeSlug(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  let slug = raw;
  try {
    const url = new URL(raw);
    if (url.hostname === 'opensea.io' || url.hostname.endsWith('.opensea.io')) {
      const parts = url.pathname.split('/').filter(Boolean);
      const index = parts.findIndex((part) => part.toLowerCase() === 'collection');
      if (index >= 0 && parts[index + 1]) slug = parts[index + 1];
    }
  } catch (_) {}
  slug = String(slug).replace(/^collection\//i, '').split(/[?#/]/)[0].trim();
  return /^[a-zA-Z0-9_-]{1,120}$/.test(slug) ? slug : '';
}

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const slug = safeSlug(req.query?.collection || req.query?.slug);
  const hours = [1, 6, 24, 72, 168].includes(Number(req.query?.hours)) ? Number(req.query.hours) : 24;
  if (!slug) return res.status(400).json({ error: 'Paste a valid OpenSea collection URL or collection slug.' });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 28000);
  try {
    const url = new URL(FLOOR_GUARD_DATA);
    url.searchParams.set('collection', slug);
    url.searchParams.set('hours', String(hours));
    const response = await fetch(url, {
      method: 'GET',
      headers: { accept: 'application/json', 'user-agent': 'TOTZ-FORGE-FLOOR-GUARD/1.0' },
      signal: controller.signal
    });
    const data = await response.json().catch(() => ({}));
    res.setHeader('Cache-Control', response.ok ? 's-maxage=30, stale-while-revalidate=90' : 'no-store');
    return res.status(response.status).json(data);
  } catch (error) {
    const message = error?.name === 'AbortError' ? 'Marketplace data broker timed out.' : String(error?.message || 'Marketplace data broker failed.');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).json({ error: 'Could not read OpenSea marketplace data right now.', detail: message });
  } finally {
    clearTimeout(timer);
  }
}
