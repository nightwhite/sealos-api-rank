import { describe, expect, it } from 'vitest';
import { formatMoney, formatDuration, formatKeyLimit, normalizePage, storageKey } from '../public/overview.js';
import { readFileSync } from 'node:fs';

describe('overview display helpers', () => {
  it('formats money for overview usage', () => {
    expect(formatMoney(3.826)).toBe('$3.83');
    expect(formatMoney(0)).toBe('$0.00');
  });

  it('formats key daily limit for overview cards', () => {
    expect(formatKeyLimit(900)).toBe('$900.00');
    expect(formatKeyLimit(0)).toBe('未设置');
    expect(formatKeyLimit(null)).toBe('-');
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

import { loadingRecordsMarkup } from '../public/overview.js';

describe('overview records state', () => {
  it('renders a user-facing loading state for records', () => {
    expect(loadingRecordsMarkup()).toContain('调用记录加载中');
  });
});

describe('overview page structure', () => {
  it('contains a manual refresh action for loaded overview data', () => {
    const html = readFileSync('public/overview.html', 'utf8');

    expect(html).toContain('id="overviewRefreshButton"');
    expect(html).toContain('手动刷新');
    expect(html).toContain('今日限额');
  });
});
