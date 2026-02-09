// Axiom Markets — app.js
const GAMMA = 'https://gamma-api.polymarket.com';
const CLOB = 'https://clob.polymarket.com';
const USD_TO_AUD = 1.58;
const PAGE_SIZE = 24;

let allEvents = [];
let displayedEvents = [];
let currentOffset = 0;
let currentTag = 'all';
let currentSort = 'volume24hr';
let searchQuery = '';

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
  loadMarkets();
  setupFilters();
  setupSort();
  setupModalCloses();
});

// --- API ---
async function fetchEvents(limit = 100) {
  try {
    const res = await fetch(`${GAMMA}/events?active=true&closed=false&limit=${limit}`);
    if (!res.ok) throw new Error('API error');
    return await res.json();
  } catch (e) {
    console.error('Failed to fetch events:', e);
    return [];
  }
}

async function fetchOrderBook(tokenId) {
  try {
    const res = await fetch(`${CLOB}/book?token_id=${tokenId}`);
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    return null;
  }
}

// --- Load Markets ---
async function loadMarkets() {
  const events = await fetchEvents(200);
  allEvents = events.filter(e => e.markets && e.markets.length > 0);
  updateStats();
  applyFiltersAndSort();
  document.getElementById('loadingState').style.display = 'none';
}

function updateStats() {
  const total = allEvents.length;
  let vol24 = 0;
  allEvents.forEach(e => { vol24 += (e.volume24hr || 0); });
  document.getElementById('statMarkets').textContent = total.toLocaleString();
  document.getElementById('statVolume').textContent = formatUsd(vol24);
  document.getElementById('statTraders').textContent = total.toLocaleString();
}

// --- Filtering & Sorting ---
function setupFilters() {
  document.querySelectorAll('.filter').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentTag = btn.dataset.tag;
      currentOffset = 0;
      applyFiltersAndSort();
    });
  });
}

function setupSort() {
  document.querySelectorAll('.sort-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentSort = btn.dataset.sort;
      currentOffset = 0;
      applyFiltersAndSort();
    });
  });
}

function filterMarkets() {
  searchQuery = document.getElementById('searchInput').value.toLowerCase().trim();
  currentOffset = 0;
  applyFiltersAndSort();
}

function applyFiltersAndSort() {
  let filtered = allEvents;

  // Tag filter
  if (currentTag !== 'all') {
    filtered = filtered.filter(e => {
      const tags = (e.tags || []).map(t => (t.label || t.name || '').toLowerCase());
      return tags.some(t => t.includes(currentTag.toLowerCase()));
    });
  }

  // Search filter
  if (searchQuery) {
    filtered = filtered.filter(e =>
      e.title.toLowerCase().includes(searchQuery) ||
      (e.description || '').toLowerCase().includes(searchQuery)
    );
  }

  // Sort
  filtered.sort((a, b) => {
    switch (currentSort) {
      case 'volume24hr': return (b.volume24hr || 0) - (a.volume24hr || 0);
      case 'volumeNum': return (b.volume || 0) - (a.volume || 0);
      case 'newest': return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
      case 'closing':
        const aEnd = a.markets[0]?.endDate ? new Date(a.markets[0].endDate) : new Date('2099-01-01');
        const bEnd = b.markets[0]?.endDate ? new Date(b.markets[0].endDate) : new Date('2099-01-01');
        return aEnd - bEnd;
      default: return 0;
    }
  });

  displayedEvents = filtered;
  currentOffset = 0;
  renderMarkets();
}

// --- Render ---
function renderMarkets() {
  const grid = document.getElementById('marketsGrid');
  const slice = displayedEvents.slice(0, currentOffset + PAGE_SIZE);
  currentOffset = slice.length;

  if (slice.length === 0) {
    grid.innerHTML = '<div class="no-results">No markets found</div>';
    document.getElementById('loadMore').style.display = 'none';
    return;
  }

  grid.innerHTML = slice.map((event, i) => renderEventCard(event, i === 0)).join('');
  document.getElementById('loadMore').style.display = currentOffset < displayedEvents.length ? 'block' : 'none';

  // Attach click handlers
  grid.querySelectorAll('.market-card').forEach(card => {
    card.addEventListener('click', () => {
      const idx = parseInt(card.dataset.idx);
      openMarketDetail(displayedEvents[idx]);
    });
  });
}

