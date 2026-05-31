import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { createRankService, periodDateRange } from '../src/rankService.js';

function keyHash(value) {
  return createHash('sha256').update(value).digest('hex');
}

function createMemoryDb() {
  const keys = new Map();
  const snapshots = new Map([
    ['daily', { period: 'daily', refreshedAt: null, rows: [] }],
    ['monthly', { period: 'monthly', refreshedAt: null, rows: [] }],
  ]);

  return {
    visibleIds: ['1', '2'],
    rules: {
      daily: [
        { minCost: 0, name: '凡人试炼', color: '#94a3b8' },
        { minCost: 10, name: '炼气入门', color: '#22d3ee' },
      ],
      monthly: [
        { minCost: 0, name: '月初凡人', color: '#94a3b8' },
        { minCost: 1, name: '月度炼气', color: '#22d3ee' },
      ],
    },
    replaceAPIKeys(items) {
      keys.clear();
      for (const item of items) keys.set(String(item.id), { ...item, id: String(item.id) });
    },
    findAPIKeyByHash(hash) {
      return [...keys.values()].find((key) => key.keyHash === hash) || null;
    },
    listVisibleKeyIds() {
      return this.visibleIds;
    },
    listRankRules(period = 'daily') {
      return this.rules[period];
    },
    replaceRankSnapshot(period, snapshot) {
      snapshots.set(period, { period, ...snapshot });
    },
    getRankSnapshot(period) {
      return snapshots.get(period) || { period, refreshedAt: null, rows: [] };
    },
  };
}

describe('periodDateRange', () => {
  it('builds daily and monthly date ranges', () => {
    const now = new Date('2026-05-28T12:00:00+08:00');
    expect(periodDateRange('daily', now)).toEqual({ startDate: '2026-05-28', endDate: '2026-05-28', dayCount: 1 });
    expect(periodDateRange('monthly', now)).toEqual({ startDate: '2026-05-01', endDate: '2026-05-28', dayCount: 28 });
  });
});

