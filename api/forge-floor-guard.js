// Public Collection Security proxy. OpenSea credentials, contract detection and bot scoring stay server-side.
const COLLECTION_SECURITY_DATA = 'https://yymwpnztjlyfxongwmsw.supabase.co/functions/v1/forge-collection-security-data';

function safeAddress(value) {
  const wallet = String(value || '').trim().toLowerCase();
  return /^0x[a-f0-9]{40}$/.test(wallet) ? wallet : '';
}

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const mode = String(req.query?.mode || 'scan').toLowerCase();
  if (!['scan', 'wallet', 'database'].includes(mode)) {
    return res.status(400).json({ error: 'Unsupported Collection Security mode.' });
  }

  const url = new URL(COLLECTION_SECURITY_DATA);
  url.searchParams.set('mode', mode);

  if (mode === 'scan') {
    const contract = safeAddress(req.query?.contract);
    if (!contract) return res.status(400).json({ error: 'Paste a valid EVM NFT contract address.' });
    url.searchParams.set('contract', contract);
  } else if (mode === 'wallet') {
    const wallet = safeAddress(req.query?.wallet);
    if (!wallet) return res.status(400).json({ error: 'Paste a valid EVM wallet address.' });
    url.searchParams.set('wallet', wallet);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 55000);
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { accept: 'application/json', 'user-agent': 'TOTZ-FORGE-COLLECTION-SECURITY/1.0' },
      signal: controller.signal
    });
    const data = await response.json().catch(() => ({}));
    const cache = mode === 'scan' ? 's-maxage=20, stale-while-revalidate=60' : mode === 'database' ? 's-maxage=20, stale-while-revalidate=60' : 's-maxage=30, stale-while-revalidate=90';
    res.setHeader('Cache-Control', response.ok ? cache : 'no-store');
    return res.status(response.status).json(data);
  } catch (error) {
    const message = error?.name === 'AbortError' ? 'Collection security scan timed out.' : String(error?.message || 'Collection security data broker failed.');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).json({ error: 'Could not read collection security intelligence right now.', detail: message });
  } finally {
    clearTimeout(timer);
  }
}
