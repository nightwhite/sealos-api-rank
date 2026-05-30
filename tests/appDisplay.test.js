import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import * as appModule from '../public/app.js';
import { loadingTitle, normalizeStoredKey, periodLabels, refreshErrorState, refreshHintText, refreshIntervalMs, shouldForgetStoredKey, usageDisplayValue } from '../public/app.js';

describe('usageDisplayValue', () => {
  it('uses monthly average cost as the primary value and keeps total as context', () => {
    expect(usageDisplayValue({ period: 'monthly', actualCost: 580, realmCost: 20, tokens: 1234 })).toEqual({
      primaryCost: 20,
      primaryLabel: '日均',
      detailCost: 580,
      detailLabel: '本月',
      tokens: 1234,
    });
  });

  it('uses total cost as the daily primary value', () => {
    expect(usageDisplayValue({ period: 'daily', actualCost: 18, realmCost: 18, tokens: 99 })).toEqual({
      primaryCost: 18,
      primaryLabel: '今日',
      detailCost: null,
      detailLabel: '',
      tokens: 99,
    });
  });
});

describe('refreshHintText', () => {
  it('shows explicit last refresh time for daily rankings', () => {
    expect(refreshHintText({ period: 'daily', refreshedAt: '2026-05-29T03:20:00.000Z' })).toContain('上次刷新');
  });

  it('keeps monthly realm hint with explicit last refresh time', () => {
    const text = refreshHintText({ period: 'monthly', refreshedAt: '2026-05-29T03:20:00.000Z' });

    expect(text).toContain('境界按日均修为');
    expect(text).toContain('上次刷新');
  });
});

describe('shouldForgetStoredKey', () => {
  it('keeps the stored key when ranking requests fail', () => {
    expect(shouldForgetStoredKey('只有启用中的 API Key 可以查看排行榜')).toBe(false);
    expect(shouldForgetStoredKey('排行榜暂时无法更新')).toBe(false);
  });
});

describe('loadingTitle', () => {
  it('shows the target period while rankings are loading', () => {
    expect(loadingTitle('daily')).toBe('今日功绩榜');
    expect(loadingTitle('monthly')).toBe('月度境界榜');
  });
});

describe('periodLabels', () => {
  it('uses daily merit language for daily rankings', () => {
    expect(periodLabels('daily')).toEqual({
      current: '今日功绩',
      next: '距下一功绩',
      column: '今日功绩',
      max: '今日功绩已满',
    });
  });

  it('uses realm language for monthly rankings', () => {
    expect(periodLabels('monthly')).toEqual({
      current: '月度境界',
      next: '距下一境界',
      column: '月度境界',
      max: '已达最高境界',
    });
  });
});

describe('refreshIntervalMs', () => {
  it('refreshes ranking data every 30 seconds', () => {
    expect(refreshIntervalMs).toBe(30 * 1000);
  });
});

describe('leaderboard snapshot cache', () => {
  it('does not expose frontend leaderboard snapshot cache helpers', () => {
    expect(appModule.cacheSnapshotKey).toBeUndefined();
  });
});

describe('normalizeStoredKey', () => {
  it('only stores non-empty API keys', () => {
    expect(normalizeStoredKey('  sk-user  ')).toBe('sk-user');
    expect(normalizeStoredKey('   ')).toBe('');
  });
});

describe('refreshErrorState', () => {
  it('keeps the entry hidden when a silent refresh fails after rankings are visible', () => {
    expect(refreshErrorState({ silent: true, hasVisibleLeaderboard: true, message: '网络错误' })).toEqual({
      showEntry: false,
      message: '自动刷新失败，稍后再试',
    });
  });

  it('shows the entry when a manual ranking load fails before rankings are visible', () => {
    expect(refreshErrorState({ silent: false, hasVisibleLeaderboard: false, message: '网络错误' })).toEqual({
      showEntry: true,
      message: '网络错误',
    });
  });
});

describe('yunshan visual style', () => {
  it('contains the paper, mountain and vertical banner style hooks', () => {
    const css = readFileSync('public/styles.css', 'utf8');

    expect(css).toContain('#efe6d2');
    expect(css).toContain('.mountain-art');
    expect(css).toContain('.vertical-banner');
    expect(css).toContain('.rank-page::before');
  });
});
