import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { createOverviewService, overviewStatusName } from '../src/overviewService.js';

function hashKey(value) {
  return createHash('sha256').update(value).digest('hex');
}

function createFixture() {
  const storedKeys = new Map();
  const db = {
    replaceAPIKeys: vi.fn((keys) => {
      storedKeys.clear();
      for (const key of keys) storedKeys.set(key.keyHash, { ...key, id: String(key.id), userId: String(key.userId) });
    }),
    findAPIKeyByHash: vi.fn((keyHash) => storedKeys.get(keyHash) || null),
    getRankSnapshot: vi.fn(() => ({
      period: 'daily',
      refreshedAt: '2026-05-31T11:55:00.000Z',
      rows: [
        {
          keyId: '7',
          keyName: '金鳞主钥',
          maskedKey: 'sk-alpha••••1111',
          actualCost: 2.18,
          requests: 98,
          tokens: 1234,
          rankName: '初燃灵火',
        },
      ],
    })),
  };
  const client = {
    listUsers: vi.fn(async () => ({ items: [{ id: 10 }, { id: 20 }] })),
    listUserAPIKeys: vi.fn(async (userId) => {
      if (userId === 10) return [
          { id: 7, name: '金鳞主钥', key: 'sk-alpha-secret-1111', status: 'active', quota: 0, quota_used: 0, rate_limit_1d: 900, usage_1d: 470.72 },
          { id: 8, name: '炼器备用', key: 'sk-beta-secret-2222', status: 'active', quota: 0, quota_used: 0, rate_limit_1d: 0, usage_1d: 0 },
      ];
      return [{ id: 9, name: 'Other', key: 'sk-other-secret-9999', status: 'active' }];
    }),
    getAdminUsageStats: vi.fn(async (params) => {
      if (params.user_id === 10 && params.period === 'today') return { total_actual_cost: 3.82, total_requests: 186 };
      if (params.api_key_id === 7) return { total_actual_cost: 2.18, total_requests: 98 };
      if (params.api_key_id === 8) return { total_actual_cost: 1.64, total_requests: 88 };
      return { total_actual_cost: 0, total_requests: 0 };
    }),
    getUsageStats: vi.fn(async () => ({ total_actual_cost: 4.56, total_requests: 123, total_tokens: 4567 })),
    listAdminUsage: vi.fn(async () => ({
      page: 1,
      page_size: 20,
      total: 1,
      items: [{ id: 9001, api_key_id: 7, model: 'gpt-4.1', input_tokens: 100, output_tokens: 20, cache_creation_tokens: 3, cache_read_tokens: 4, actual_cost: 0.042, duration_ms: 1300, request_type: 'stream', created_at: '2026-05-31T11:58:00.000Z' }],
    })),
  };
  const service = createOverviewService({ client, db, now: () => new Date('2026-05-31T12:00:00+08:00') });
  return { service, client, db };
}

describe('overviewStatusName', () => {
  it('names daily status by today cost', () => {
    expect(overviewStatusName(0)).toBe('静心观望');
    expect(overviewStatusName(5)).toBe('灵泉涌动');
    expect(overviewStatusName(300)).toBe('破晓登峰');
  });
});

