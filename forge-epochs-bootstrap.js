(() => {
  const ETHERS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/ethers/6.15.0/ethers.umd.min.js';
  const ETHERS_INTEGRITY = 'sha512-UXYETj+vXKSURF1UlgVRLzWRS9ZiQTv3lcL4rbeLyqTXCPNZC6PTLF/Ik3uxm2Zo+E109cUpJPZfLxJsCgKSng==';

  const loadRewardTokenFeature = () => {
    if (document.querySelector('script[data-forge-reward-token]')) return;
    const feature = document.createElement('script');
    feature.src = '/forge-epoch-reward-token.js?v=2';
    feature.dataset.forgeRewardToken = '1';
    feature.async = true;
    document.body.appendChild(feature);
  };

  if (window.ethers) {
    loadRewardTokenFeature();
    return;
  }

  const ethersScript = document.createElement('script');
  ethersScript.src = ETHERS_URL;
  ethersScript.integrity = ETHERS_INTEGRITY;
  ethersScript.crossOrigin = 'anonymous';
  ethersScript.referrerPolicy = 'no-referrer';
  ethersScript.async = true;
  ethersScript.dataset.forgeEthers = '1';
  ethersScript.onload = loadRewardTokenFeature;
  ethersScript.onerror = () => console.warn('FORGE: verified ethers enhancement unavailable; core EPOCHS remains active.');
  document.body.appendChild(ethersScript);
})();