function loadMoreMarkets() {
  const grid = document.getElementById('marketsGrid');
  const nextSlice = displayedEvents.slice(currentOffset, currentOffset + PAGE_SIZE);
  currentOffset += nextSlice.length;

  const html = nextSlice.map(event => renderEventCard(event, false)).join('');
  grid.insertAdjacentHTML('beforeend', html);

  document.getElementById('loadMore').style.display = currentOffset < displayedEvents.length ? 'block' : 'none';

  // Re-attach click handlers for new cards
  grid.querySelectorAll('.market-card:not([data-bound])').forEach(card => {
    card.dataset.bound = '1';
    card.addEventListener('click', () => {
      const idx = parseInt(card.dataset.idx);
      openMarketDetail(displayedEvents[idx]);
    });
  });
}

function renderEventCard(event, featured) {
  const market = event.markets[0];
  const outcomes = JSON.parse(market.outcomes || '["Yes","No"]');
  const prices = JSON.parse(market.outcomePrices || '["0.5","0.5"]');
  const tag = getPrimaryTag(event);
  const vol = event.volume || 0;
  const vol24 = event.volume24hr || 0;
  const idx = displayedEvents.indexOf(event);

  const yesPrice = parseFloat(prices[0] || 0.5);
  const noPrice = parseFloat(prices[1] || 0.5);
  const yesPct = Math.round(yesPrice * 100);
  const noPct = Math.round(noPrice * 100);

  const endDate = market.endDate ? formatDate(market.endDate) : '';
  const imgStyle = event.image ? `background-image: url(${event.image}); background-size: cover; background-position: center;` : '';

  return `
    <div class="market-card${featured ? ' featured' : ''}" data-idx="${idx}">
      ${event.image ? `<div class="card-image" style="${imgStyle}"></div>` : ''}
      <div class="card-body">
        <div class="market-header">
          <span class="tag ${tag.toLowerCase()}">${tag}</span>
          <span class="volume">${formatAud(vol)} vol</span>
        </div>
        <h3>${truncate(event.title, 70)}</h3>
        ${outcomes.length === 2 ? `
          <div class="market-prices">
            <div class="outcome">
              <span class="outcome-label">Yes</span>
              <div class="price-bar yes" style="width: ${Math.max(yesPct, 8)}%">
                <span class="price">${yesPct}c</span>
              </div>
            </div>
            <div class="outcome">
              <span class="outcome-label">No</span>
              <div class="price-bar no" style="width: ${Math.max(noPct, 8)}%">
                <span class="price">${noPct}c</span>
              </div>
            </div>
          </div>
        ` : `
          <div class="market-prices multi">
            ${outcomes.slice(0, 4).map((o, i) => {
              const p = Math.round(parseFloat(prices[i] || 0) * 100);
              return `<div class="outcome-multi"><span>${truncate(o, 20)}</span><span class="price-multi">${p}c</span></div>`;
            }).join('')}
            ${outcomes.length > 4 ? `<div class="outcome-multi more">+${outcomes.length - 4} more</div>` : ''}
          </div>
        `}
        <div class="market-footer">
          <span class="vol24">${formatAud(vol24)} 24h</span>
          ${endDate ? `<span class="closes">${endDate}</span>` : ''}
        </div>
      </div>
    </div>`;
}

