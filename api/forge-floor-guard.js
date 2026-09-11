// Public FLOOR GUARD proxy. Marketplace credentials and scoring stay in persistent Supabase brokers.
const FLOOR_GUARD_DATA = 'https://yymwpnztjlyfxongwmsw.supabase.co/functions/v1/forge-floor-guard-data';
const COLLECTION_SECURITY_DATA = 'https://yymwpnztjlyfxongwmsw.supabase.co/functions/v1/forge-collection-security-data';

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

function safeWallet(value) {
  const wallet = String(value || '').trim().toLowerCase();
  return /^0x[a-f0-9]{40}$/.test(wallet) ? wallet : '';
}

function safeChain(value) {
  const chain = String(value || '').trim().toLowerCase();
  return /^[a-z0-9_-]{1,40}$/.test(chain) ? chain : '';
}

export const config = { maxDuration: 45 };

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const mode = String(req.query?.mode || 'security').toLowerCase();
  if (!['security', 'collection', 'wallet', 'database'].includes(mode)) {
    return res.status(400).json({ error: 'Unsupported FLOOR GUARD mode.' });
  }

  const url = new URL(mode === 'security' ? COLLECTION_SECURITY_DATA : FLOOR_GUARD_DATA);
  if (mode !== 'security') url.searchParams.set('mode', mode);

  if (mode === 'security') {
    const contract = safeWallet(req.query?.contract);
    const chain = safeChain(req.query?.chain);
    if (!contract) return res.status(400).json({ error: 'Paste a valid 0x EVM collection contract address.' });
    url.searchParams.set('contract', contract);
    if (chain) url.searchParams.set('chain', chain);
  } else if (mode === 'collection') {
    const slug = safeSlug(req.query?.collection || req.query?.slug);
    const hours = [1, 6, 24, 72, 168].includes(Number(req.query?.hours)) ? Number(req.query.hours) : 24;
    if (!slug) return res.status(400).json({ error: 'Paste a valid OpenSea collection URL or collection slug.' });
    url.searchParams.set('collection', slug);
    url.searchParams.set('hours', String(hours));
  } else if (mode === 'wallet') {
    const wallet = safeWallet(req.query?.wallet);
    if (!wallet) return res.status(400).json({ error: 'Paste a valid EVM wallet address.' });
    url.searchParams.set('wallet', wallet);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), mode === 'security' ? 42000 : 28000);
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { accept: 'application/json', 'user-agent': 'TOTZ-FORGE-COLLECTION-SECURITY/1.0' },
      signal: controller.signal
    });
    const data = await response.json().catch(() => ({}));
    res.setHeader('Cache-Control', response.ok ? 's-maxage=30, stale-while-revalidate=90' : 'no-store');
    return res.status(response.status).json(data);
  } catch (error) {
    const message = error?.name === 'AbortError' ? 'Collection security data broker timed out.' : String(error?.message || 'Collection security data broker failed.');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).json({ error: 'Could not read FLOOR GUARD intelligence right now.', detail: message });
  } finally {
    clearTimeout(timer);
  }
}
