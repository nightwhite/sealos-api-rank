import { createHash } from 'node:crypto';

const timezone = 'Asia/Shanghai';
const statusRules = [
  { minCost: 0, name: '静心观望' },
  { minCost: 1, name: '初燃灵火' },
  { minCost: 5, name: '灵泉涌动' },
  { minCost: 20, name: '御剑疾行' },
  { minCost: 60, name: '剑气如虹' },
  { minCost: 150, name: '一日千里' },
  { minCost: 300, name: '破晓登峰' },
];

export function createOverviewService({ client, db, now = () => new Date() }) {
  function findCachedKey(apiKey) {
    const normalized = String(apiKey || '').trim();
    if (!normalized) throw new Error('请先输入 API Key');
    const key = db.findAPIKeyByHash(hashAPIKey(normalized));
    if (!key) throw new Error('请等待榜单刷新后再查看');
    if (key.status !== 'active') throw new Error('这个 API Key 当前不可用');
    return key;
  }

  return {
    async getOverview({ apiKey }) {
      const key = findCachedKey(apiKey);
      const snapshot = db.getRankSnapshot('daily');
      const snapshotRow = (snapshot.rows || []).find((row) => String(row.keyId) === String(key.id));
      if (!snapshot.refreshedAt || !snapshotRow) throw new Error('请等待榜单刷新后再查看');
      const todayCost = Number(snapshotRow.actualCost || 0);
      const todayRequests = Number(snapshotRow.requests || 0);
      const keyRows = [{
        id: String(key.id),
        name: snapshotRow.keyName,
        maskedKey: snapshotRow.maskedKey,
        status: key.status,
        quota: Number(key.quota || 0),
        quotaUsed: Number(key.quotaUsed || 0),
        quotaRemaining: quotaRemaining(key),
        dailyLimit: Number(key.rateLimit1d || 0),
        dailyLimitUsed: Number(key.usage1d || 0),
        dailyLimitRemaining: dailyLimitRemaining(key),
        todayCost,
        todayRequests,
      }];
      return {
        refreshedAt: snapshot.refreshedAt,
        user: null,
        summary: {
          todayCost,
          todayRequests,
          activeKeyCount: 1,
          quota: Number(key.quota || 0),
          quotaUsed: Number(key.quotaUsed || 0),
          quotaRemaining: quotaRemaining(key),
          dailyLimit: Number(key.rateLimit1d || 0),
          dailyLimitUsed: Number(key.usage1d || 0),
          dailyLimitRemaining: dailyLimitRemaining(key),
          statusName: overviewStatusName(todayCost),
        },
        keys: keyRows,
      };
    },

    async getRecords({ apiKey, page = 1, pageSize = 20 }) {
      const key = findCachedKey(apiKey);
      const today = formatLocalDate(now());
      const result = await client.listAdminUsage({
        api_key_id: Number(key.id),
        page,
        page_size: pageSize,
        sort_by: 'created_at',
        sort_order: 'desc',
        timezone,
        start_date: today,
        end_date: today,
      });
      return {
        page: Number(result.page || page),
        pageSize: Number(result.page_size || pageSize),
        total: Number(result.total || 0),
        items: (result.items || []).map((item) => {
          return {
            id: String(item.id),
            createdAt: item.created_at,
            keyName: key.name || `Key #${key.id}`,
            maskedKey: key.maskedKey,
            model: item.model || '-',
            requestType: item.request_type || '',
            cost: Number(item.actual_cost || 0),
            durationMs: Number(item.duration_ms || 0),
            status: 'success',
          };
        }),
      };
    },
  };
}

export function overviewStatusName(cost) {
  const value = Number(cost || 0);
  return statusRules.reduce((current, rule) => (value >= rule.minCost ? rule.name : current), statusRules[0].name);
}

function hashAPIKey(apiKey) {
  return createHash('sha256').update(String(apiKey || '').trim()).digest('hex');
}

function quotaRemaining(key) {
  const quota = Number(key.quota || 0);
  if (quota <= 0) return null;
  return Math.max(0, quota - Number(key.quotaUsed || 0));
}

function dailyLimitRemaining(key) {
  const limit = Number(key.rateLimit1d || 0);
  if (limit <= 0) return null;
  return Math.max(0, limit - Number(key.usage1d || 0));
}

function formatLocalDate(date) {
  const value = new Date(date);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
