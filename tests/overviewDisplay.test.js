import { describe, expect, it } from 'vitest';
import { formatMoney, formatDuration, formatKeyLimit, formatTokens, formatTokenMillions, normalizePage, storageKey } from '../public/overview.js';
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

  it('formats token counts', () => {
    expect(formatTokens(1234567)).toBe('1,234,567');
    expect(formatTokens(0)).toBe('0');
  });

  it('formats large total token counts in millions', () => {
    expect(formatTokenMillions(578527808)).toBe('578.5M');
    expect(formatTokenMillions(1200000)).toBe('1.2M');
    expect(formatTokenMillions(998000)).toBe('1.0M');
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
    expect(html).toContain('今日 Tokens');
  });

  it('does not show a key column in usage records', () => {
    const html = readFileSync('public/overview.html', 'utf8');

    expect(html).toContain('<div class="overview-record-head"><span>时间</span><span>模型</span><span>Tokens</span><span>消耗</span><span>耗时</span></div>');
    expect(html).not.toContain('<span>密钥</span>');
  });

  it('keeps overview actions independent from slow records loading', () => {
    const script = readFileSync('public/overview.js', 'utf8');

    expect(script).toMatch(/currentPage = 1;\s+void loadRecords\(\);/);
    expect(script).not.toMatch(/currentPage = 1;\s+await loadRecords\(\);/);
  });

  it('guards records rendering from stale requests', () => {
    const script = readFileSync('public/overview.js', 'utf8');

    expect(script).toContain('let recordsRequestId = 0;');
    expect(script).toContain('const requestId = ++recordsRequestId;');
    expect(script).toContain('requestId !== recordsRequestId');
  });

  it('shows the loading state for every records request', () => {
    const script = readFileSync('public/overview.js', 'utf8');

    expect(script).toMatch(/async function loadRecords\(\) \{\s+const apiKey[^;]+;\s+const requestId = \+\+recordsRequestId;\s+showRecordsLoading\(\);/);
  });
});