// --- Market Detail Modal ---
async function openMarketDetail(event) {
  const modal = document.getElementById('marketModal');
  const detail = document.getElementById('marketDetail');
  const market = event.markets[0];
  const outcomes = JSON.parse(market.outcomes || '["Yes","No"]');
  const prices = JSON.parse(market.outcomePrices || '["0.5","0.5"]');
  const tag = getPrimaryTag(event);

  const yesPct = Math.round(parseFloat(prices[0] || 0.5) * 100);
  const noPct = Math.round(parseFloat(prices[1] || 0.5) * 100);
  const yesAud = Math.round(parseFloat(prices[0] || 0.5) * 100) ;
  const endDate = market.endDate ? formatDate(market.endDate) : 'TBD';

  detail.innerHTML = `
    <span class="tag ${tag.toLowerCase()}">${tag}</span>
    <h2>${event.title}</h2>
    <p class="modal-resolution">${truncate(market.description || event.description || '', 300)}</p>
    <p class="modal-meta">Closes: ${endDate} &bull; Volume: ${formatAud(event.volume || 0)}</p>

    <div class="trade-panel">
      <div class="trade-tabs">
        <button class="trade-tab active" onclick="setTradeTab(this,'buy')">Buy</button>
        <button class="trade-tab" onclick="setTradeTab(this,'sell')">Sell</button>
      </div>
      ${outcomes.length === 2 ? `
        <div class="trade-outcomes">
          <button class="trade-outcome selected" data-side="0">
            <span>Yes</span>
            <span class="trade-price">${yesPct}c</span>
          </button>
          <button class="trade-outcome" data-side="1">
            <span>No</span>
            <span class="trade-price">${noPct}c</span>
          </button>
        </div>
      ` : `
        <div class="trade-outcomes multi">
          ${outcomes.map((o, i) => `
            <button class="trade-outcome${i === 0 ? ' selected' : ''}" data-side="${i}">
              <span>${truncate(o, 18)}</span>
              <span class="trade-price">${Math.round(parseFloat(prices[i] || 0) * 100)}c</span>
            </button>
          `).join('')}
        </div>
      `}
      <div class="trade-amount">
        <label>Amount</label>
        <div class="amount-input">
          <span class="currency">A$</span>
          <input type="number" value="100" min="1" id="tradeAmountInput" oninput="updateTradeSummary(${JSON.stringify(prices).replace(/"/g, '&quot;')})">
        </div>
      </div>
      <div class="trade-summary">
        <div class="summary-row"><span>Shares</span><span id="tradeShares">${Math.round(100 / (parseFloat(prices[0]) || 0.5))}</span></div>
        <div class="summary-row"><span>Avg price</span><span id="tradeAvg">${yesPct}c</span></div>
        <div class="summary-row payout"><span>Potential payout</span><span id="tradePayout">A$${Math.round(100 / (parseFloat(prices[0]) || 0.5))}.00</span></div>
      </div>
      <button class="btn-trade" onclick="handleTrade()">Buy Yes — A$100.00</button>
    </div>

    <div class="order-book" id="orderBookSection">
      <h4>Order Book</h4>
      <div class="book-loading"><div class="spinner small"></div></div>
    </div>
  `;

  // Outcome selection
  detail.querySelectorAll('.trade-outcome').forEach(o => {
    o.addEventListener('click', () => {
      detail.querySelectorAll('.trade-outcome').forEach(x => x.classList.remove('selected'));
      o.classList.add('selected');
      updateTradeSummary(prices);
    });
  });

  modal.style.display = 'flex';

  // Load order book
  const tokenIds = market.clobTokenIds ? JSON.parse(market.clobTokenIds) : null;
  if (tokenIds && tokenIds[0]) {
    const book = await fetchOrderBook(tokenIds[0]);
    renderOrderBook(book);
  }
}

