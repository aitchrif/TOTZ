(() => {
  const TESTNET = {
    chainId: 46630,
    hex: '0xb626',
    name: 'Robinhood Chain Testnet',
    rpc: 'https://rpc.testnet.chain.robinhood.com',
    explorer: 'https://explorer.testnet.chain.robinhood.com'
  };

  const $ = id => document.getElementById(id);
  const short = a => a ? `${a.slice(0,6)}…${a.slice(-4)}` : '—';
  let deploying = false;

  function setStatus(message, type='') {
    const el = $('testTokenStatus');
    if (!el) return;
    el.textContent = message;
    el.className = `status show ${type}`;
  }

  async function ensureTestnet() {
    if (!window.ethereum?.request) throw new Error('No EVM browser wallet detected.');
    const accounts = await window.ethereum.request({method:'eth_requestAccounts'});
    if (!accounts?.[0]) throw new Error('Connect a wallet first.');
    try {
      await window.ethereum.request({method:'wallet_switchEthereumChain', params:[{chainId:TESTNET.hex}]});
    } catch (e) {
      if (e?.code === 4902 || String(e?.message || '').toLowerCase().includes('unrecognized')) {
        await window.ethereum.request({
          method:'wallet_addEthereumChain',
          params:[{
            chainId:TESTNET.hex,
            chainName:TESTNET.name,
            nativeCurrency:{name:'ETH',symbol:'ETH',decimals:18},
            rpcUrls:[TESTNET.rpc],
            blockExplorerUrls:[TESTNET.explorer]
          }]
        });
      } else throw e;
    }
    return new ethers.BrowserProvider(window.ethereum);
  }

  async function loadArtifact() {
    const r = await fetch('/artifacts/ForgeTestUSDG.json', {cache:'no-store'});
    if (!r.ok) throw new Error('Test-token artifact is not ready yet. Refresh in a moment.');
    const a = await r.json();
    if (!a?.abi || !/^0x[0-9a-f]+$/i.test(a?.bytecode || '')) throw new Error('Invalid test-token artifact.');
    return a;
  }

  async function createToken() {
    if (deploying) return;
    deploying = true;
    const btn = $('createTestTokenBtn');
    if (btn) btn.disabled = true;
    setStatus('Preparing a fixed-supply tUSDG token on Robinhood Chain Testnet…');
    try {
      const provider = await ensureTestnet();
      const signer = await provider.getSigner();
      const signerAddress = await signer.getAddress();
      const balance = await provider.getBalance(signerAddress);
      if (balance === 0n) throw new Error('This wallet has no testnet ETH for gas. Use the Robinhood testnet faucet first.');

      const artifact = await loadArtifact();
      const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, signer);
      setStatus('MetaMask approval required. This deploys TEST tokens only; no real funds are used.','warn');
      const token = await factory.deploy();
      await token.waitForDeployment();
      const address = (await token.getAddress()).toLowerCase();

      const [symbol, decimals, tokenBalance] = await Promise.all([
        token.symbol(), token.decimals(), token.balanceOf(signerAddress)
      ]);
      if (String(symbol) !== 'tUSDG' || Number(decimals) !== 6) throw new Error('Deployed test token failed metadata verification.');

      const input = $('tokenInput');
      if (input) {
        input.value = address;
        input.dispatchEvent(new Event('input', {bubbles:true}));
        input.dispatchEvent(new Event('change', {bubbles:true}));
      }
      if ($('tokenSymbol')) $('tokenSymbol').textContent = 'tUSDG';
      if ($('tokenDecimals')) $('tokenDecimals').textContent = '6';

      const amount = ethers.formatUnits(tokenBalance, 6);
      setStatus(`Test token ready ✓ ${amount} tUSDG minted to ${short(signerAddress)}. Contract ${short(address)} was filled in automatically.`, 'ok');
      if (btn) {
        btn.textContent = 'TEST TOKEN READY ✓';
        btn.disabled = true;
      }
      const open = $('testTokenExplorer');
      if (open) {
        open.href = `${TESTNET.explorer}/address/${address}`;
        open.style.display = 'inline-flex';
      }

      try {
        await window.ethereum.request({
          method:'wallet_watchAsset',
          params:{type:'ERC20',options:{address,symbol:'tUSDG',decimals:6}}
        });
      } catch (_) {}
    } catch (e) {
      setStatus(e?.shortMessage || e?.message || 'Could not create the test token.', 'error');
      if (btn) btn.disabled = false;
    } finally {
      deploying = false;
    }
  }

  function install() {
    const switchBtn = $('switchBtn');
    if (!switchBtn || $('createTestTokenBtn')) return;
    const actions = switchBtn.parentElement;
    if (!actions) return;

    const btn = document.createElement('button');
    btn.id = 'createTestTokenBtn';
    btn.type = 'button';
    btn.className = 'btn good';
    btn.textContent = 'CREATE TEST TOKEN';
    btn.addEventListener('click', createToken);
    actions.insertBefore(btn, switchBtn);

    const explorer = document.createElement('a');
    explorer.id = 'testTokenExplorer';
    explorer.className = 'btn ghost';
    explorer.target = '_blank';
    explorer.rel = 'noopener';
    explorer.textContent = 'OPEN TEST TOKEN ↗';
    explorer.style.display = 'none';
    actions.appendChild(explorer);

    const note = document.createElement('div');
    note.id = 'testTokenStatus';
    note.className = 'status show warn';
    note.textContent = 'New to test tokens? CREATE TEST TOKEN deploys 100,000 fixed-supply tUSDG (6 decimals) to your connected wallet on Chain 46630 and fills the reward-token field automatically.';
    actions.parentElement.insertBefore(note, actions.nextSibling);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
})();
