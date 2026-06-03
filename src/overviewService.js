import { createHash } from 'node:crypto';
import { formatShanghaiDate } from './date.js';

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
    if (!key) throw new Error('未找到该 API Key。如果是新创建的 Key，请等待榜单刷新后再试；否则请检查输入是否正确。');
    if (key.status !== 'active') throw new Error('这个 API Key 当前不可用');
    return key;
  }

  return {
    async getOverview({ apiKey }) {
      const key = findCachedKey(apiKey);
      const today = formatShanghaiDate(now());
      const stats = await client.getUsageStats(key.id, { startDate: today, endDate: today, dayCount: 1 }) || {};
      const todayCost = Number(stats.total_actual_cost || 0);
      const todayRequests = Number(stats.total_requests || 0);
      const todayTokens = Number(stats.total_tokens || 0);
      const keyRows = [{
        id: String(key.id),
        name: key.name || `Key #${key.id}`,
        maskedKey: key.maskedKey,
        status: key.status,
        quota: Number(key.quota || 0),
        quotaUsed: Number(key.quotaUsed || 0),
        quotaRemaining: quotaRemaining(key),
        dailyLimit: Number(key.rateLimit1d || 0),
        dailyLimitUsed: Number(key.usage1d || 0),
        dailyLimitRemaining: dailyLimitRemaining(key),
        todayCost,
        todayRequests,
        todayTokens,
      }];
      return {
        refreshedAt: now().toISOString(),
        user: null,
        summary: {
          todayCost,
          todayRequests,
          todayTokens,
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
      const today = formatShanghaiDate(now());
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
            tokens: usageLogTokens(item),
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

function usageLogTokens(item) {
  return Number(item.input_tokens || 0)
    + Number(item.output_tokens || 0)
    + Number(item.cache_creation_tokens || 0)
    + Number(item.cache_read_tokens || 0);
}
