import { describe, expect, it } from 'vitest';
import { formatMoney, formatDuration, normalizePage, storageKey } from '../public/overview.js';

describe('overview display helpers', () => {
  it('formats money for overview usage', () => {
    expect(formatMoney(3.826)).toBe('$3.83');
    expect(formatMoney(0)).toBe('$0.00');
  });

  it('formats request duration', () => {
    expect(formatDuration(1300)).toBe('1.3s');
    expect(formatDuration(80)).toBe('80ms');
  });

  it('normalizes pagination values', () => {
    expect(normalizePage(0)).toBe(1);
    expect(normalizePage('3')).toBe(3);
  });

  it('uses the same API key cache as leaderboard', () => {
    expect(storageKey).toBe('sub2api_rank_user_key');
  });
});
