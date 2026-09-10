const ROBINHOOD_ASSETS = 'https://api.robinhood.com/rhj/assets';
const ROBINHOOD_CHAIN_ID = 4663;

const isAddress = value => /^0x[a-fA-F0-9]{40}$/.test(String(value || ''));

export const config = { maxDuration: 15 };

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  try {
    const upstream = await fetch(ROBINHOOD_ASSETS, {
      headers: { accept: 'application/json', 'user-agent': 'TOTZ-FORGE/1.0' },
      signal: AbortSignal.timeout(10000)
    });
    if (!upstream.ok) throw new Error(`Robinhood asset registry returned ${upstream.status}.`);

    const data = await upstream.json();
    const raw = Array.isArray(data?.assets) ? data.assets : [];
    const assets = raw.map(asset => {
      const deployment = Array.isArray(asset?.deployments)
        ? asset.deployments.find(item => Number(item?.chainId) === ROBINHOOD_CHAIN_ID && isAddress(item?.contractAddress))
        : null;
      if (!deployment) return null;
      if (asset?.status && asset.status !== 'ASSET_STATUS_ACTIVE') return null;
      const symbol = String(asset?.tokenSymbol || '').trim().slice(0, 24);
      if (!symbol) return null;
      return {
        symbol,
        name: String(asset?.tokenName || 'Robinhood Stock Token').trim().slice(0, 120),
        address: deployment.contractAddress,
        chainId: ROBINHOOD_CHAIN_ID
      };
    }).filter(Boolean).sort((a, b) => a.symbol.localeCompare(b.symbol));

    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    return res.status(200).json({
      chainId: ROBINHOOD_CHAIN_ID,
      source: 'https://api.robinhood.com/rhj/assets',
      count: assets.length,
      assets
    });
  } catch (error) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).json({ error: error?.message || 'Could not load the official Robinhood Stock Token registry.' });
  }
}
