import { describe, expect, it, vi } from 'vitest';
import { createSub2APIClient } from '../src/sub2apiClient.js';

describe('createSub2APIClient', () => {
  it('validates active user API key through /v1/usage', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ usage: { today: {} } }), { status: 200 }));
    const client = createSub2APIClient({ baseUrl: 'https://sub.example.com/api/v1', adminKey: 'admin-key', fetchImpl: fetchMock });

    const result = await client.validateUserKey('sk-user');

    expect(result).toEqual({ active: true });
    expect(fetchMock).toHaveBeenCalledWith('https://sub.example.com/v1/usage', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer sk-user' }),
    }));
  });

  it('sends admin key only to admin endpoints', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ code: 0, data: { items: [] } }), { status: 200 }));
    const client = createSub2APIClient({ baseUrl: 'https://sub.example.com/api/v1', adminKey: 'admin-key', fetchImpl: fetchMock });

    await client.listUsers();

    expect(fetchMock).toHaveBeenCalledWith('https://sub.example.com/api/v1/admin/users?page=1&page_size=1000&sort_by=id&sort_order=asc', expect.objectContaining({
      headers: expect.objectContaining({ 'x-api-key': 'admin-key' }),
    }));
  });

  it('loads api keys for each user and batch usage stats', async () => {
    const fetchMock = vi.fn(async (url) => {
      if (url.includes('/admin/users/10/api-keys')) {
        return new Response(JSON.stringify({ code: 0, data: { items: [{ id: 7, name: 'Prod', key: 'sk-prod-secret-7777', status: 'active' }] } }), { status: 200 });
      }
      return new Response(JSON.stringify({ code: 0, data: { stats: { 7: { api_key_id: 7, today_actual_cost: 8, total_actual_cost: 99 } } } }), { status: 200 });
    });
    const client = createSub2APIClient({ baseUrl: 'https://sub.example.com/api/v1', adminKey: 'admin-key', fetchImpl: fetchMock });

    await expect(client.listUserAPIKeys(10)).resolves.toEqual([{ id: 7, name: 'Prod', key: 'sk-prod-secret-7777', status: 'active' }]);
    await expect(client.getBatchAPIKeyUsage([7])).resolves.toEqual({ stats: { 7: { api_key_id: 7, today_actual_cost: 8, total_actual_cost: 99 } } });
  });
});
