import { createHash } from 'node:crypto';
import { buildRankingSnapshot } from './rankings.js';
import { maskApiKey } from './mask.js';
import { formatShanghaiDate } from './date.js';

export function createRankService({ client, db, now = () => new Date() }) {
  return {
    async refreshRankings({ period }) {
      const currentTime = now();
      const keys = await listAllKeys(client);
      db.replaceAPIKeys(keys.map((key) => ({
        id: key.id,
        keyHash: hashAPIKey(key.key),
        name: key.name || `Key #${key.id}`,
        maskedKey: maskApiKey(key.key),
        status: key.status,
        quota: key.quota,
        quotaUsed: key.quota_used,
        rateLimit1d: key.rate_limit_1d,
        usage1d: key.usage_1d,
      })));

      const activeKeys = keys.filter((key) => key.status === 'active');
      const visibleKeyIds = db.listVisibleKeyIds();
      const rankedKeyIds = new Set([...visibleKeyIds.map(String), ...activeKeys.map((key) => String(key.id))]);
      const rankedKeys = activeKeys.filter((key) => rankedKeyIds.has(String(key.id)));
      const dateRange = periodDateRange(period, currentTime);
      const usageByKeyId = await loadUsageByKeyId(client, rankedKeys, period, dateRange);
      const snapshot = buildRankingSnapshot({
        keys: activeKeys,
        usageByKeyId,
        visibleKeyIds,
        rules: db.listRankRules(period),
        period,
      });

      db.replaceRankSnapshot(period, {
        refreshedAt: currentTime.toISOString(),
        rows: snapshot.allRows.sort(compareSnapshotRows),
      });
    },

    async getRankings({ apiKey, period }) {
      const key = db.findAPIKeyByHash(hashAPIKey(apiKey));
      if (!key) throw new Error('请等待榜单刷新后再查看');
      if (key.status !== 'active') throw new Error('只有启用中的 API Key 可以查看排行榜');

      const snapshot = db.getRankSnapshot(period);
      const rows = applyCurrentVisibility(snapshot.rows || [], db.listVisibleKeyIds());
      const publicRows = rows
        .filter((row) => row.visible)
        .map((row) => ({ ...row, isCurrentUserKey: row.keyId === key.id }));
      const currentKey = rows.find((row) => row.keyId === key.id) || null;

      return {
        period: snapshot.period,
        refreshedAt: snapshot.refreshedAt,
        rankings: publicRows,
        currentKey: currentKey ? { ...currentKey, isCurrentUserKey: true } : null,
      };
    },
  };
}

function applyCurrentVisibility(rows, visibleKeyIds) {
  const visibleSet = new Set(visibleKeyIds.map(String));
  const markedRows = rows.map((row) => ({ ...row, visible: visibleSet.has(String(row.keyId)), rank: null }));
  const sortedVisibleRows = markedRows
    .filter((row) => row.visible)
    .sort(compareVisibleRows)
    .map((row, index) => ({ ...row, rank: index + 1 }));
  const rankByKeyId = new Map(sortedVisibleRows.map((row) => [row.keyId, row.rank]));
  return markedRows.map((row) => ({ ...row, rank: rankByKeyId.get(row.keyId) || null }));
}

function compareVisibleRows(first, second) {
  if (second.actualCost !== first.actualCost) return second.actualCost - first.actualCost;
  if (second.tokens !== first.tokens) return second.tokens - first.tokens;
  return first.keyName.localeCompare(second.keyName);
}

function compareSnapshotRows(first, second) {
  if (first.visible !== second.visible) return first.visible ? -1 : 1;
  if (first.rank === null && second.rank !== null) return 1;
  if (first.rank !== null && second.rank === null) return -1;
  if (first.rank !== null && second.rank !== null && first.rank !== second.rank) return first.rank - second.rank;
  return first.keyName.localeCompare(second.keyName);
}

async function loadUsageByKeyId(client, rankedKeys, period, dateRange) {
  const usageByKeyId = new Map();
  const statsList = await Promise.all(rankedKeys.map(async (key) => ({
    key,
    stats: await client.getUsageStats(key.id, dateRange),
  })));
  for (const { key, stats } of statsList) {
    const actualCost = Number(stats.total_actual_cost || 0);
    usageByKeyId.set(String(key.id), {
      actualCost,
      realmCost: period === 'monthly' ? actualCost / dateRange.dayCount : actualCost,
      requests: Number(stats.total_requests || 0),
      tokens: Number(stats.total_tokens || 0),
    });
  }
  return usageByKeyId;
}

export function periodDateRange(period, value) {
  const date = new Date(value);
  const endDate = formatShanghaiDate(date);
  if (period === 'monthly') {
    const dayCount = Number(endDate.slice(-2));
    return { startDate: `${endDate.slice(0, 8)}01`, endDate, dayCount };
  }
  return { startDate: endDate, endDate, dayCount: 1 };
}

async function listAllKeys(client) {
  const users = await client.listUsers();
  const keyGroups = await Promise.all((users.items || []).map(async (user) => {
    const keys = await client.listUserAPIKeys(user.id);
    return keys.map((key) => ({ ...key, userId: user.id }));
  }));
  return keyGroups.flat();
}

function hashAPIKey(apiKey) {
  return createHash('sha256').update(String(apiKey || '').trim()).digest('hex');
}
