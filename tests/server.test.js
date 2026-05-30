import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp, startRankSchedulers } from '../src/server.js';

function createTestApp() {
  const sessions = new Map();
  const db = {
    listVisibleKeyIds: vi.fn(() => ['1']),
    replaceVisibleKeys: vi.fn(),
    listRankRules: vi.fn(() => [{ minCost: 0, name: '凡人试炼', color: '#94a3b8' }]),
    replaceRankRules: vi.fn(),
    replaceAPIKeys: vi.fn(),
    listAPIKeys: vi.fn(() => [
      { id: '1', name: 'Alpha', maskedKey: 'sk-alpha••••1111', status: 'active' },
      { id: '2', name: 'Beta', maskedKey: 'sk-beta••••2222', status: 'disabled' },
    ]),
    findAPIKeyByHash: vi.fn(() => ({ id: '1', userId: '10', name: 'Alpha', status: 'active' })),
    getRankSnapshot: vi.fn(() => ({
      period: 'daily',
      refreshedAt: '2026-05-28T04:00:00.000Z',
      rows: [
        {
          keyId: '1',
          keyName: 'Alpha',
          maskedKey: 'sk-alpha••••1111',
          rank: 1,
          actualCost: 10,
          realmCost: 10,
          tokens: 99,
          rankName: '凡人试炼',
          rankColor: '#94a3b8',
          nextRankName: null,
          costToNextRank: null,
          progress: 1,
          visible: true,
        },
      ],
    })),
    createAdminSession: vi.fn((hash, expiresAt) => sessions.set(hash, { token_hash: hash, expires_at: expiresAt })),
    getAdminSession: vi.fn((hash) => sessions.get(hash)),
    deleteExpiredAdminSessions: vi.fn(),
  };
  const client = {
    listUsers: vi.fn(async () => ({ items: [{ id: 10 }] })),
    listUserAPIKeys: vi.fn(async () => [{ id: 1, name: 'Alpha', key: 'sk-alpha-secret-1111', status: 'active' }]),
    getAdminUsageStats: vi.fn(async (params) => {
      if (params.user_id === 10) return { total_actual_cost: 3.82, total_requests: 186 };
      return { total_actual_cost: 2.18, total_requests: 98 };
    }),
    listAdminUsage: vi.fn(async () => ({
      page: 1,
      page_size: 20,
      total: 1,
      items: [{ id: 9001, api_key_id: 1, model: 'gpt-4.1', actual_cost: 0.042, duration_ms: 1300, request_type: 'stream', created_at: '2026-05-31T11:58:00.000Z' }],
    })),
    getUsageStats: vi.fn(async () => ({ total_actual_cost: 10, total_tokens: 99 })),
  };
  const app = createApp({
    config: { adminPassword: 'secret' },
    db,
    client,
    now: () => new Date('2026-05-28T12:00:00+08:00'),
  });
  return { app, db, client };
}

describe('createApp', () => {
  it('returns rankings from the local service snapshot', async () => {
    const { app, client } = createTestApp();

    const response = await request(app).post('/api/rankings').send({ apiKey: 'sk-alpha-secret-1111', period: 'daily' });

    expect(response.status).toBe(200);
    expect(response.body.rankings[0]).toMatchObject({ keyName: 'Alpha', actualCost: 10, tokens: 99 });
    expect(response.body.currentKey.keyName).toBe('Alpha');
    expect(client.listUsers).not.toHaveBeenCalled();
    expect(client.getUsageStats).not.toHaveBeenCalled();
  });

  it('does not warm rankings when createApp is called', async () => {
    const { client } = createTestApp();

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(client.getUsageStats).not.toHaveBeenCalled();
  });

  it('starts daily and monthly schedulers explicitly', async () => {
    vi.useFakeTimers();
    const rankService = {
      refreshRankings: vi.fn(async () => {}),
    };

    const scheduler = startRankSchedulers({ rankService, intervalMs: 5 * 60 * 1000 });
    await vi.runOnlyPendingTimersAsync();

    expect(rankService.refreshRankings).toHaveBeenCalledWith({ period: 'daily' });
    expect(rankService.refreshRankings).toHaveBeenCalledWith({ period: 'monthly' });

    scheduler.stop();
    vi.useRealTimers();
  });


  it('returns user overview for cached API key owner', async () => {
    const { app } = createTestApp();

    const response = await request(app).post('/api/overview').send({ apiKey: 'sk-alpha-secret-1111' });

    expect(response.status, response.body.message).toBe(200);
    expect(response.body.summary).toMatchObject({ todayCost: 3.82, todayRequests: 186 });
    expect(response.body.keys[0]).toMatchObject({ name: 'Alpha', todayCost: 2.18, todayRequests: 98 });
  });

  it('returns paginated user overview records', async () => {
    const { app } = createTestApp();

    const response = await request(app).post('/api/overview/records').send({ apiKey: 'sk-alpha-secret-1111', page: 1, pageSize: 20 });

    expect(response.status, response.body.message).toBe(200);
    expect(response.body).toMatchObject({ page: 1, pageSize: 20, total: 1 });
    expect(response.body.items[0]).toMatchObject({ keyName: 'Alpha', model: 'gpt-4.1', cost: 0.042 });
  });

  it('validates overview API key input', async () => {
    const { app } = createTestApp();

    const response = await request(app).post('/api/overview').send({ apiKey: '' });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('请先输入 API Key');
  });

  it('logs admin in and saves visible keys', async () => {
    const { app, db } = createTestApp();

    const login = await request(app).post('/api/admin/login').send({ password: 'secret' });
    const cookie = login.headers['set-cookie'];
    await request(app).put('/api/admin/visible-keys').set('Cookie', cookie).send({ keyIds: ['1', '2'] }).expect(200);

    expect(db.replaceVisibleKeys).toHaveBeenCalledWith(['1', '2']);
  });

  it('protects admin endpoints', async () => {
    const { app } = createTestApp();

    await request(app).get('/api/admin/keys').expect(401);
  });

  it('reads admin key visibility from the local key cache', async () => {
    const { app, client } = createTestApp();

    const login = await request(app).post('/api/admin/login').send({ password: 'secret' });
    const cookie = login.headers['set-cookie'];
    const response = await request(app).get('/api/admin/keys').set('Cookie', cookie).expect(200);

    expect(response.body.items).toEqual([
      expect.objectContaining({ id: '1', name: 'Alpha', visible: true }),
      expect.objectContaining({ id: '2', name: 'Beta', visible: false }),
    ]);
    expect(client.listUsers).not.toHaveBeenCalled();
  });

  it('reads and saves rank rules per period', async () => {
    const { app, db } = createTestApp();

    const login = await request(app).post('/api/admin/login').send({ password: 'secret' });
    const cookie = login.headers['set-cookie'];
    await request(app).get('/api/admin/rank-rules?period=monthly').set('Cookie', cookie).expect(200);
    await request(app)
      .put('/api/admin/rank-rules?period=monthly')
      .set('Cookie', cookie)
      .send({ rules: [{ minCost: 0, name: '月榜入门', color: '#ffffff' }] })
      .expect(200);

    expect(db.listRankRules).toHaveBeenCalledWith('monthly');
    expect(db.replaceRankRules).toHaveBeenCalledWith('monthly', [{ minCost: 0, name: '月榜入门', color: '#ffffff' }]);
  });
});
