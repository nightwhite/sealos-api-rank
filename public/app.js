const storageKey = 'sub2api_rank_user_key';
let currentPeriod = 'daily';

const hasDocument = typeof document !== 'undefined';
const entry = hasDocument ? document.querySelector('#entry') : null;
const leaderboard = hasDocument ? document.querySelector('#leaderboard') : null;
const apiKeyInput = hasDocument ? document.querySelector('#apiKeyInput') : null;
const loadButton = hasDocument ? document.querySelector('#loadButton') : null;
const entryError = hasDocument ? document.querySelector('#entryError') : null;
export const refreshIntervalMs = 30 * 1000;
let refreshTimer = null;

if (hasDocument) {
  apiKeyInput.value = normalizeStoredKey(localStorage.getItem(storageKey));
  if (apiKeyInput.value) loadButton.textContent = '进入上次榜单';
  loadButton.addEventListener('click', () => loadRankings());
  apiKeyInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') loadRankings();
  });

  document.querySelectorAll('[data-period]').forEach((button) => {
    button.addEventListener('click', () => {
      currentPeriod = button.dataset.period;
      document.querySelectorAll('[data-period]').forEach((item) => item.classList.toggle('active', item === button));
      loadRankings({ silent: !leaderboard.classList.contains('hidden') });
    });
  });

  if (apiKeyInput.value.trim()) {
    loadRankings();
  }
}