describe('createOverviewService', () => {
  it('returns overview only for the submitted API key', async () => {
    const { service, client, db } = createFixture();
    db.replaceAPIKeys([{ id: 7, userId: 10, keyHash: hashKey('sk-alpha-secret-1111'), name: '金鳞主钥', maskedKey: 'sk-alpha••••1111', status: 'active', quota: 0, quotaUsed: 0, rateLimit1d: 900, usage1d: 470.72 }]);

    const result = await service.getOverview({ apiKey: 'sk-alpha-secret-1111' });

    expect(client.getUsageStats).toHaveBeenCalledWith('7', {
      startDate: '2026-05-31',
      endDate: '2026-05-31',
      dayCount: 1,
    });
    expect(client.getAdminUsageStats).not.toHaveBeenCalled();
    expect(client.listUsers).not.toHaveBeenCalled();
    expect(result.summary).toEqual({ todayCost: 4.56, todayRequests: 123, todayTokens: 4567, activeKeyCount: 1, quota: 0, quotaUsed: 0, quotaRemaining: null, dailyLimit: 900, dailyLimitUsed: 470.72, dailyLimitRemaining: 429.28, statusName: '初燃灵火' });
    expect(result.keys).toEqual([
      expect.objectContaining({ id: '7', name: '金鳞主钥', status: 'active', todayCost: 4.56, todayRequests: 123, todayTokens: 4567, dailyLimit: 900, dailyLimitUsed: 470.72, dailyLimitRemaining: 429.28 }),
    ]);
    expect(result.refreshedAt).toBe('2026-05-31T04:00:00.000Z');
  });

  it('rounds quota remaining values to cents', async () => {
    const { service, db } = createFixture();
    db.replaceAPIKeys([{ id: 7, userId: 10, keyHash: hashKey('sk-alpha-secret-1111'), name: '金鳞主钥', maskedKey: 'sk-alpha••••1111', status: 'active', quota: 1000.1, quotaUsed: 999.82, rateLimit1d: 1000.1, usage1d: 999.82 }]);

    const result = await service.getOverview({ apiKey: 'sk-alpha-secret-1111' });

    expect(result.summary.quotaRemaining).toBe(0.28);
    expect(result.summary.dailyLimitRemaining).toBe(0.28);
    expect(result.keys[0].quotaRemaining).toBe(0.28);
    expect(result.keys[0].dailyLimitRemaining).toBe(0.28);
  });

  it('queries overview usage by Asia/Shanghai date instead of cached snapshot totals', async () => {
    const previousTimezone = process.env.TZ;
    process.env.TZ = 'UTC';
    try {
      const { client, db } = createFixture();
      const service = createOverviewService({ client, db, now: () => new Date('2026-05-31T01:00:00+08:00') });
      db.replaceAPIKeys([{ id: 7, userId: 10, keyHash: hashKey('sk-alpha-secret-1111'), name: '金鳞主钥', maskedKey: 'sk-alpha••••1111', status: 'active' }]);

      await service.getOverview({ apiKey: 'sk-alpha-secret-1111' });

      expect(client.getUsageStats).toHaveBeenCalledWith('7', expect.objectContaining({
        startDate: '2026-05-31',
        endDate: '2026-05-31',
      }));
    } finally {
      process.env.TZ = previousTimezone;
    }
  });

  it('rejects disabled API keys', async () => {
    const { service, db } = createFixture();
    db.replaceAPIKeys([{ id: 7, userId: 10, keyHash: hashKey('sk-disabled-secret-1111'), name: 'Disabled', maskedKey: 'sk-disabled••••1111', status: 'disabled' }]);

    await expect(service.getOverview({ apiKey: 'sk-disabled-secret-1111' })).rejects.toThrow('这个 API Key 当前不可用');
  });

  it('opens overview from realtime usage before the daily snapshot is ready', async () => {
    const { service, db } = createFixture();
    db.replaceAPIKeys([{ id: 7, userId: 10, keyHash: hashKey('sk-alpha-secret-1111'), name: '金鳞主钥', maskedKey: 'sk-alpha••••1111', status: 'active' }]);
    db.getRankSnapshot.mockReturnValueOnce({ period: 'daily', refreshedAt: null, rows: [] });

    const result = await service.getOverview({ apiKey: 'sk-alpha-secret-1111' });

    expect(result.summary).toMatchObject({ todayCost: 4.56, todayRequests: 123, todayTokens: 4567 });
  });

  it('treats an empty realtime usage response as zero usage', async () => {
    const { service, client, db } = createFixture();
    db.replaceAPIKeys([{ id: 7, userId: 10, keyHash: hashKey('sk-alpha-secret-1111'), name: '金鳞主钥', maskedKey: 'sk-alpha••••1111', status: 'active' }]);
    client.getUsageStats.mockResolvedValueOnce(null);

    const result = await service.getOverview({ apiKey: 'sk-alpha-secret-1111' });

    expect(result.summary).toMatchObject({ todayCost: 0, todayRequests: 0, todayTokens: 0 });
  });

  it('explains missing cached API keys without implying the key is valid', async () => {
    const { service } = createFixture();

    await expect(service.getOverview({ apiKey: 'sk-unknown-secret' })).rejects.toThrow('未找到该 API Key。如果是新创建的 Key，请等待榜单刷新后再试；否则请检查输入是否正确。');
  });

  it('returns paginated records only for the submitted API key', async () => {
    const { service, client, db } = createFixture();
    db.replaceAPIKeys([{ id: 7, userId: 10, keyHash: hashKey('sk-alpha-secret-1111'), name: '金鳞主钥', maskedKey: 'sk-alpha••••1111', status: 'active' }]);

    const result = await service.getRecords({ apiKey: 'sk-alpha-secret-1111', page: 1, pageSize: 20 });

    expect(client.listAdminUsage).toHaveBeenCalledWith({
      api_key_id: 7,
      page: 1,
      page_size: 20,
      sort_by: 'created_at',
      sort_order: 'desc',
      timezone: 'Asia/Shanghai',
      start_date: '2026-05-31',
      end_date: '2026-05-31',
    });
    expect(client.listUsers).not.toHaveBeenCalled();
    expect(result).toEqual({
      page: 1,
      pageSize: 20,
      total: 1,
      items: [expect.objectContaining({ id: '9001', keyName: '金鳞主钥', model: 'gpt-4.1', tokens: 127, cost: 0.042, durationMs: 1300, status: 'success' })],
    });
  });

  it('queries records by Asia/Shanghai date instead of server local date', async () => {
    const previousTimezone = process.env.TZ;
    process.env.TZ = 'UTC';
    try {
      const { client, db } = createFixture();
      const service = createOverviewService({ client, db, now: () => new Date('2026-05-31T01:00:00+08:00') });
      db.replaceAPIKeys([{ id: 7, userId: 10, keyHash: hashKey('sk-alpha-secret-1111'), name: '金鳞主钥', maskedKey: 'sk-alpha••••1111', status: 'active' }]);

      await service.getRecords({ apiKey: 'sk-alpha-secret-1111', page: 1, pageSize: 20 });

      expect(client.listAdminUsage).toHaveBeenCalledWith(expect.objectContaining({
        start_date: '2026-05-31',
        end_date: '2026-05-31',
      }));
    } finally {
      process.env.TZ = previousTimezone;
    }
  });
});
