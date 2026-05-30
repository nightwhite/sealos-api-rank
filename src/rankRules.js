export function resolveRankRule(actualCost, rules) {
  const sorted = [...rules].sort((first, second) => first.minCost - second.minCost);
  let current = sorted[0] || { name: '未入榜', color: '#94a3b8', minCost: 0 };
  let previous = current;
  let next = null;

  for (let index = 0; index < sorted.length; index += 1) {
    if (actualCost >= sorted[index].minCost) {
      previous = sorted[index - 1] || sorted[index];
      current = sorted[index];
      next = sorted[index + 1] || null;
    }
  }

  return {
    name: current.name,
    color: current.color,
    nextRankName: next ? next.name : null,
    costToNextRank: next ? roundMoney(next.minCost - actualCost) : null,
    progress: next ? resolveProgress(actualCost, current.minCost, next.minCost, previous.minCost) : 1,
  };
}

function resolveProgress(actualCost, currentMinCost, nextMinCost, previousMinCost) {
  const start = currentMinCost || previousMinCost || 0;
  const distance = nextMinCost - start;
  if (distance <= 0) return 1;
  return Math.round(Math.max(0, Math.min(1, (actualCost - start) / distance)) * 10000) / 10000;
}

function roundMoney(value) {
  return Math.max(0, Math.round(value * 100) / 100);
}