async function loadRankings({ silent = false } = {}) {
  const apiKey = normalizeStoredKey(apiKeyInput.value);
  if (!apiKey) {
    entryError.textContent = '请输入 API Key';
    return;
  }
  storeUserKey(apiKey);
  entryError.textContent = '';
  if (!silent) {
    loadButton.disabled = true;
    loadButton.textContent = '入榜中...';
    showLoadingState(currentPeriod);
  }
  try {
    const response = await fetch('/api/rankings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey, period: currentPeriod }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message || '排行榜暂时无法更新');
    render(payload);
  } catch (error) {
    const errorState = refreshErrorState({
      silent,
      hasVisibleLeaderboard: !leaderboard.classList.contains('hidden'),
      message: error.message,
    });
    entry.classList.toggle('hidden', !errorState.showEntry);
    if (shouldForgetStoredKey(error.message)) localStorage.removeItem(storageKey);
    entryError.textContent = errorState.message;
  } finally {
    if (!silent) {
      loadButton.disabled = false;
      loadButton.textContent = localStorage.getItem(storageKey) ? '进入上次榜单' : '进入排行榜';
    }
  }
}

function render(payload) {
  entry.classList.add('hidden');
  leaderboard.classList.remove('hidden');
  document.querySelector('#pageTitle').textContent = loadingTitle(payload.period);
  document.querySelector('#currentRankLabel').textContent = periodLabels(payload.period).current;
  document.querySelector('#rankNameColumn').textContent = periodLabels(payload.period).column;
  document.querySelector('#refreshHint').textContent = refreshHintText(payload);
  renderCurrentKey(payload.currentKey, payload.period);
  renderRows(payload.rankings || [], payload.period);
  scheduleRefresh();
}

function showLoadingState(period) {
  if (leaderboard.classList.contains('hidden')) return;
  document.querySelector('#pageTitle').textContent = loadingTitle(period);
  document.querySelector('#refreshHint').textContent = period === 'monthly' ? ' · 月榜更新中...' : ' · 日榜更新中...';
}

function renderCurrentKey(currentKey, period) {
  const labels = periodLabels(period);
  const usage = usageDisplayValue({ ...currentKey, period });
  document.querySelector('#currentRankName').textContent = currentKey?.rankName || '未入榜';
  document.querySelector('#currentUsage').textContent = formatUsageDisplay(usage);
  document.querySelector('#currentRankNumber').textContent = currentKey?.rank ? `#${currentKey.rank}` : '-';
  document.querySelector('#nextRankHint').textContent = currentKey?.nextRankName ? `${labels.next} ${formatMoney(currentKey.costToNextRank)}：${currentKey.nextRankName}` : labels.max;
  document.querySelector('#rankProgress').style.width = `${Math.round((currentKey?.progress || 0) * 100)}%`;
}

function renderRows(rows, period) {
  const container = document.querySelector('#rankRows');
  const emptyState = document.querySelector('#emptyState');
  emptyState.classList.toggle('hidden', rows.length > 0);
  container.innerHTML = rows.map((row) => {
    const usage = usageDisplayValue({ ...row, period });
    return `
    <div class="rank-row ${row.isCurrentUserKey ? 'current' : ''}">
      <strong class="rank-index">${String(row.rank).padStart(2, '0')}</strong>
      <span><b>${escapeHtml(row.keyName)}</b><small>${escapeHtml(row.maskedKey)}</small></span>
      <b style="color:${escapeHtml(row.rankColor)}">${escapeHtml(row.rankName)}</b>
      <b>${formatUsageCell(usage)}</b>
      <span>${formatTokens(row.tokens)}</span>
    </div>
  `;
  }).join('');
}

export function usageDisplayValue({ period, actualCost = 0, realmCost, tokens = 0 } = {}) {
  const primaryCost = period === 'monthly' ? Number(realmCost ?? actualCost) : Number(actualCost || 0);
  return {
    primaryCost,
    primaryLabel: period === 'monthly' ? '日均' : '今日',
    detailCost: period === 'monthly' ? Number(actualCost || 0) : null,
    detailLabel: period === 'monthly' ? '本月' : '',
    tokens: Number(tokens || 0),
  };
}

export function refreshHintText({ period, refreshedAt } = {}) {
  const realmHint = period === 'monthly' ? ' · 境界按日均修为' : ' · 今日功绩按当日消耗';
  const refreshText = refreshedAt ? ` · 上次刷新 ${formatTime(refreshedAt)}` : '';
  return `${realmHint}${refreshText}`;
}

export function shouldForgetStoredKey() {
  return false;
}

export function normalizeStoredKey(value) {
  return String(value || '').trim();
}

export function refreshErrorState({ silent, hasVisibleLeaderboard, message }) {
  if (silent && hasVisibleLeaderboard) {
    return { showEntry: false, message: '自动刷新失败，稍后再试' };
  }
  return { showEntry: true, message };
}

function storeUserKey(apiKey) {
  const normalized = normalizeStoredKey(apiKey);
  if (!normalized) return;
  localStorage.setItem(storageKey, normalized);
  console.info('[sub2api-rank] stored user key', { length: normalized.length });
}

export function loadingTitle(period) {
  return period === 'monthly' ? '月度境界榜' : '今日功绩榜';
}

export function periodLabels(period) {
  if (period === 'monthly') {
    return {
      current: '月度境界',
      next: '距下一境界',
      column: '月度境界',
      max: '已达最高境界',
    };
  }
  return {
    current: '今日功绩',
    next: '距下一功绩',
    column: '今日功绩',
    max: '今日功绩已满',
  };
}

function formatUsageDisplay(usage) {
  const detail = usage.detailCost === null ? '' : ` · ${usage.detailLabel} ${formatMoney(usage.detailCost)}`;
  return `${usage.primaryLabel} ${formatMoney(usage.primaryCost)}${detail} · ${formatTokens(usage.tokens)} tokens`;
}

function formatUsageCell(usage) {
  if (usage.detailCost === null) return formatMoney(usage.primaryCost);
  return `${usage.primaryLabel} ${formatMoney(usage.primaryCost)} · ${usage.detailLabel} ${formatMoney(usage.detailCost)}`;
}

function formatMoney(value) {
  return `$${Number(value).toFixed(2)}`;
}

function formatTokens(value) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

function formatTime(value) {
  return new Date(value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function scheduleRefresh() {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => loadRankings({ silent: true }), refreshIntervalMs);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}