function renderOrderBook(book) {
  const section = document.getElementById('orderBookSection');
  if (!book || (!book.asks?.length && !book.bids?.length)) {
    section.innerHTML = '<h4>Order Book</h4><p class="book-empty">No orders available</p>';
    return;
  }

  const asks = (book.asks || []).slice(0, 5).reverse();
  const bids = (book.bids || []).slice(0, 5);

  section.innerHTML = `
    <h4>Order Book</h4>
    <div class="book-header"><span>Price</span><span>Size</span><span>Total (AUD)</span></div>
    ${asks.map(a => `<div class="book-row ask"><span>${Math.round(parseFloat(a.price) * 100)}c</span><span>${Number(a.size).toLocaleString()}</span><span>${formatAud(parseFloat(a.price) * parseFloat(a.size))}</span></div>`).join('')}
    <div class="book-spread"><span>Spread: ${getSpread(asks, bids)}</span></div>
    ${bids.map(b => `<div class="book-row bid"><span>${Math.round(parseFloat(b.price) * 100)}c</span><span>${Number(b.size).toLocaleString()}</span><span>${formatAud(parseFloat(b.price) * parseFloat(b.size))}</span></div>`).join('')}
  `;
}

function getSpread(asks, bids) {
  if (!asks.length || !bids.length) return '—';
  const lowestAsk = parseFloat(asks[asks.length - 1]?.price || 0);
  const highestBid = parseFloat(bids[0]?.price || 0);
  const spread = Math.abs(lowestAsk - highestBid);
  return `${Math.round(spread * 100)}c`;
}

function updateTradeSummary(prices) {
  const amount = parseFloat(document.getElementById('tradeAmountInput')?.value || 100);
  const selected = document.querySelector('.trade-outcome.selected');
  const side = parseInt(selected?.dataset?.side || 0);
  const price = parseFloat(prices[side] || 0.5);
  const shares = Math.round(amount / price);
  const el = (id) => document.getElementById(id);
  if (el('tradeShares')) el('tradeShares').textContent = shares.toLocaleString();
  if (el('tradeAvg')) el('tradeAvg').textContent = `${Math.round(price * 100)}c`;
  if (el('tradePayout')) el('tradePayout').textContent = `A$${shares.toLocaleString()}.00`;
}

function setTradeTab(el, mode) {
  el.parentElement.querySelectorAll('.trade-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
}

function handleTrade() {
  if (!window._auth?.currentUser) {
    closeMarketModal();
    openAuthModal('signup');
    return;
  }
  alert('Trading coming soon. Complete KYC to be first in line.');
}

function closeMarketModal() {
  document.getElementById('marketModal').style.display = 'none';
}

// --- Auth ---
let authMode = 'signin';

function openAuthModal(mode) {
  authMode = mode || 'signin';
  const modal = document.getElementById('authModal');
  document.getElementById('authTitle').textContent = authMode === 'signup' ? 'Create Account' : 'Sign In';
  document.getElementById('authSubmit').textContent = authMode === 'signup' ? 'Create Account' : 'Sign In';
  document.getElementById('signupNameField').style.display = authMode === 'signup' ? 'block' : 'none';
  document.getElementById('authSwitchText').textContent = authMode === 'signup' ? 'Already have an account?' : "Don't have an account?";
  document.getElementById('authSwitchLink').textContent = authMode === 'signup' ? 'Sign In' : 'Sign Up';
  document.getElementById('authError').style.display = 'none';
  modal.style.display = 'flex';
}

function closeAuthModal() {
  document.getElementById('authModal').style.display = 'none';
}

function toggleAuthMode() {
  openAuthModal(authMode === 'signin' ? 'signup' : 'signin');
}

document.getElementById('authForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('authEmail').value;
  const password = document.getElementById('authPassword').value;
  const name = document.getElementById('authName').value;
  const errEl = document.getElementById('authError');
  const btn = document.getElementById('authSubmit');
  btn.disabled = true;
  btn.textContent = 'Loading...';
  errEl.style.display = 'none';

  try {
    if (authMode === 'signup') {
      const cred = await window.firebaseSignUp(email, password);
      if (name) await window.firebaseUpdateProfile(cred.user, { displayName: name });
    } else {
      await window.firebaseSignIn(email, password);
    }
  } catch (err) {
    errEl.textContent = friendlyError(err.code);
    errEl.style.display = 'block';
    btn.disabled = false;
    btn.textContent = authMode === 'signup' ? 'Create Account' : 'Sign In';
  }
});

