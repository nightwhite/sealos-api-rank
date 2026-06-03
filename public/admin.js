const loginPanel = document.querySelector('#loginPanel');
const configPanel = document.querySelector('#configPanel');
const passwordInput = document.querySelector('#passwordInput');
const loginButton = document.querySelector('#loginButton');
const loginError = document.querySelector('#loginError');
const keyList = document.querySelector('#keyList');
const keyCount = document.querySelector('#keyCount');
const ruleList = document.querySelector('#ruleList');
const adminMessage = document.querySelector('#adminMessage');
let currentRulePeriod = 'daily';

loginButton.addEventListener('click', login);
passwordInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') login();
});
document.querySelector('#saveKeysButton').addEventListener('click', saveKeys);
document.querySelector('#saveRulesButton').addEventListener('click', saveRules);
document.querySelector('#addRuleButton').addEventListener('click', () => renderRules([...readRules(), { minCost: 0, name: '新境界', color: '#fbbf24' }]));
document.querySelectorAll('[data-rule-period]').forEach((button) => {
  button.addEventListener('click', async () => {
    currentRulePeriod = button.dataset.rulePeriod === 'monthly' ? 'monthly' : 'daily';
    document.querySelectorAll('[data-rule-period]').forEach((item) => item.classList.toggle('active', item === button));
    await loadRules();
  });
});

async function login() {
  loginError.textContent = '';
  const response = await fetch('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: passwordInput.value }),
  });
  if (!response.ok) {
    loginError.textContent = '密码不正确';
    return;
  }
  loginPanel.classList.add('hidden');
  configPanel.classList.remove('hidden');
  await loadAdminData();
}

async function loadAdminData() {
  const [keysResponse, rulesResponse] = await Promise.all([fetch('/api/admin/keys'), fetch(`/api/admin/rank-rules?period=${currentRulePeriod}`)]);
  renderKeys((await keysResponse.json()).items || []);
  renderRules((await rulesResponse.json()).items || []);
}

async function loadRules() {
  const response = await fetch(`/api/admin/rank-rules?period=${currentRulePeriod}`);
  renderRules((await response.json()).items || []);
}

function renderKeys(keys) {
  keyList.innerHTML = keys.map((key) => `
    <label class="admin-row">
      <input type="checkbox" value="${escapeHtml(key.id)}" ${key.visible ? 'checked' : ''} />
      <span><b>${escapeHtml(key.name)}</b><small>${escapeHtml(key.maskedKey || '')}</small></span>
      <em>${escapeHtml(key.status || '')}</em>
    </label>
  `).join('');
  keyList.querySelectorAll('input[type="checkbox"]').forEach((input) => {
    input.addEventListener('change', updateKeyCount);
  });
  updateKeyCount();
}

function renderRules(rules) {
  ruleList.innerHTML = rules.map((rule) => `
    <div class="rule-row">
      <input type="number" step="0.01" value="${Number(rule.minCost || 0)}" data-field="minCost" />
      <input type="text" value="${escapeHtml(rule.name)}" data-field="name" />
      <input type="color" value="${escapeHtml(rule.color)}" data-field="color" />
      <button type="button" data-remove>删除</button>
    </div>
  `).join('');
  ruleList.querySelectorAll('[data-remove]').forEach((button) => button.addEventListener('click', () => {
    button.closest('.rule-row').remove();
  }));
}

async function saveKeys() {
  const keyIds = [...keyList.querySelectorAll('input:checked')].map((item) => item.value);
  const response = await fetch('/api/admin/visible-keys', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keyIds }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    adminMessage.textContent = payload.message || 'Key 展示范围保存失败';
    return;
  }
  await loadAdminData();
  adminMessage.textContent = `Key 展示范围已保存，已展示 ${keyIds.length} 个`;
}

async function saveRules() {
  await fetch(`/api/admin/rank-rules?period=${currentRulePeriod}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rules: readRules() }),
  });
  adminMessage.textContent = '境界规则已保存';
}

function readRules() {
  return [...ruleList.querySelectorAll('.rule-row')].map((row) => ({
    minCost: Number(row.querySelector('[data-field="minCost"]').value || 0),
    name: row.querySelector('[data-field="name"]').value.trim(),
    color: row.querySelector('[data-field="color"]').value,
  })).filter((rule) => rule.name);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function updateKeyCount() {
  const total = keyList.querySelectorAll('input[type="checkbox"]').length;
  const selected = keyList.querySelectorAll('input:checked').length;
  keyCount.textContent = `已勾选 ${selected} / ${total}`;
}
