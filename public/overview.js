export const storageKey = 'sub2api_rank_user_key';
const hasDocument = typeof document !== 'undefined';
let currentPage = 1;
let pageSize = 20;

export function formatMoney(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

export function formatDuration(value) {
  const ms = Number(value || 0);
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms}ms`;
}

export function normalizePage(value) {
  const page = Number.parseInt(value || '1', 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function formatTime(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('zh-CN', { hour12: false });
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || '总览暂时无法打开，请稍后再试');
  return payload;
}

async function loadOverview() {
  const apiKeyInput = document.querySelector('#overviewApiKey');
  const apiKey = String(apiKeyInput.value || '').trim();
  if (!apiKey) {
    document.querySelector('#overviewError').textContent = '请先输入 API Key';
    return;
  }
  localStorage.setItem(storageKey, apiKey);
  document.querySelector('#overviewError').textContent = '';
  document.querySelector('#overviewLoadButton').disabled = true;
  try {
    const overview = await postJson('/api/overview', { apiKey });
    renderOverview(overview);
    currentPage = 1;
    await loadRecords();
  } catch (error) {
    document.querySelector('#overviewError').textContent = error.message;
  } finally {
    document.querySelector('#overviewLoadButton').disabled = false;
  }
}

async function loadRecords() {
  const apiKey = String(document.querySelector('#overviewApiKey').value || '').trim();
  const records = await postJson('/api/overview/records', { apiKey, page: currentPage, pageSize });
  renderRecords(records);
}

function renderOverview(payload) {
  document.querySelector('#overviewEntry').classList.add('hidden');
  document.querySelector('#overviewContent').classList.remove('hidden');
  document.querySelector('#overviewRefreshTime').textContent = payload.refreshedAt ? `上次刷新 ${formatTime(payload.refreshedAt)}` : '';
  document.querySelector('#todayCost').textContent = formatMoney(payload.summary?.todayCost);
  document.querySelector('#todayRequests').textContent = String(payload.summary?.todayRequests || 0);
  document.querySelector('#activeKeyCount').textContent = String(payload.summary?.activeKeyCount || 0);
  document.querySelector('#todayStatus').textContent = payload.summary?.statusName || '-';
  document.querySelector('#overviewKeys').innerHTML = (payload.keys || []).map((key) => `
    <div class="overview-key-row">
      <span><b>${escapeHtml(key.name)}</b><small>${escapeHtml(key.maskedKey)}</small></span>
      <span>${key.status === 'active' ? '启用中' : '不可用'}</span>
      <b>${formatMoney(key.todayCost)}</b>
      <span>${Number(key.todayRequests || 0)} 次</span>
    </div>
  `).join('');
}

function renderRecords(payload) {
  const items = payload.items || [];
  document.querySelector('#overviewRecords').innerHTML = items.length ? items.map((item) => `
    <div class="overview-record-row">
      <span>${escapeHtml(formatTime(item.createdAt))}</span>
      <span>${escapeHtml(item.keyName)}</span>
      <span>${escapeHtml(item.model)}</span>
      <b>${formatMoney(item.cost)}</b>
      <span>${formatDuration(item.durationMs)}</span>
    </div>
  `).join('') : '<div class="overview-empty">暂无调用记录</div>';
  const totalPages = Math.max(1, Math.ceil(Number(payload.total || 0) / Number(payload.pageSize || pageSize)));
  document.querySelector('#overviewPageInfo').textContent = `${payload.page} / ${totalPages}`;
  document.querySelector('#prevRecords').disabled = payload.page <= 1;
  document.querySelector('#nextRecords').disabled = payload.page >= totalPages;
}

if (hasDocument) {
  const input = document.querySelector('#overviewApiKey');
  input.value = String(localStorage.getItem(storageKey) || '').trim();
  document.querySelector('#overviewLoadButton').addEventListener('click', () => loadOverview());
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') loadOverview();
  });
  document.querySelector('#prevRecords').addEventListener('click', async () => {
    currentPage = Math.max(1, currentPage - 1);
    await loadRecords();
  });
  document.querySelector('#nextRecords').addEventListener('click', async () => {
    currentPage += 1;
    await loadRecords();
  });
  if (input.value) loadOverview();
}
