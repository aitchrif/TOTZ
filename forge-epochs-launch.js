(() => {
  function install(){
    const btn=document.getElementById('generateMerkleBtn');
    if(!btn||document.getElementById('launchClaimBtn'))return;
    const actions=btn.parentElement;
    if(!actions)return;
    const a=document.createElement('a');
    a.id='launchClaimBtn';
    a.href='/forge-claim-launcher';
    a.className='btn good';
    a.textContent='LAUNCH TESTNET CLAIM →';
    a.style.display='none';
    actions.appendChild(a);
    const result=document.getElementById('merkleResult');
    const obs=new MutationObserver(()=>{if(result&&!result.hidden)a.style.display='inline-flex';});
    if(result){obs.observe(result,{attributes:true,attributeFilter:['hidden']});if(!result.hidden)a.style.display='inline-flex';}
    btn.addEventListener('click',()=>setTimeout(()=>{if(result&&!result.hidden)a.style.display='inline-flex';},250));
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
})();