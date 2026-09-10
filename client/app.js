const API_BASE = '/api';

const panel = document.getElementById('panel');
const input = document.getElementById('ticker-input');
const goBtn = document.getElementById('go-btn');
const inputError = document.getElementById('input-error');

const PERIOD_ORDER = ['1D', '1W', '1M', '3M', '6M', '1Y', '3Y', '5Y'];
const PERIOD_LABELS = {
  '1D': '1D', '1W': '1W', '1M': '1M', '3M': '3M',
  '6M': '6M', '1Y': '1Y', '3Y': '3Y total', '5Y': '5Y total',
};

let currentTicker = null;
let isLoading = false;

const ICONS = {
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>',
  up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="7" y1="17" x2="17" y2="7"></line><polyline points="7 7 17 7 17 17"></polyline></svg>',
  down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="7" y1="7" x2="17" y2="17"></line><polyline points="17 7 17 17 7 17"></polyline></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>',
  confused: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="9" y1="9" x2="9.01" y2="9"></line><line x1="15" y1="9" x2="15.01" y2="9"></line><path d="M8 15s1.5-1 4-1 4 1 4 1"></path></svg>',
};

function renderEmpty() {
  panel.innerHTML = `
    <div class="state-empty">
      ${ICONS.search}
      <p>Type a ticker above to see its price and returns.</p>
    </div>`;
}

function renderLoading() {
  panel.innerHTML = `
    <div class="skeleton-card">
      <div class="skeleton-line skeleton-title"></div>
      <div class="skeleton-line skeleton-sub"></div>
      <div class="skeleton-grid">
        ${'<div class="skeleton-line skeleton-tile"></div>'.repeat(8)}
      </div>
    </div>`;
}

function formatPrice(value) {
  if (value === null || value === undefined) return '—';
  return '\u20B9' + value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatAsOf(isoString) {
  try {
    const d = new Date(isoString);
    return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function renderPeriodTile(key, data) {
  const label = PERIOD_LABELS[key];

  if (!data || data.status !== 'ok' || data.return === null) {
    const reason = key === '3Y' || key === '5Y' ? 'Listed less than ' + key.replace('Y', ' years') : 'Not enough history';
    return `
      <div class="period-tile">
        <p class="period-label">${label}</p>
        <p class="period-unavailable">${reason}</p>
      </div>`;
  }

  const isPositive = data.return >= 0;
  const sign = isPositive ? '+' : '';
  const cls = isPositive ? 'positive' : 'negative';
  const icon = isPositive ? ICONS.up : ICONS.down;

  const cagrLine =
    (key === '3Y' || key === '5Y') && data.cagr !== null && data.cagr !== undefined
      ? `<p class="period-cagr">CAGR ${data.cagr >= 0 ? '+' : ''}${data.cagr.toFixed(1)}%</p>`
      : '';

  return `
    <div class="period-tile">
      <p class="period-label">${label}</p>
      <p class="period-value ${cls}">${icon}${sign}${data.return.toFixed(1)}%</p>
      ${cagrLine}
    </div>`;
}

function renderResults(data) {
  const tiles = PERIOD_ORDER.map((key) => renderPeriodTile(key, data.periods[key])).join('');

  panel.innerHTML = `
    <div class="result-card">
      <div class="result-header">
        <div>
          <p class="company-name">${escapeHtml(data.companyName)}</p>
          <p class="ticker-line">${escapeHtml(data.ticker)} &middot; NSE</p>
        </div>
        <div class="price-block">
          <p class="current-price">${formatPrice(data.currentPrice)}</p>
          <p class="as-of">as of ${formatAsOf(data.asOf)}</p>
        </div>
      </div>
      <div class="divider"></div>
      <div class="periods-grid">${tiles}</div>
      <div class="result-footnote">
        ${ICONS.clock}
        <span>Prices refresh every few minutes. Past returns don't guarantee future performance.</span>
      </div>
    </div>`;
}

function renderNotFound(ticker) {
  panel.innerHTML = `
    <div class="state-message">
      ${ICONS.confused}
      <p class="title">Couldn't find "${escapeHtml(ticker)}" on NSE.</p>
      <p class="subtitle">Check the spelling or try the full ticker symbol.</p>
    </div>`;
}

function renderUpstreamError(message) {
  panel.innerHTML = `
    <div class="state-message">
      ${ICONS.clock}
      <p class="title">${escapeHtml(message || 'The data source is temporarily unavailable.')}</p>
      <p class="subtitle">This is usually temporary.</p>
      <button class="retry-btn" id="retry-btn" type="button">Try again</button>
    </div>`;
  document.getElementById('retry-btn')?.addEventListener('click', () => {
    if (currentTicker) fetchReturns(currentTicker);
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

async function fetchReturns(ticker) {
  if (isLoading) return; // guard against double-submit while a request is in flight
  isLoading = true;
  goBtn.disabled = true;
  currentTicker = ticker;
  renderLoading();

  try {
    const res = await fetch(`${API_BASE}/returns/${encodeURIComponent(ticker)}`);
    const body = await res.json();

    if (res.status === 404) {
      renderNotFound(ticker);
      return;
    }
    if (!res.ok) {
      renderUpstreamError(body?.error?.message);
      return;
    }

    renderResults(body);
  } catch (err) {
    renderUpstreamError('Could not reach the server.');
  } finally {
    isLoading = false;
    goBtn.disabled = false;
  }
}

function handleSubmit() {
  const value = input.value.trim();
  if (!value) {
    inputError.textContent = 'Enter a ticker symbol first.';
    inputError.hidden = false;
    return;
  }
  inputError.hidden = true;
  fetchReturns(value.toUpperCase());
}

goBtn.addEventListener('click', handleSubmit);
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleSubmit();
});
input.addEventListener('input', () => {
  inputError.hidden = true;
});

renderEmpty();
