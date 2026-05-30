import { describe, expect, it } from 'vitest';
import { buildRankings } from '../src/rankings.js';

const rules = [
  { minCost: 0, name: '凡人试炼', color: '#94a3b8' },
  { minCost: 200, name: '元婴上线', color: '#fbbf24' },
  { minCost: 500, name: '大乘飞升', color: '#fbbf24' },
];

describe('buildRankings', () => {
  it('sorts by cost, filters visible keys, and highlights current key', () => {
    const result = buildRankings({
      keys: [
        { id: 1, name: 'Alpha', key: 'sk-alpha-secret-1111', status: 'active' },
        { id: 2, name: 'Beta', key: 'sk-beta-secret-2222', status: 'active' },
        { id: 3, name: 'Hidden', key: 'sk-hidden-secret-3333', status: 'active' },
      ],
      usageByKeyId: new Map([
        ['1', { actualCost: 300, tokens: 1000 }],
        ['2', { actualCost: 600, tokens: 900 }],
        ['3', { actualCost: 999, tokens: 9999 }],
      ]),
      visibleKeyIds: ['1', '2'],
      currentApiKey: 'sk-alpha-secret-1111',
      rules,
      period: 'daily',
    });

    expect(result.rankings.map((row) => row.keyName)).toEqual(['Beta', 'Alpha']);
    expect(result.rankings[0]).toMatchObject({ rank: 1, actualCost: 600, tokens: 900, rankName: '大乘飞升' });
    expect(result.currentKey).toMatchObject({ rank: 2, keyName: 'Alpha', actualCost: 300, rankName: '元婴上线' });
    expect(result.currentKey.maskedKey).toBe('sk-alph••••••1111');
  });

  it('keeps current key summary even when key is not visible', () => {
    const result = buildRankings({
      keys: [{ id: 3, name: 'Hidden', key: 'sk-hidden-secret-3333', status: 'active' }],
      usageByKeyId: new Map([['3', { actualCost: 999, tokens: 9999 }]]),
      visibleKeyIds: [],
      currentApiKey: 'sk-hidden-secret-3333',
      rules,
      period: 'monthly',
    });

    expect(result.rankings).toEqual([]);
    expect(result.currentKey).toMatchObject({ keyName: 'Hidden', actualCost: 999, rankName: '大乘飞升' });
  });

  it('uses monthly average cost for rank realm while sorting by total cost', () => {
    const result = buildRankings({
      keys: [
        { id: 1, name: 'Alpha', key: 'sk-alpha-secret-1111', status: 'active' },
        { id: 2, name: 'Beta', key: 'sk-beta-secret-2222', status: 'active' },
      ],
      usageByKeyId: new Map([
        ['1', { actualCost: 600, realmCost: 20, tokens: 1000 }],
        ['2', { actualCost: 300, realmCost: 300, tokens: 900 }],
      ]),
      visibleKeyIds: ['1', '2'],
      currentApiKey: 'sk-alpha-secret-1111',
      rules,
      period: 'monthly',
    });

    expect(result.rankings.map((row) => row.keyName)).toEqual(['Alpha', 'Beta']);
    expect(result.rankings[0]).toMatchObject({ actualCost: 600, realmCost: 20, rankName: '凡人试炼' });
    expect(result.rankings[1]).toMatchObject({ actualCost: 300, realmCost: 300, rankName: '元婴上线' });
  });
});
