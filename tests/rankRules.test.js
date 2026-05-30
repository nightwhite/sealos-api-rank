import { describe, expect, it } from 'vitest';
import { maskApiKey } from '../src/mask.js';
import { resolveRankRule } from '../src/rankRules.js';

const rules = [
  { minCost: 0, name: '凡人试炼', color: '#94a3b8' },
  { minCost: 120, name: '金丹调参', color: '#facc15' },
  { minCost: 200, name: '元婴上线', color: '#fbbf24' },
];

describe('maskApiKey', () => {
  it('keeps fixed prefix and suffix', () => {
    expect(maskApiKey('sk-9x2abcdefm81q')).toBe('sk-9x2a••••••m81q');
  });

  it('does not expose short keys', () => {
    expect(maskApiKey('short')).toBe('••••••');
  });
});

describe('resolveRankRule', () => {
  it('returns current rule and next rule progress', () => {
    expect(resolveRankRule(186.2, rules)).toEqual({
      name: '金丹调参',
      color: '#facc15',
      nextRankName: '元婴上线',
      costToNextRank: 13.8,
      progress: 0.8275,
    });
  });

  it('handles max rank', () => {
    expect(resolveRankRule(260, rules)).toEqual({
      name: '元婴上线',
      color: '#fbbf24',
      nextRankName: null,
      costToNextRank: null,
      progress: 1,
    });
  });
});
