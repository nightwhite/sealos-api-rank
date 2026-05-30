export function createSub2APIClient({ baseUrl, adminKey, fetchImpl = fetch }) {
  const gatewayBaseUrl = baseUrl.replace(/\/api\/v1$/, '');

  async function requestJson(url, options = {}) {
    const response = await fetchImpl(url, options);
    const text = await response.text();
    const payload = text ? JSON.parse(text) : null;
    if (!response.ok) throw new Error(`Sub2API request failed: ${response.status}`);
    return payload && typeof payload === 'object' && payload.code === 0 && 'data' in payload ? payload.data : payload;
  }

  function buildQuery(params = {}) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === '') continue;
      search.set(key, String(value));
    }
    return search.toString();
  }

  function adminHeaders(extra = {}) {
    return {
      ...extra,
      'x-api-key': adminKey,
    };
  }

  return {
    async validateUserKey(apiKey) {
      try {
        await requestJson(`${gatewayBaseUrl}/v1/usage`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        return { active: true };
      } catch {
        return { active: false };
      }
    },
    async listUsers() {
      return requestJson(`${baseUrl}/admin/users?page=1&page_size=1000&sort_by=id&sort_order=asc`, {
        method: 'GET',
        headers: adminHeaders(),
      });
    },
    async listUserAPIKeys(userId) {
      const data = await requestJson(`${baseUrl}/admin/users/${userId}/api-keys?page=1&page_size=1000&sort_by=id&sort_order=asc`, {
        method: 'GET',
        headers: adminHeaders(),
      });
      return data.items || [];
    },
    async listAdminUsage(params = {}) {
      const query = buildQuery(params);
      return requestJson(`${baseUrl}/admin/usage${query ? `?${query}` : ''}`, {
        method: 'GET',
        headers: adminHeaders(),
      });
    },
    async getAdminUsageStats(params = {}) {
      const query = buildQuery(params);
      return requestJson(`${baseUrl}/admin/usage/stats${query ? `?${query}` : ''}`, {
        method: 'GET',
        headers: adminHeaders(),
      });
    },
    async getBatchAPIKeyUsage(apiKeyIds) {
      return requestJson(`${baseUrl}/admin/dashboard/api-keys-usage`, {
        method: 'POST',
        headers: adminHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ api_key_ids: apiKeyIds.map(Number) }),
      });
    },
    async getUsageStats(apiKeyId, dateRange) {
      const search = new URLSearchParams({
        api_key_id: String(apiKeyId),
        start_date: dateRange.startDate,
        end_date: dateRange.endDate,
      });
      return requestJson(`${baseUrl}/admin/usage/stats?${search.toString()}`, {
        method: 'GET',
        headers: adminHeaders(),
      });
    },
  };
}
