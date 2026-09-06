(() => {
  if (window.TOTZ_FORGE_CONFIG) return;

  const nativeCurrency = Object.freeze({ name: 'ETH', symbol: 'ETH', decimals: 18 });
  const networks = Object.freeze({
    testnet: Object.freeze({
      key: 'robinhood-testnet',
      environment: 'testnet',
      chainId: 46630,
      hex: '0xb626',
      name: 'Robinhood Chain Testnet',
      rpc: 'https://rpc.testnet.chain.robinhood.com',
      explorer: 'https://explorer.testnet.chain.robinhood.com',
      nativeCurrency
    }),
    mainnet: Object.freeze({
      key: 'robinhood',
      environment: 'mainnet',
      chainId: 4663,
      hex: '0x1237',
      name: 'Robinhood Chain',
      rpc: 'https://rpc.robinhoodchain.com',
      explorer: 'https://robinhoodchain.blockscout.com',
      nativeCurrency
    })
  });

  // Release-candidate safety: Testnet is the only executable claim network.
  // Mainnet is defined now so the UI/backend can be migrated without changing
  // chain constants later, but write actions remain locked until an explicit
  // production release flips the corresponding server + client feature gates.
  const environment = 'testnet';
  const mainnetClaimsEnabled = false;
  const claimNetwork = networks.testnet;

  const config = Object.freeze({
    environment,
    mainnetClaimsEnabled,
    claimNetwork,
    networks,
    services: Object.freeze({
      claims: 'https://yymwpnztjlyfxongwmsw.supabase.co/functions/v1/forge-claims',
      epochIndex: 'https://yymwpnztjlyfxongwmsw.supabase.co/functions/v1/forge-epoch-index'
    })
  });

  function resolveClaimNetwork(value = claimNetwork.chainId) {
    const key = String(value || '').toLowerCase();
    if (value === networks.testnet || value === networks.mainnet) return value;
    if (Number(value) === networks.testnet.chainId || key === networks.testnet.key || key === 'testnet') return networks.testnet;
    if (Number(value) === networks.mainnet.chainId || key === networks.mainnet.key || key === 'mainnet') return networks.mainnet;
    return null;
  }

  function canExecuteClaims(network = claimNetwork) {
    const resolved = resolveClaimNetwork(network);
    if (!resolved) return false;
    if (resolved.environment === 'testnet') return true;
    return resolved.environment === 'mainnet' && config.mainnetClaimsEnabled === true;
  }

  function assertClaimExecutionEnabled(network = claimNetwork) {
    const resolved = resolveClaimNetwork(network);
    if (!resolved) throw new Error('Unsupported FORGE claim network.');
    if (!canExecuteClaims(resolved)) {
      throw new Error('Robinhood Chain mainnet claims are locked until the FORGE mainnet release gate is enabled.');
    }
    return resolved;
  }

  async function ensureClaimNetwork({ requestAccounts = true, network = claimNetwork, requireExecution = true } = {}) {
    if (!window.ethereum?.request) throw new Error('No EVM browser wallet detected.');
    const resolved = resolveClaimNetwork(network);
    if (!resolved) throw new Error('Unsupported FORGE claim network.');
    if (requireExecution) assertClaimExecutionEnabled(resolved);
    if (requestAccounts) {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      if (!accounts?.[0]) throw new Error('Connect a wallet first.');
    }
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: resolved.hex }]
      });
    } catch (error) {
      if (error?.code !== 4902 && !String(error?.message || '').toLowerCase().includes('unrecognized')) throw error;
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: resolved.hex,
          chainName: resolved.name,
          nativeCurrency: resolved.nativeCurrency,
          rpcUrls: [resolved.rpc],
          blockExplorerUrls: [resolved.explorer]
        }]
      });
    }
    return resolved;
  }

  function createReadProvider(network = claimNetwork) {
    if (!window.ethers?.JsonRpcProvider) throw new Error('ethers.js is not loaded.');
    const resolved = resolveClaimNetwork(network);
    if (!resolved) throw new Error('Unsupported FORGE claim network.');
    return new ethers.JsonRpcProvider(resolved.rpc, resolved.chainId, { staticNetwork: true });
  }

  window.TOTZ_FORGE_CONFIG = config;
  window.ForgeRuntime = Object.freeze({
    config,
    networks,
    claimNetwork,
    resolveClaimNetwork,
    canExecuteClaims,
    assertClaimExecutionEnabled,
    ensureClaimNetwork,
    createReadProvider
  });

  document.documentElement.dataset.forgeEnvironment = config.environment;
  document.documentElement.dataset.forgeMainnetClaims = config.mainnetClaimsEnabled ? 'enabled' : 'locked';
})();
