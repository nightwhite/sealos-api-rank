import { createHash } from 'node:crypto';
import { maskApiKey } from './mask.js';

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
  async function syncKeys() {
    const users = await client.listUsers();
    const keyGroups = await Promise.all((users.items || []).map(async (user) => {
      const keys = await client.listUserAPIKeys(user.id);
      return keys.map((key) => ({ ...key, userId: user.id }));
    }));
    db.replaceAPIKeys(keyGroups.flat().map((key) => ({
      id: key.id,
      userId: key.userId,
      keyHash: hashAPIKey(key.key),
      name: key.name || `Key #${key.id}`,
      maskedKey: maskApiKey(key.key),
      status: key.status,
    })));
  }

  async function findOwner(apiKey) {
    const normalized = String(apiKey || '').trim();
    if (!normalized) throw new Error('请先输入 API Key');
    await syncKeys();
    const key = db.findAPIKeyByHash(hashAPIKey(normalized));
    if (!key) throw new Error('未找到这个 API Key，请确认后再试');
    if (key.status !== 'active') throw new Error('这个 API Key 当前不可用');
    return key;
  }

  return {
    async getOverview({ apiKey }) {
      const ownerKey = await findOwner(apiKey);
      const summaryStats = await client.getAdminUsageStats({ api_key_id: Number(ownerKey.id), period: 'today', timezone });
      const keyRows = [{
        id: String(ownerKey.id),
        name: ownerKey.name || `Key #${ownerKey.id}`,
        maskedKey: ownerKey.maskedKey,
        status: ownerKey.status,
        todayCost: Number(summaryStats.total_actual_cost || 0),
        todayRequests: Number(summaryStats.total_requests || 0),
      }];
      return {
        refreshedAt: now().toISOString(),
        user: { id: String(ownerKey.userId) },
        summary: {
          todayCost: Number(summaryStats.total_actual_cost || 0),
          todayRequests: Number(summaryStats.total_requests || 0),
          activeKeyCount: 1,
          statusName: overviewStatusName(Number(summaryStats.total_actual_cost || 0)),
        },
        keys: keyRows,
      };
    },

    async getRecords({ apiKey, page = 1, pageSize = 20 }) {
      const ownerKey = await findOwner(apiKey);
      const result = await client.listAdminUsage({ api_key_id: Number(ownerKey.id), page, page_size: pageSize, sort_by: 'created_at', sort_order: 'desc', timezone });
      return {
        page: Number(result.page || page),
        pageSize: Number(result.page_size || pageSize),
        total: Number(result.total || 0),
        items: (result.items || []).map((item) => {
          return {
            id: String(item.id),
            createdAt: item.created_at,
            keyName: ownerKey.name || `Key #${ownerKey.id}`,
            maskedKey: ownerKey.maskedKey,
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
