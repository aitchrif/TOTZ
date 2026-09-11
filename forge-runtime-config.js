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
      rpc: 'https://rpc.mainnet.chain.robinhood.com',
      explorer: 'https://robinhoodchain.blockscout.com',
      nativeCurrency
    })
  });

  // Production integration baseline: the public FORGE surface reads Robinhood
  // Mainnet, but NEW deploy/fund/publish actions stay fail-closed until an
  // explicit controlled release flips both the client and server gates.
  // Already-published verified claims remain interactable after lockdown.
  const environment = 'mainnet';
  const mainnetClaimsEnabled = false;
  const claimNetwork = networks.mainnet;
  const testHelpersEnabled = claimNetwork.chainId === networks.testnet.chainId && claimNetwork.environment === 'testnet';

  const config = Object.freeze({
    environment,
    mainnetClaimsEnabled,
    testHelpersEnabled,
    claimNetwork,
    networks,
    services: Object.freeze({
      claims: 'https://yymwpnztjlyfxongwmsw.supabase.co/functions/v1/forge-claims-gateway',
      epochIndex: 'https://yymwpnztjlyfxongwmsw.supabase.co/functions/v1/forge-epoch-index',
      // Direct-claim production mode: holder pays the network gas.
      // Keep the gasless relay unreachable from the public claim UI/runtime.
      gaslessRelay: ''
    })
  });

  function resolveClaimNetwork(value = claimNetwork.chainId) {
    const key = String(value || '').toLowerCase();
    if (value === networks.testnet || value === networks.mainnet) return value;
    if (Number(value) === networks.testnet.chainId || key === networks.testnet.key || key === 'testnet') return networks.testnet;
    if (Number(value) === networks.mainnet.chainId || key === networks.mainnet.key || key === 'mainnet') return networks.mainnet;
    return null;
  }

  // Backwards-compatible name used by launcher/review code. This is a LAUNCH
  // permission, not permission to interact with an already-published epoch.
  function canExecuteClaims(network = claimNetwork) {
    const resolved = resolveClaimNetwork(network);
    if (!resolved) return false;
    if (resolved.environment === 'testnet') return true;
    return resolved.environment === 'mainnet' && config.mainnetClaimsEnabled === true;
  }

  function canInteractWithPublishedClaim(network = claimNetwork) {
    // Publication already passed FORGE server verification, runtime attestation,
    // DB release policy and immutable metadata checks. A later launch kill switch
    // must not prevent holders/sponsor from using that verified on-chain contract.
    return Boolean(resolveClaimNetwork(network));
  }

  function assertClaimExecutionEnabled(network = claimNetwork) {
    const resolved = resolveClaimNetwork(network);
    if (!resolved) throw new Error('Unsupported FORGE claim network.');
    if (!canExecuteClaims(resolved)) {
      throw new Error('Robinhood Chain mainnet claim launches are locked until the FORGE mainnet release gate is enabled.');
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

  function installTestHelperGuard() {
    if (config.testHelpersEnabled) return;
    const selector = '#createTestTokenBtn,#createEpochTestTokenBtn,#useSavedTestTokenBtn,#quickTestCard,#testTokenExplorer,#testTokenStatus,.test-token-helper,#rewardTestTokenStatus';
    const suppress = () => {
      document.querySelectorAll(selector).forEach(el => {
        try { if ('disabled' in el) el.disabled = true; } catch (_) {}
        el.setAttribute('hidden', '');
        el.style.display = 'none';
        el.setAttribute('aria-hidden', 'true');
      });
    };
    document.addEventListener('click', event => {
      const target = event.target?.closest?.(selector);
      if (!target) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    }, true);
    const start = () => {
      suppress();
      const root = document.documentElement || document.body;
      if (root) new MutationObserver(suppress).observe(root, { childList: true, subtree: true });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
  }

  function installLockedClaimUiGuard() {
    if (canExecuteClaims(claimNetwork)) return;
    // Scope this guard to NEW epoch launch controls only. Published verified
    // claims and sponsor recovery must remain usable after a later launch lock.
    const selector = '#deployBtn,#fundBtn,#publishBtn,#tokenPolicyAck,#reviewAck';
    const message = `${claimNetwork.name} new claim launches are locked until the FORGE mainnet release gate is enabled.`;
    const lock = () => {
      document.querySelectorAll(selector).forEach(el => {
        try { if ('disabled' in el) el.disabled = true; } catch (_) {}
        el.setAttribute('aria-disabled', 'true');
      });
      const review = document.getElementById('finalReviewStatus');
      if (review) {
        review.textContent = message;
        review.className = 'status show warn';
      }
      const networkChip = document.getElementById('claimNetworkChip');
      if (networkChip) networkChip.textContent = `🔒 ${claimNetwork.name} · new launches locked`;
    };
    document.addEventListener('click', event => {
      const target = event.target?.closest?.(selector);
      if (!target) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      lock();
    }, true);
    const start = () => {
      lock();
      const root = document.documentElement || document.body;
      if (root) new MutationObserver(lock).observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
  }

  function installGlobalSiteShell() {
    if (window.__TOTZ_UI_BRAND_ACTIVE__ || document.querySelector('script[data-totz-ui-brand]')) return;
    const script = document.createElement('script');
    script.src = '/totz-ui-brand.js?v=2';
    script.dataset.totzUiBrand = '1';
    script.async = true;
    document.head.appendChild(script);
  }

  function installEpochRewardPicker() {
    const path = String(location.pathname || '').replace(/\/+$/, '') || '/';
    if (path !== '/forge/epochs' && path !== '/forge-epochs') return;
    if (document.querySelector('script[data-forge-epoch-reward-picker]')) return;
    const script = document.createElement('script');
    script.src = '/forge-epoch-reward-picker.js?v=1';
    script.dataset.forgeEpochRewardPicker = '1';
    script.async = true;
    document.head.appendChild(script);
  }

  window.TOTZ_FORGE_CONFIG = config;
  window.ForgeRuntime = Object.freeze({
    config,
    networks,
    claimNetwork,
    resolveClaimNetwork,
    canExecuteClaims,
    canInteractWithPublishedClaim,
    assertClaimExecutionEnabled,
    ensureClaimNetwork,
    createReadProvider
  });

  document.documentElement.dataset.forgeEnvironment = config.environment;
  document.documentElement.dataset.forgeMainnetClaims = config.mainnetClaimsEnabled ? 'enabled' : 'locked';
  document.documentElement.dataset.forgeTestHelpers = config.testHelpersEnabled ? 'enabled' : 'locked';
  installTestHelperGuard();
  installLockedClaimUiGuard();
  installGlobalSiteShell();
  installEpochRewardPicker();
})();