export function loadConfig(env = process.env) {
  const sub2apiBaseUrl = normalizeSub2APIBaseUrl(env.SUB2API_BASE_URL || '');
  if (!sub2apiBaseUrl) throw new Error('SUB2API_BASE_URL is required');
  if (!env.ADMIN_KEY) throw new Error('ADMIN_KEY is required');
  if (!env.ADMIN_PASSWORD) throw new Error('ADMIN_PASSWORD is required');

  return {
    sub2apiBaseUrl,
    adminKey: env.ADMIN_KEY,
    adminPassword: env.ADMIN_PASSWORD,
    port: Number(env.PORT || 3000),
    databasePath: env.DATABASE_PATH || 'data/rank.sqlite',
  };
}

function normalizeSub2APIBaseUrl(value) {
  const trimmed = value.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  if (trimmed.endsWith('/api/v1')) return trimmed;
  return `${trimmed}/api/v1`;
}
