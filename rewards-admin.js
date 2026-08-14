const API = 'https://yymwpnztjlyfxongwmsw.supabase.co/functions/v1/totz-rewards';
const CHAIN_ID = 4663;
const CHAIN_HEX = '0x1237';
const CONTRACT = '0x107c4e7cf931b18e022d40184d03d00b4ec99d5a';

let wallet = null;
let raffles = [];
let busy = false;

const $ = (id) => document.getElementById(id);
const statusEl = $('status');

function showStatus(message, type = '') {
  statusEl.textContent = message;
  statusEl.className = `status show ${type}`;
}
function shortWallet(value) { return `${value.slice(0, 6)}…${value.slice(-4)}`; }
function utf8ToHex(text) { return '0x' + Array.from(new TextEncoder().encode(text)).map(b => b.toString(16).padStart(2, '0')).join(''); }
function fmtDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
async function api(body, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal, cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  } finally { clearTimeout(timer); }
}
async function ensureRobinhoodChain() {
  const chainId = await window.ethereum.request({ method: 'eth_chainId' });
  if (chainId.toLowerCase() === CHAIN_HEX) return;
  await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_HEX }] });
}
async function signMessage(message) {
  return window.ethereum.request({ method: 'personal_sign', params: [utf8ToHex(message), wallet] });
}
function adminAccessMessage(timestamp) {
  return [
    'TOTZ Rewards Admin',
    'Action: admin_access',
    `Wallet: ${wallet}`,
    `Chain ID: ${CHAIN_ID}`,
    `Contract: ${CONTRACT}`,
    `Timestamp: ${timestamp}`
  ].join('\n');
}
function normalizeForm() {
  const title = $('title').value.trim();
  const description = $('description').value.trim().replace(/\r?\n/g, ' ');
  const prizeName = $('prizeName').value.trim();
  const prizeImageUrl = $('prizeImageUrl').value.trim();
  const entryCost = Number($('entryCost').value).toString();
  const maxRaw = $('maxEntries').value.trim();
  const maxEntries = maxRaw === '' ? null : Number(maxRaw);
  const startsAt = new Date($('startsAt').value).toISOString();
  const endsAt = new Date($('endsAt').value).toISOString();
  const active = $('active').checked;
  if (!title || !prizeName || !Number.isFinite(Number(entryCost))) throw new Error('Complete the required fields.');
  if (new Date(endsAt) <= new Date(startsAt)) throw new Error('End date must be after start date.');
  return { title, description, prizeName, prizeImageUrl, entryCost, maxEntries, startsAt, endsAt, active };
}
function saveMessage(raffleId, p, timestamp) {
  return [
    'TOTZ Rewards Admin',
    'Action: save_raffle',
    `Wallet: ${wallet}`,
    `Raffle ID: ${raffleId || 'new'}`,
    `Title: ${p.title}`,
    `Description: ${p.description}`,
    `Prize: ${p.prizeName}`,
    `Image URL: ${p.prizeImageUrl || 'none'}`,
    `Entry Cost: ${p.entryCost}`,
    `Max Entries: ${p.maxEntries ?? 'unlimited'}`,
    `Starts At: ${p.startsAt}`,
    `Ends At: ${p.endsAt}`,
    `Active: ${p.active}`,
    `Chain ID: ${CHAIN_ID}`,
    `Contract: ${CONTRACT}`,
    `Timestamp: ${timestamp}`
  ].join('\n');
}
function setActiveMessage(raffleId, active, timestamp) {
  return [
    'TOTZ Rewards Admin',
    'Action: set_raffle_active',
    `Wallet: ${wallet}`,
    `Raffle ID: ${raffleId}`,
    `Active: ${active}`,
    `Chain ID: ${CHAIN_ID}`,
    `Contract: ${CONTRACT}`,
    `Timestamp: ${timestamp}`
  ].join('\n');
}