describe('createRankService', () => {
  it('refreshes active key usage into the database snapshot', async () => {
    const client = {
      listUsers: vi.fn(async () => ({ items: [{ id: 10 }, { id: 20 }] })),
      listUserAPIKeys: vi.fn(async (userId) => userId === 10
        ? [{ id: 1, name: 'Alpha', key: 'sk-alpha-secret-1111', status: 'active', quota: 0, quota_used: 0, rate_limit_1d: 900, usage_1d: 470.72 }]
        : [
          { id: 2, name: 'Beta', key: 'sk-beta-secret-2222', status: 'active' },
          { id: 3, name: 'Disabled', key: 'sk-disabled-secret-3333', status: 'disabled' },
        ]),
      getUsageStats: vi.fn(async (keyId) => keyId === 1
        ? { total_actual_cost: 12, total_requests: 10, total_tokens: 100 }
        : { total_actual_cost: 24, total_requests: 20, total_tokens: 200 }),
    };
    const db = createMemoryDb();
    const service = createRankService({ client, db, now: () => new Date('2026-05-28T12:00:00+08:00') });

    await service.refreshRankings({ period: 'daily' });

    expect(client.getUsageStats.mock.calls.map(([keyId]) => keyId).sort()).toEqual([1, 2]);
    expect(db.findAPIKeyByHash(keyHash('sk-alpha-secret-1111'))).toMatchObject({ id: '1', name: 'Alpha', status: 'active', rateLimit1d: 900, usage1d: 470.72 });
    expect(db.getRankSnapshot('daily')).toMatchObject({
      period: 'daily',
      refreshedAt: '2026-05-28T04:00:00.000Z',
      rows: [
        expect.objectContaining({ keyId: '2', rank: 1, actualCost: 24, requests: 20, tokens: 200, visible: true }),
        expect.objectContaining({ keyId: '1', rank: 2, actualCost: 12, requests: 10, tokens: 100, visible: true }),
      ],
    });
  });

  it('answers ranking requests from SQLite without calling Sub2API', async () => {
    const client = {
      validateUserKey: vi.fn(),
      listUsers: vi.fn(),
      listUserAPIKeys: vi.fn(),
      getUsageStats: vi.fn(),
    };
    const db = createMemoryDb();
    db.replaceAPIKeys([{ id: 1, keyHash: keyHash('sk-alpha-secret-1111'), name: 'Alpha', maskedKey: 'sk-alpha••••1111', status: 'active' }]);
    db.replaceRankSnapshot('daily', {
      refreshedAt: '2026-05-28T04:00:00.000Z',
      rows: [
        {
          rank: 1,
          keyId: '1',
          keyName: 'Alpha',
          maskedKey: 'sk-alpha••••1111',
          actualCost: 12,
          realmCost: 12,
          tokens: 100,
          rankName: '炼气入门',
          rankColor: '#22d3ee',
          nextRankName: null,
          costToNextRank: null,
          progress: 1,
          visible: true,
        },
      ],
    });
    const service = createRankService({ client, db });

    const result = await service.getRankings({ apiKey: 'sk-alpha-secret-1111', period: 'daily' });

    expect(client.validateUserKey).not.toHaveBeenCalled();
    expect(client.listUsers).not.toHaveBeenCalled();
    expect(result.currentKey).toMatchObject({ keyId: '1', keyName: 'Alpha', isCurrentUserKey: true });
    expect(result.rankings).toEqual([expect.objectContaining({ keyId: '1', isCurrentUserKey: true })]);
  });

  it('keeps a hidden active key out of the public rows while showing its own summary', async () => {
    const db = createMemoryDb();
    db.visibleIds = [];
    db.replaceAPIKeys([{ id: 2, keyHash: keyHash('sk-hidden-secret-2222'), name: 'Hidden', maskedKey: 'sk-hidden••••2222', status: 'active' }]);
    db.replaceRankSnapshot('daily', {
      refreshedAt: '2026-05-28T04:00:00.000Z',
      rows: [
        {
          rank: null,
          keyId: '2',
          keyName: 'Hidden',
          maskedKey: 'sk-hidden••••2222',
          actualCost: 99,
          realmCost: 99,
          tokens: 999,
          rankName: '炼气入门',
          rankColor: '#22d3ee',
          nextRankName: null,
          costToNextRank: null,
          progress: 1,
          visible: false,
        },
      ],
    });
    const service = createRankService({ client: {}, db });

    const result = await service.getRankings({ apiKey: 'sk-hidden-secret-2222', period: 'daily' });

    expect(result.rankings).toEqual([]);
    expect(result.currentKey).toMatchObject({ keyName: 'Hidden', rank: null, isCurrentUserKey: true });
  });

  it('uses current visible key settings when reading an existing snapshot', async () => {
    const db = createMemoryDb();
    db.visibleIds = ['1'];
    db.replaceAPIKeys([{ id: 1, keyHash: keyHash('sk-alpha-secret-1111'), name: 'Alpha', maskedKey: 'sk-alpha••••1111', status: 'active' }]);
    db.replaceRankSnapshot('daily', {
      refreshedAt: '2026-05-28T04:00:00.000Z',
      rows: [
        {
          rank: null,
          keyId: '1',
          keyName: 'Alpha',
          maskedKey: 'sk-alpha••••1111',
          actualCost: 12,
          realmCost: 12,
          tokens: 100,
          rankName: '炼气入门',
          rankColor: '#22d3ee',
          nextRankName: null,
          costToNextRank: null,
          progress: 1,
          visible: false,
        },
      ],
    });
    const service = createRankService({ client: {}, db });

    const result = await service.getRankings({ apiKey: 'sk-alpha-secret-1111', period: 'daily' });

    expect(result.rankings).toEqual([expect.objectContaining({ keyId: '1', rank: 1, visible: true })]);
    expect(result.currentKey).toMatchObject({ keyId: '1', rank: 1, visible: true, isCurrentUserKey: true });
  });

  it('rejects keys that are not in the local active key cache', async () => {
    const service = createRankService({ client: { validateUserKey: vi.fn() }, db: createMemoryDb() });

    await expect(service.getRankings({ apiKey: 'sk-unknown', period: 'daily' })).rejects.toThrow('请等待榜单刷新后再查看');
  });

  it('uses monthly average cost for realm rules and total cost for sorting', async () => {
    const client = {
      listUsers: vi.fn(async () => ({ items: [{ id: 10 }] })),
      listUserAPIKeys: vi.fn(async () => [
        { id: 1, name: 'Alpha', key: 'sk-alpha-secret-1111', status: 'active' },
        { id: 2, name: 'Beta', key: 'sk-beta-secret-2222', status: 'active' },
      ]),
      getUsageStats: vi.fn(async (keyId) => keyId === 1
        ? { total_actual_cost: 28, total_tokens: 100 }
        : { total_actual_cost: 14, total_tokens: 200 }),
    };
    const db = createMemoryDb();
    const service = createRankService({ client, db, now: () => new Date('2026-05-28T12:00:00+08:00') });

    await service.refreshRankings({ period: 'monthly' });

    expect(db.getRankSnapshot('monthly').rows).toEqual([
      expect.objectContaining({ keyId: '1', rank: 1, actualCost: 28, realmCost: 1, rankName: '月度炼气' }),
      expect.objectContaining({ keyId: '2', rank: 2, actualCost: 14, realmCost: 0.5, rankName: '月初凡人' }),
    ]);
  });
});
