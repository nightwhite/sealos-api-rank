import { maskApiKey } from './mask.js';
import { resolveRankRule } from './rankRules.js';

export function buildRankings({ keys, usageByKeyId, visibleKeyIds, currentApiKey, rules, period }) {
  const currentKey = keys.find((key) => key.key === currentApiKey);
  return markCurrentKey(buildRankingSnapshot({ keys, usageByKeyId, visibleKeyIds, rules, period }), currentKey ? String(currentKey.id) : null);
}

export function buildRankingSnapshot({ keys, usageByKeyId, visibleKeyIds, rules, period }) {
  const visibleSet = new Set(visibleKeyIds.map(String));
  const rows = keys.map((key) => toRankRow(key, usageByKeyId.get(String(key.id)), rules, visibleSet.has(String(key.id))));
  const sortedVisibleRows = rows
    .filter((row) => row.visible)
    .sort(compareRows)
    .map((row, index) => ({ ...row, rank: index + 1 }));
  const rankByKeyId = new Map(sortedVisibleRows.map((row) => [row.keyId, row.rank]));
  const allRows = rows.map((row) => ({ ...row, rank: rankByKeyId.get(row.keyId) || null }));

  return {
    period,
    rankings: sortedVisibleRows,
    allRows,
  };
}

export function markCurrentKey(rankings, currentKeyId) {
  const rows = rankings.rankings.map((row) => ({
    ...row,
    isCurrentUserKey: row.keyId === currentKeyId,
  }));
  const currentVisibleRow = rows.find((row) => row.isCurrentUserKey);
  const currentAnyRow = currentVisibleRow || rankings.allRows.find((row) => row.keyId === currentKeyId) || null;

  return {
    period: rankings.period,
    rankings: rows,
    currentKey: currentAnyRow ? { ...currentAnyRow, isCurrentUserKey: true } : null,
  };
}

export function usageMapFromStats(stats, period) {
  const entries = Object.entries(stats || {});
  return new Map(entries.map(([keyId, value]) => [
    String(keyId),
    {
      actualCost: Number(period === 'daily' ? value.today_actual_cost : value.total_actual_cost) || 0,
      tokens: Number(period === 'daily' ? value.today_tokens : value.total_tokens) || 0,
    },
  ]));
}

function toRankRow(key, usage = {}, rules, visible = false) {
  const actualCost = Number(usage.actualCost || 0);
  const realmCost = Number(usage.realmCost ?? actualCost);
  const requests = Number(usage.requests || 0);
  const tokens = Number(usage.tokens || 0);
  const rankRule = resolveRankRule(realmCost, rules);
  return {
    rank: null,
    keyId: String(key.id),
    keyName: key.name || `Key #${key.id}`,
    maskedKey: maskApiKey(key.key),
    actualCost,
    realmCost,
    requests,
    tokens,
    rankName: rankRule.name,
    rankColor: rankRule.color,
    nextRankName: rankRule.nextRankName,
    costToNextRank: rankRule.costToNextRank,
    progress: rankRule.progress,
    isCurrentUserKey: false,
    visible,
  };
}

function compareRows(first, second) {
  if (second.actualCost !== first.actualCost) return second.actualCost - first.actualCost;
  if (second.tokens !== first.tokens) return second.tokens - first.tokens;
  return first.keyName.localeCompare(second.keyName);
}