async function connectAdmin() {
  if (!window.ethereum) return showStatus('No EVM wallet detected.', 'error');
  if (busy) return;
  busy = true;
  $('connectBtn').disabled = true;
  try {
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    wallet = accounts?.[0]?.toLowerCase();
    if (!wallet) throw new Error('No wallet selected.');
    await ensureRobinhoodChain();
    const timestamp = Date.now();
    showStatus('Sign once to open the Rewards Admin dashboard.');
    const signature = await signMessage(adminAccessMessage(timestamp));
    const data = await api({ action: 'admin_list', wallet, timestamp, signature });
    raffles = data.raffles || [];
    $('connectBtn').textContent = shortWallet(wallet);
    $('connectTitle').textContent = 'Admin connected';
    $('connectSub').innerHTML = `Authorized wallet <span class="wallet-chip">${shortWallet(wallet)}</span>`;
    $('adminArea').hidden = false;
    showStatus('Admin access granted.', 'ok');
    renderRaffles();
    resetForm();
  } catch (error) {
    showStatus(error.message || 'Admin access failed.', 'error');
  } finally {
    busy = false;
    $('connectBtn').disabled = false;
  }
}
async function refreshAdmin() {
  if (!wallet || busy) return;
  busy = true;
  $('refreshBtn').disabled = true;
  try {
    const timestamp = Date.now();
    showStatus('Sign to refresh admin data.');
    const signature = await signMessage(adminAccessMessage(timestamp));
    const data = await api({ action: 'admin_list', wallet, timestamp, signature });
    raffles = data.raffles || [];
    renderRaffles();
    showStatus('Rewards refreshed.', 'ok');
  } catch (error) { showStatus(error.message || 'Could not refresh.', 'error'); }
  finally { busy = false; $('refreshBtn').disabled = false; }
}
function renderRaffles() {
  const list = $('raffleList');
  if (!raffles.length) {
    list.innerHTML = '<div class="empty">No rewards yet. Create your first raffle.</div>';
    return;
  }
  list.innerHTML = '';
  for (const raffle of raffles) {
    const ended = Date.now() >= Date.parse(raffle.ends_at);
    const el = document.createElement('article');
    el.className = 'raffle';
    el.innerHTML = `
      <div class="raffle-top">
        <div><h3>${escapeHtml(raffle.title)}</h3><div class="meta">${escapeHtml(raffle.prize_name)} · ${Number(raffle.entry_cost)} PTS / entry<br>${raffle.max_entries_per_wallet ? `Max ${raffle.max_entries_per_wallet} / wallet` : 'Unlimited entries'} · Ends ${fmtDate(raffle.ends_at)}</div></div>
        <span class="tag ${raffle.active && !ended ? 'on' : 'off'}">${ended ? 'ENDED' : raffle.active ? 'ACTIVE' : 'PAUSED'}</span>
      </div>
      <div class="meta">${Number(raffle.totalEntries || 0)} total entries · ${Number(raffle.totalPointsSpent || 0).toLocaleString()} PTS spent</div>
      <div class="raffle-actions">
        <button class="btn sky edit-btn">EDIT</button>
        <button class="btn ${raffle.active ? 'ghost' : 'dark'} active-btn" ${ended ? 'disabled' : ''}>${raffle.active ? 'PAUSE' : 'ACTIVATE'}</button>
      </div>`;
    el.querySelector('.edit-btn').addEventListener('click', () => editRaffle(raffle));
    el.querySelector('.active-btn').addEventListener('click', () => toggleActive(raffle));
    list.appendChild(el);
  }
}
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}
function editRaffle(r) {
  $('raffleId').value = r.id;
  $('title').value = r.title || '';
  $('description').value = r.description || '';
  $('prizeName').value = r.prize_name || '';
  $('prizeImageUrl').value = r.prize_image_url || '';
  $('entryCost').value = Number(r.entry_cost || 0);
  $('maxEntries').value = r.max_entries_per_wallet ?? '';
  $('startsAt').value = toLocalInput(r.starts_at);
  $('endsAt').value = toLocalInput(r.ends_at);
  $('active').checked = Boolean(r.active);
  $('formTitle').textContent = 'Edit Raffle';
  $('saveBtn').textContent = 'SAVE CHANGES';
  updatePreview();
  window.scrollTo({ top: document.querySelector('.form-card').getBoundingClientRect().top + window.scrollY - 18, behavior: 'smooth' });
}
function resetForm() {
  $('raffleForm').reset();
  $('raffleId').value = '';
  $('entryCost').value = '10';
  const start = new Date(Date.now() + 5 * 60 * 1000);
  const end = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  $('startsAt').value = toLocalInput(start.toISOString());
  $('endsAt').value = toLocalInput(end.toISOString());
  $('formTitle').textContent = 'New Raffle';
  $('saveBtn').textContent = 'CREATE RAFFLE';
  updatePreview();
}
function updatePreview() {
  const url = $('prizeImageUrl').value.trim();
  const box = $('imagePreview');
  box.innerHTML = url ? `<img src="${escapeHtml(url)}" alt="Prize preview" onerror="this.parentElement.innerHTML='<span>🎟️</span>'">` : '<span>🎟️</span>';
}
async function saveRaffle(event) {
  event.preventDefault();
  if (!wallet || busy) return;
  busy = true;
  $('saveBtn').disabled = true;
  try {
    const payload = normalizeForm();
    const raffleId = $('raffleId').value.trim();
    const timestamp = Date.now();
    showStatus(`Sign to ${raffleId ? 'save changes to' : 'create'} this raffle.`);
    const signature = await signMessage(saveMessage(raffleId, payload, timestamp));
    const result = await api({ action: 'admin_save_raffle', wallet, raffleId: raffleId || undefined, ...payload, timestamp, signature });
    showStatus(result.created ? 'Raffle created.' : 'Raffle updated.', 'ok');
    resetForm();
    await silentReload();
  } catch (error) { showStatus(error.message || 'Could not save raffle.', 'error'); }
  finally { busy = false; $('saveBtn').disabled = false; }
}
async function toggleActive(raffle) {
  if (!wallet || busy) return;
  busy = true;
  try {
    const active = !raffle.active;
    const timestamp = Date.now();
    showStatus(`Sign to ${active ? 'activate' : 'pause'} ${raffle.title}.`);
    const signature = await signMessage(setActiveMessage(raffle.id, active, timestamp));
    await api({ action: 'admin_set_active', wallet, raffleId: raffle.id, active, timestamp, signature });
    showStatus(active ? 'Raffle activated.' : 'Raffle paused.', 'ok');
    await silentReload();
  } catch (error) { showStatus(error.message || 'Could not update raffle.', 'error'); }
  finally { busy = false; }
}
async function silentReload() {
  const timestamp = Date.now();
  const signature = await signMessage(adminAccessMessage(timestamp));
  const data = await api({ action: 'admin_list', wallet, timestamp, signature });
  raffles = data.raffles || [];
  renderRaffles();
}

$('connectBtn').addEventListener('click', connectAdmin);
$('refreshBtn').addEventListener('click', refreshAdmin);
$('raffleForm').addEventListener('submit', saveRaffle);
$('newBtn').addEventListener('click', resetForm);
$('cancelBtn').addEventListener('click', resetForm);
$('prizeImageUrl').addEventListener('input', updatePreview);
