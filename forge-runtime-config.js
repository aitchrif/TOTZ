(() => {
  if (window.TOTZ_FORGE_CONFIG) return;

  const claimNetwork = Object.freeze({
    key: 'robinhood-testnet',
    chainId: 46630,
    hex: '0xb626',
    name: 'Robinhood Chain Testnet',
    rpc: 'https://rpc.testnet.chain.robinhood.com',
    explorer: 'https://explorer.testnet.chain.robinhood.com',
    nativeCurrency: Object.freeze({ name: 'ETH', symbol: 'ETH', decimals: 18 })
  });

  const config = Object.freeze({
    environment: 'testnet',
    mainnetClaimsEnabled: false,
    claimNetwork,
    services: Object.freeze({
      claims: 'https://yymwpnztjlyfxongwmsw.supabase.co/functions/v1/forge-claims',
      epochIndex: 'https://yymwpnztjlyfxongwmsw.supabase.co/functions/v1/forge-epoch-index'
    })
  });

  async function ensureClaimNetwork({ requestAccounts = true } = {}) {
    if (!window.ethereum?.request) throw new Error('No EVM browser wallet detected.');
    if (requestAccounts) {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      if (!accounts?.[0]) throw new Error('Connect a wallet first.');
    }
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: claimNetwork.hex }]
      });
    } catch (error) {
      if (error?.code !== 4902 && !String(error?.message || '').toLowerCase().includes('unrecognized')) throw error;
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: claimNetwork.hex,
          chainName: claimNetwork.name,
          nativeCurrency: claimNetwork.nativeCurrency,
          rpcUrls: [claimNetwork.rpc],
          blockExplorerUrls: [claimNetwork.explorer]
        }]
      });
    }
    return claimNetwork;
  }

  window.TOTZ_FORGE_CONFIG = config;
  window.ForgeRuntime = Object.freeze({
    config,
    claimNetwork,
    ensureClaimNetwork,
    createReadProvider() {
      if (!window.ethers?.JsonRpcProvider) throw new Error('ethers.js is not loaded.');
      return new ethers.JsonRpcProvider(claimNetwork.rpc, claimNetwork.chainId, { staticNetwork: true });
    }
  });

  document.documentElement.dataset.forgeEnvironment = config.environment;
})();
