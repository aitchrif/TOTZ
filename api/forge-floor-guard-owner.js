// Verified collection-owner workspace proxy. This endpoint never submits blockchain transactions.
const OWNER_BROKER = 'https://yymwpnztjlyfxongwmsw.supabase.co/functions/v1/forge-collection-security-owner';
const ACTIONS = new Set(['challenge', 'verify', 'workspace', 'watchlist_upsert', 'watchlist_remove', 'monitoring']);

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const action = String(body.action || '').toLowerCase();
  if (!ACTIONS.has(action)) return res.status(400).json({ error: 'Unsupported owner action.' });

  const encoded = JSON.stringify(body);
  if (encoded.length > 12000) return res.status(413).json({ error: 'Request too large.' });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 28000);
  try {
    const response = await fetch(OWNER_BROKER, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'user-agent': 'TOTZ-FORGE-COLLECTION-SECURITY/1.0',
        ...(req.headers['x-forge-session'] ? { 'x-forge-session': String(req.headers['x-forge-session']) } : {})
      },
      body: encoded,
      signal: controller.signal
    });
    const data = await response.json().catch(() => ({}));
    res.setHeader('Cache-Control', 'no-store');
    return res.status(response.status).json(data);
  } catch (error) {
    const message = error?.name === 'AbortError' ? 'Owner verification timed out.' : String(error?.message || 'Owner workspace broker failed.');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).json({ error: 'Could not complete the owner workspace action.', detail: message });
  } finally {
    clearTimeout(timer);
  }
}
