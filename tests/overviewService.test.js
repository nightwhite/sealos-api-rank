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
  };
  const client = {
    listUsers: vi.fn(async () => ({ items: [{ id: 10 }, { id: 20 }] })),
    listUserAPIKeys: vi.fn(async (userId) => {
      if (userId === 10) return [
        { id: 7, name: '金鳞主钥', key: 'sk-alpha-secret-1111', status: 'active' },
        { id: 8, name: '炼器备用', key: 'sk-beta-secret-2222', status: 'active' },
      ];
      return [{ id: 9, name: 'Other', key: 'sk-other-secret-9999', status: 'active' }];
    }),
    getAdminUsageStats: vi.fn(async (params) => {
      if (params.user_id === 10 && params.period === 'today') return { total_actual_cost: 3.82, total_requests: 186 };
      if (params.api_key_id === 7) return { total_actual_cost: 2.18, total_requests: 98 };
      if (params.api_key_id === 8) return { total_actual_cost: 1.64, total_requests: 88 };
      return { total_actual_cost: 0, total_requests: 0 };
    }),
    listAdminUsage: vi.fn(async () => ({
      page: 1,
      page_size: 20,
      total: 1,
      items: [{ id: 9001, api_key_id: 7, model: 'gpt-4.1', actual_cost: 0.042, duration_ms: 1300, request_type: 'stream', created_at: '2026-05-31T11:58:00.000Z' }],
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
  it('returns aggregate overview for the API key owner', async () => {
    const { service, client, db } = createFixture();

    const result = await service.getOverview({ apiKey: 'sk-alpha-secret-1111' });

    expect(db.replaceAPIKeys).toHaveBeenCalled();
    expect(db.findAPIKeyByHash).toHaveBeenCalledWith(hashKey('sk-alpha-secret-1111'));
    expect(client.getAdminUsageStats).toHaveBeenCalledWith({ user_id: 10, period: 'today', timezone: 'Asia/Shanghai' });
    expect(result.summary).toEqual({ todayCost: 3.82, todayRequests: 186, activeKeyCount: 2, statusName: '初燃灵火' });
    expect(result.keys).toEqual([
      expect.objectContaining({ id: '7', name: '金鳞主钥', status: 'active', todayCost: 2.18, todayRequests: 98 }),
      expect.objectContaining({ id: '8', name: '炼器备用', status: 'active', todayCost: 1.64, todayRequests: 88 }),
    ]);
  });

  it('rejects disabled API keys', async () => {
    const { service, client } = createFixture();
    client.listUserAPIKeys.mockImplementation(async () => [{ id: 7, name: 'Disabled', key: 'sk-disabled-secret-1111', status: 'disabled' }]);

    await expect(service.getOverview({ apiKey: 'sk-disabled-secret-1111' })).rejects.toThrow('这个 API Key 当前不可用');
  });

  it('returns paginated records for the API key owner', async () => {
    const { service, client } = createFixture();

    const result = await service.getRecords({ apiKey: 'sk-alpha-secret-1111', page: 1, pageSize: 20 });

    expect(client.listAdminUsage).toHaveBeenCalledWith({ user_id: 10, page: 1, page_size: 20, sort_by: 'created_at', sort_order: 'desc', timezone: 'Asia/Shanghai' });
    expect(result).toEqual({
      page: 1,
      pageSize: 20,
      total: 1,
      items: [expect.objectContaining({ id: '9001', keyName: '金鳞主钥', model: 'gpt-4.1', cost: 0.042, durationMs: 1300, status: 'success' })],
    });
  });
});