async function googleSignIn() {
  try {
    await window.firebaseGoogleSignIn();
  } catch (err) {
    const errEl = document.getElementById('authError');
    errEl.textContent = friendlyError(err.code);
    errEl.style.display = 'block';
  }
}

async function signOut() {
  await window.firebaseSignOut();
  document.getElementById('userMenu').style.display = 'none';
}

function toggleUserMenu() {
  const menu = document.getElementById('userMenu');
  menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
}

function friendlyError(code) {
  const map = {
    'auth/email-already-in-use': 'Email already registered. Try signing in.',
    'auth/invalid-email': 'Invalid email address.',
    'auth/weak-password': 'Password must be at least 6 characters.',
    'auth/user-not-found': 'No account found with this email.',
    'auth/wrong-password': 'Incorrect password.',
    'auth/invalid-credential': 'Invalid email or password.',
    'auth/too-many-requests': 'Too many attempts. Try again later.',
    'auth/popup-closed-by-user': 'Sign in cancelled.',
  };
  return map[code] || 'Something went wrong. Try again.';
}

// --- KYC ---
function openKycModal() {
  document.getElementById('userMenu').style.display = 'none';
  document.getElementById('kycStep1').style.display = 'block';
  document.getElementById('kycStep2').style.display = 'none';
  document.getElementById('kycModal').style.display = 'flex';
}

function closeKycModal() {
  document.getElementById('kycModal').style.display = 'none';
}

function submitKyc() {
  const fields = ['kycFirst', 'kycLast', 'kycDob', 'kycAddress', 'kycIdNumber'];
  for (const f of fields) {
    if (!document.getElementById(f).value.trim()) {
      document.getElementById(f).focus();
      return;
    }
  }
  document.getElementById('kycStep1').style.display = 'none';
  document.getElementById('kycStep2').style.display = 'block';
}

// --- Deposit ---
function openDepositModal() {
  document.getElementById('depositRef').textContent = 'AX-' + Math.random().toString(36).substring(2, 8).toUpperCase();
  document.getElementById('depositModal').style.display = 'flex';

  document.querySelectorAll('.deposit-method').forEach(m => {
    m.addEventListener('click', () => {
      document.querySelectorAll('.deposit-method').forEach(x => x.classList.remove('active'));
      m.classList.add('active');
    });
  });
}

// --- Modal close on overlay click ---
function setupModalCloses() {
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.style.display = 'none';
    });
  });

  // Close user menu on outside click
  document.addEventListener('click', (e) => {
    const menu = document.getElementById('userMenu');
    const avatar = document.getElementById('userAvatar');
    if (menu && !menu.contains(e.target) && e.target !== avatar) {
      menu.style.display = 'none';
    }
  });
}

// --- Helpers ---
function getPrimaryTag(event) {
  const tags = (event.tags || []).map(t => t.label || t.name || '');
  const priority = ['Politics', 'Crypto', 'Sports', 'Science', 'Culture', 'Tech', 'Economics'];
  for (const p of priority) {
    if (tags.some(t => t.toLowerCase().includes(p.toLowerCase()))) return p;
  }
  return tags[0] || 'Other';
}

function formatUsd(n) {
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
  return '$' + n.toFixed(0);
}

function formatAud(n) {
  const aud = n * USD_TO_AUD;
  if (aud >= 1e9) return 'A$' + (aud / 1e9).toFixed(1) + 'B';
  if (aud >= 1e6) return 'A$' + (aud / 1e6).toFixed(1) + 'M';
  if (aud >= 1e3) return 'A$' + (aud / 1e3).toFixed(0) + 'K';
  return 'A$' + Math.round(aud);
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function truncate(str, len) {
  if (!str) return '';
  return str.length > len ? str.slice(0, len) + '...' : str;
}