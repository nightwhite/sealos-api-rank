# 用户总览页实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 新增普通用户「我的总览」页面，复用排行榜缓存的 API Key，展示当前输入 API Key 的今日用量、密钥概览和分页调用记录，不展示 token 消耗。

**架构：** 后端增加一个专注的 `overviewService`，负责同步 Key 归属、查询 Sub2API 管理用量接口并转换成用户视角数据。前端新增 `/overview.html` 与 `/overview.js`，复用现有 CSS、中国风视觉和 `localStorage` 缓存键。数据库仅在 `api_keys` 表补充 `user_id`，不保存用户输入的原始 API Key。

**技术栈：** Node.js ESM、Express、better-sqlite3、原生浏览器 JavaScript、Vitest、Supertest。

---

## 文件结构

- 修改：`/Users/night/Documents/code/sealos/sub2api-rank/src/db.js`
  - 给 `api_keys` 增加 `user_id` 迁移。
  - `replaceAPIKeys` 写入 `userId`。
  - `findAPIKeyByHash`、`listAPIKeys` 返回 `userId`。
- 修改：`/Users/night/Documents/code/sealos/sub2api-rank/src/rankService.js`
  - `listAllKeys` 给每个 Key 带上 `userId`，保证排行榜刷新也会维护 Key 归属。
- 修改：`/Users/night/Documents/code/sealos/sub2api-rank/src/sub2apiClient.js`
  - 增加 `listAdminUsage(params)`。
  - 增加 `getAdminUsageStats(params)`。
- 创建：`/Users/night/Documents/code/sealos/sub2api-rank/src/overviewService.js`
  - 用户总览业务逻辑：同步 Key、识别用户、查询当前 Key 今日数据、分页调用记录。
- 修改：`/Users/night/Documents/code/sealos/sub2api-rank/src/server.js`
  - 注入 `overviewService`。
  - 新增 `POST /api/overview` 和 `POST /api/overview/records`。
- 创建：`/Users/night/Documents/code/sealos/sub2api-rank/public/overview.html`
  - 用户总览页面结构。
- 创建：`/Users/night/Documents/code/sealos/sub2api-rank/public/overview.js`
  - 前端加载、缓存、渲染、分页逻辑。
- 修改：`/Users/night/Documents/code/sealos/sub2api-rank/public/index.html`
  - 增加「我的总览」导航入口。
- 修改：`/Users/night/Documents/code/sealos/sub2api-rank/public/styles.css`
  - 复用现有修仙主题，补充总览卡片、密钥列表、记录表格样式。
- 修改：`/Users/night/Documents/code/sealos/sub2api-rank/tests/db.test.js`
  - 覆盖 `userId` 迁移与读写。
- 修改：`/Users/night/Documents/code/sealos/sub2api-rank/tests/sub2apiClient.test.js`
  - 覆盖新增 Sub2API 管理用量接口。
- 创建：`/Users/night/Documents/code/sealos/sub2api-rank/tests/overviewService.test.js`
  - 覆盖用户总览服务行为。
- 修改：`/Users/night/Documents/code/sealos/sub2api-rank/tests/server.test.js`
  - 覆盖新增 HTTP 接口。
- 创建：`/Users/night/Documents/code/sealos/sub2api-rank/tests/overviewDisplay.test.js`
  - 覆盖前端纯函数。

---

### 任务 1：数据库保存 API Key 归属

**文件：**
- 修改：`/Users/night/Documents/code/sealos/sub2api-rank/tests/db.test.js`
- 修改：`/Users/night/Documents/code/sealos/sub2api-rank/src/db.js`

- [ ] **步骤 1：编写失败的测试**

在 `tests/db.test.js` 的 `stores api key cache and finds keys by hash` 中，把测试数据和断言改成包含 `userId`：

```js
db.replaceAPIKeys([
  { id: 1, userId: 10, keyHash: 'hash-alpha', name: 'Alpha', maskedKey: 'sk-alpha••••1111', status: 'active' },
  { id: 2, userId: 20, keyHash: 'hash-beta', name: 'Beta', maskedKey: 'sk-beta••••2222', status: 'disabled' },
]);

expect(db.findAPIKeyByHash('hash-alpha')).toMatchObject({
  id: '1',
  userId: '10',
  keyHash: 'hash-alpha',
  name: 'Alpha',
  maskedKey: 'sk-alpha••••1111',
  status: 'active',
});
expect(db.listAPIKeys()).toEqual([
  expect.objectContaining({ id: '1', userId: '10', name: 'Alpha', status: 'active' }),
  expect.objectContaining({ id: '2', userId: '20', name: 'Beta', status: 'disabled' }),
]);
```

新增一个迁移测试，放在同一个 `describe` 内：

```js
it('migrates api key cache with user ownership', () => {
  const databasePath = tempDbPath();
  const sqlite = new Database(databasePath);
  sqlite.exec(`
    CREATE TABLE api_keys (
      id TEXT PRIMARY KEY,
      key_hash TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      masked_key TEXT NOT NULL,
      status TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  sqlite.prepare(`
    INSERT INTO api_keys (id, key_hash, name, masked_key, status, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run('1', 'hash-alpha', 'Alpha', 'sk-alpha••••1111', 'active', '2026-05-31T00:00:00.000Z');
  sqlite.close();

  const db = createDatabase(databasePath);

  db.replaceAPIKeys([
    { id: 1, userId: 10, keyHash: 'hash-alpha', name: 'Alpha', maskedKey: 'sk-alpha••••1111', status: 'active' },
  ]);
  expect(db.findAPIKeyByHash('hash-alpha')).toMatchObject({ userId: '10' });
  db.close();
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：

```bash
npm test -- tests/db.test.js
```

预期：FAIL，失败原因是 `userId` 不存在或 SQLite 表没有 `user_id` 字段。

- [ ] **步骤 3：编写最少实现代码**

在 `src/db.js` 的 `CREATE TABLE IF NOT EXISTS api_keys` 中增加 `user_id TEXT NOT NULL DEFAULT ''`。

在 `migrate(sqlite)` 中增加：

```js
ensureColumn(sqlite, 'api_keys', 'user_id', "TEXT NOT NULL DEFAULT ''");
```

修改 `replaceAPIKeys` 的 SQL：

```js
INSERT INTO api_keys (id, user_id, key_hash, name, masked_key, status, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET
  user_id = excluded.user_id,
  key_hash = excluded.key_hash,
  name = excluded.name,
  masked_key = excluded.masked_key,
  status = excluded.status,
  updated_at = excluded.updated_at
```

循环写入参数改为：

```js
upsert.run(String(key.id), String(key.userId || ''), key.keyHash, key.name, key.maskedKey, key.status, now);
```

修改 `findAPIKeyByHash` 和 `listAPIKeys` 的 SELECT，加入 `user_id`。

修改 `toAPIKey(row)` 返回：

```js
userId: row.user_id,
```

- [ ] **步骤 4：运行测试验证通过**

运行：

```bash
npm test -- tests/db.test.js
```

预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add /Users/night/Documents/code/sealos/sub2api-rank/tests/db.test.js /Users/night/Documents/code/sealos/sub2api-rank/src/db.js
git commit -m "feat(总览): 保存 API Key 用户归属"
```

---

### 任务 2：Sub2API client 增加管理用量接口

**文件：**
- 修改：`/Users/night/Documents/code/sealos/sub2api-rank/tests/sub2apiClient.test.js`
- 修改：`/Users/night/Documents/code/sealos/sub2api-rank/src/sub2apiClient.js`

- [ ] **步骤 1：编写失败的测试**

在 `tests/sub2apiClient.test.js` 增加：

```js
it('loads admin usage logs with pagination and filters', async () => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({
    code: 0,
    data: { items: [{ id: 9001, api_key_id: 7, model: 'gpt-4.1' }], total: 1, page: 2, page_size: 20 },
  }), { status: 200 }));
  const client = createSub2APIClient({ baseUrl: 'https://sub.example.com/api/v1', adminKey: 'admin-key', fetchImpl: fetchMock });

  await expect(client.listAdminUsage({ user_id: 10, page: 2, page_size: 20, sort_by: 'created_at', sort_order: 'desc', timezone: 'Asia/Shanghai' }))
    .resolves.toEqual({ items: [{ id: 9001, api_key_id: 7, model: 'gpt-4.1' }], total: 1, page: 2, page_size: 20 });

  expect(fetchMock).toHaveBeenCalledWith(
    'https://sub.example.com/api/v1/admin/usage?user_id=10&page=2&page_size=20&sort_by=created_at&sort_order=desc&timezone=Asia%2FShanghai',
    expect.objectContaining({ headers: expect.objectContaining({ 'x-api-key': 'admin-key' }) }),
  );
});

it('loads admin usage stats with filters', async () => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({
    code: 0,
    data: { total_requests: 8, total_actual_cost: 1.23 },
  }), { status: 200 }));
  const client = createSub2APIClient({ baseUrl: 'https://sub.example.com/api/v1', adminKey: 'admin-key', fetchImpl: fetchMock });

  await expect(client.getAdminUsageStats({ user_id: 10, period: 'today', timezone: 'Asia/Shanghai' }))
    .resolves.toEqual({ total_requests: 8, total_actual_cost: 1.23 });

  expect(fetchMock).toHaveBeenCalledWith(
    'https://sub.example.com/api/v1/admin/usage/stats?user_id=10&period=today&timezone=Asia%2FShanghai',
    expect.objectContaining({ headers: expect.objectContaining({ 'x-api-key': 'admin-key' }) }),
  );
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：

```bash
npm test -- tests/sub2apiClient.test.js
```

预期：FAIL，失败原因是 `listAdminUsage` 和 `getAdminUsageStats` 不是函数。

- [ ] **步骤 3：编写最少实现代码**

在 `src/sub2apiClient.js` 内部增加：

```js
function buildQuery(params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  return search.toString();
}
```

在返回对象中增加：

```js
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
```

- [ ] **步骤 4：运行测试验证通过**

运行：

```bash
npm test -- tests/sub2apiClient.test.js
```

预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add /Users/night/Documents/code/sealos/sub2api-rank/tests/sub2apiClient.test.js /Users/night/Documents/code/sealos/sub2api-rank/src/sub2apiClient.js
git commit -m "feat(总览): 接入 Sub2API 用量查询"
```

---

### 任务 3：实现用户总览服务

**文件：**
- 创建：`/Users/night/Documents/code/sealos/sub2api-rank/tests/overviewService.test.js`
- 创建：`/Users/night/Documents/code/sealos/sub2api-rank/src/overviewService.js`
- 修改：`/Users/night/Documents/code/sealos/sub2api-rank/src/rankService.js`

- [ ] **步骤 1：编写失败的测试**

创建 `tests/overviewService.test.js`：

```js
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
    expect(result.summary).toEqual({ todayCost: 3.82, todayRequests: 186, activeKeyCount: 2, statusName: '灵泉涌动' });
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
```

- [ ] **步骤 2：运行测试验证失败**

运行：

```bash
npm test -- tests/overviewService.test.js
```

预期：FAIL，失败原因是 `src/overviewService.js` 不存在。

- [ ] **步骤 3：编写最少实现代码**

创建 `src/overviewService.js`，实现以下导出：

```js
import { createHash } from 'node:crypto';
import { maskApiKey } from './mask.js';

const timezone = 'Asia/Shanghai';
const statusRules = [
  { minCost: 0, name: '静心观望' },
  { minCost: 1, name: '初燃灵火' },
  { minCost: 5, name: '灵泉涌动' },
  { minCost: 20, name: '御剑疾行' },
  { minCost: 60, name: '剑气如虹' },
  { minCost: 150, name: '一日千里' },
  { minCost: 300, name: '破晓登峰' },
];

export function createOverviewService({ client, db, now = () => new Date() }) {
  async function syncKeys() {
    const users = await client.listUsers();
    const keyGroups = await Promise.all((users.items || []).map(async (user) => {
      const keys = await client.listUserAPIKeys(user.id);
      return keys.map((key) => ({ ...key, userId: user.id }));
    }));
    db.replaceAPIKeys(keyGroups.flat().map((key) => ({
      id: key.id,
      userId: key.userId,
      keyHash: hashAPIKey(key.key),
      name: key.name || `Key #${key.id}`,
      maskedKey: maskApiKey(key.key),
      status: key.status,
    })));
  }

  async function findOwner(apiKey) {
    const normalized = String(apiKey || '').trim();
    if (!normalized) throw new Error('请先输入 API Key');
    await syncKeys();
    const key = db.findAPIKeyByHash(hashAPIKey(normalized));
    if (!key) throw new Error('未找到这个 API Key，请确认后再试');
    if (key.status !== 'active') throw new Error('这个 API Key 当前不可用');
    return key;
  }

  async function loadOwnerKeys(userId) {
    const keys = await client.listUserAPIKeys(Number(userId));
    return keys.map((key) => ({ ...key, userId })).filter((key) => key.status === 'active');
  }

  return {
    async getOverview({ apiKey }) {
      const ownerKey = await findOwner(apiKey);
      const ownerKeys = await loadOwnerKeys(ownerKey.userId);
      const summaryStats = await client.getAdminUsageStats({ user_id: Number(ownerKey.userId), period: 'today', timezone });
      const keyRows = await Promise.all(ownerKeys.map(async (key) => {
        const stats = await client.getAdminUsageStats({ api_key_id: Number(key.id), period: 'today', timezone });
        return {
          id: String(key.id),
          name: key.name || `Key #${key.id}`,
          maskedKey: maskApiKey(key.key),
          status: key.status,
          todayCost: Number(stats.total_actual_cost || 0),
          todayRequests: Number(stats.total_requests || 0),
        };
      }));
      return {
        refreshedAt: now().toISOString(),
        user: { id: String(ownerKey.userId) },
        summary: {
          todayCost: Number(summaryStats.total_actual_cost || 0),
          todayRequests: Number(summaryStats.total_requests || 0),
          activeKeyCount: ownerKeys.length,
          statusName: overviewStatusName(Number(summaryStats.total_actual_cost || 0)),
        },
        keys: keyRows,
      };
    },

    async getRecords({ apiKey, page = 1, pageSize = 20 }) {
      const ownerKey = await findOwner(apiKey);
      const ownerKeys = await loadOwnerKeys(ownerKey.userId);
      const keyById = new Map(ownerKeys.map((key) => [String(key.id), key]));
      const result = await client.listAdminUsage({ user_id: Number(ownerKey.userId), page, page_size: pageSize, sort_by: 'created_at', sort_order: 'desc', timezone });
      return {
        page: Number(result.page || page),
        pageSize: Number(result.page_size || pageSize),
        total: Number(result.total || 0),
        items: (result.items || []).map((item) => {
          const key = keyById.get(String(item.api_key_id));
          return {
            id: String(item.id),
            createdAt: item.created_at,
            keyName: key?.name || `Key #${item.api_key_id}`,
            maskedKey: key?.key ? maskApiKey(key.key) : '',
            model: item.model || '-',
            requestType: item.request_type || '',
            cost: Number(item.actual_cost || 0),
            durationMs: Number(item.duration_ms || 0),
            status: 'success',
          };
        }),
      };
    },
  };
}

export function overviewStatusName(cost) {
  const value = Number(cost || 0);
  return statusRules.reduce((current, rule) => (value >= rule.minCost ? rule.name : current), statusRules[0].name);
}

function hashAPIKey(apiKey) {
  return createHash('sha256').update(String(apiKey || '').trim()).digest('hex');
}
```

修改 `src/rankService.js` 中 `listAllKeys`，让每个 Key 带 `userId`：

```js
async function listAllKeys(client) {
  const users = await client.listUsers();
  const keyGroups = await Promise.all((users.items || []).map(async (user) => {
    const keys = await client.listUserAPIKeys(user.id);
    return keys.map((key) => ({ ...key, userId: user.id }));
  }));
  return keyGroups.flat();
}
```

- [ ] **步骤 4：运行测试验证通过**

运行：

```bash
npm test -- tests/overviewService.test.js tests/rankService.test.js
```

预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add /Users/night/Documents/code/sealos/sub2api-rank/tests/overviewService.test.js /Users/night/Documents/code/sealos/sub2api-rank/src/overviewService.js /Users/night/Documents/code/sealos/sub2api-rank/src/rankService.js
git commit -m "feat(总览): 添加用户总览服务"
```

---

### 任务 4：暴露用户总览 HTTP 接口

**文件：**
- 修改：`/Users/night/Documents/code/sealos/sub2api-rank/tests/server.test.js`
- 修改：`/Users/night/Documents/code/sealos/sub2api-rank/src/server.js`

- [ ] **步骤 1：编写失败的测试**

在 `tests/server.test.js` 的 `createTestApp` 里补充 mock 方法：

```js
getAdminUsageStats: vi.fn(async (params) => {
  if (params.user_id === 10) return { total_actual_cost: 3.82, total_requests: 186 };
  return { total_actual_cost: 2.18, total_requests: 98 };
}),
listAdminUsage: vi.fn(async () => ({ page: 1, page_size: 20, total: 1, items: [{ id: 9001, api_key_id: 1, model: 'gpt-4.1', actual_cost: 0.042, duration_ms: 1300, request_type: 'stream', created_at: '2026-05-31T11:58:00.000Z' }] })),
```

并把 `listUsers` / `listUserAPIKeys` 保持能返回 `userId=10` 的 active key。

新增测试：

```js
it('returns user overview for cached API key owner', async () => {
  const { app } = createTestApp();

  const response = await request(app).post('/api/overview').send({ apiKey: 'sk-alpha-secret-1111' });

  expect(response.status).toBe(200);
  expect(response.body.summary).toMatchObject({ todayCost: 3.82, todayRequests: 186 });
  expect(response.body.keys[0]).toMatchObject({ name: 'Alpha', todayCost: 2.18, todayRequests: 98 });
});

it('returns paginated user overview records', async () => {
  const { app } = createTestApp();

  const response = await request(app).post('/api/overview/records').send({ apiKey: 'sk-alpha-secret-1111', page: 1, pageSize: 20 });

  expect(response.status).toBe(200);
  expect(response.body).toMatchObject({ page: 1, pageSize: 20, total: 1 });
  expect(response.body.items[0]).toMatchObject({ keyName: 'Alpha', model: 'gpt-4.1', cost: 0.042 });
});

it('validates overview API key input', async () => {
  const { app } = createTestApp();

  const response = await request(app).post('/api/overview').send({ apiKey: '' });

  expect(response.status).toBe(400);
  expect(response.body.message).toBe('请先输入 API Key');
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：

```bash
npm test -- tests/server.test.js
```

预期：FAIL，失败原因是 `/api/overview` 返回 404。

- [ ] **步骤 3：编写最少实现代码**

在 `src/server.js` 增加导入：

```js
import { createOverviewService } from './overviewService.js';
```

在 `createApp` 中创建服务：

```js
const overviewService = createOverviewService({ client, db, now });
```

在 `/api/rankings` 后增加：

```js
app.post('/api/overview', async (req, res) => {
  try {
    const apiKey = String(req.body?.apiKey || '').trim();
    res.json(await overviewService.getOverview({ apiKey }));
  } catch (error) {
    res.status(400).json({ message: error.message || '总览暂时无法打开，请稍后再试' });
  }
});

app.post('/api/overview/records', async (req, res) => {
  try {
    const apiKey = String(req.body?.apiKey || '').trim();
    const page = Math.max(1, Number.parseInt(req.body?.page || '1', 10));
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(req.body?.pageSize || '20', 10)));
    res.json(await overviewService.getRecords({ apiKey, page, pageSize }));
  } catch (error) {
    res.status(400).json({ message: error.message || '调用记录暂时无法打开，请稍后再试' });
  }
});
```

- [ ] **步骤 4：运行测试验证通过**

运行：

```bash
npm test -- tests/server.test.js
```

预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add /Users/night/Documents/code/sealos/sub2api-rank/tests/server.test.js /Users/night/Documents/code/sealos/sub2api-rank/src/server.js
git commit -m "feat(总览): 开放用户总览接口"
```

---

### 任务 5：前端总览页面与纯函数

**文件：**
- 创建：`/Users/night/Documents/code/sealos/sub2api-rank/tests/overviewDisplay.test.js`
- 创建：`/Users/night/Documents/code/sealos/sub2api-rank/public/overview.js`
- 创建：`/Users/night/Documents/code/sealos/sub2api-rank/public/overview.html`
- 修改：`/Users/night/Documents/code/sealos/sub2api-rank/public/index.html`

- [ ] **步骤 1：编写失败的测试**

创建 `tests/overviewDisplay.test.js`：

```js
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
```

- [ ] **步骤 2：运行测试验证失败**

运行：

```bash
npm test -- tests/overviewDisplay.test.js
```

预期：FAIL，失败原因是 `public/overview.js` 不存在。

- [ ] **步骤 3：编写最少实现代码**

创建 `public/overview.js`，先导出纯函数，再在浏览器环境执行 DOM 逻辑：

```js
export const storageKey = 'sub2api_rank_user_key';
const hasDocument = typeof document !== 'undefined';
let currentPage = 1;
let pageSize = 20;

export function formatMoney(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

export function formatDuration(value) {
  const ms = Number(value || 0);
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms}ms`;
}

export function normalizePage(value) {
  const page = Number.parseInt(value || '1', 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function formatTime(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('zh-CN', { hour12: false });
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || '总览暂时无法打开，请稍后再试');
  return payload;
}

async function loadOverview() {
  const apiKeyInput = document.querySelector('#overviewApiKey');
  const apiKey = String(apiKeyInput.value || '').trim();
  if (!apiKey) {
    document.querySelector('#overviewError').textContent = '请先输入 API Key';
    return;
  }
  localStorage.setItem(storageKey, apiKey);
  document.querySelector('#overviewError').textContent = '';
  document.querySelector('#overviewLoadButton').disabled = true;
  try {
    const overview = await postJson('/api/overview', { apiKey });
    renderOverview(overview);
    currentPage = 1;
    await loadRecords();
  } catch (error) {
    document.querySelector('#overviewError').textContent = error.message;
  } finally {
    document.querySelector('#overviewLoadButton').disabled = false;
  }
}

async function loadRecords() {
  const apiKey = String(document.querySelector('#overviewApiKey').value || '').trim();
  const records = await postJson('/api/overview/records', { apiKey, page: currentPage, pageSize });
  renderRecords(records);
}

function renderOverview(payload) {
  document.querySelector('#overviewEntry').classList.add('hidden');
  document.querySelector('#overviewContent').classList.remove('hidden');
  document.querySelector('#overviewRefreshTime').textContent = payload.refreshedAt ? `上次刷新 ${formatTime(payload.refreshedAt)}` : '';
  document.querySelector('#todayCost').textContent = formatMoney(payload.summary?.todayCost);
  document.querySelector('#todayRequests').textContent = String(payload.summary?.todayRequests || 0);
  document.querySelector('#activeKeyCount').textContent = String(payload.summary?.activeKeyCount || 0);
  document.querySelector('#todayStatus').textContent = payload.summary?.statusName || '-';
  document.querySelector('#overviewKeys').innerHTML = (payload.keys || []).map((key) => `
    <div class="overview-key-row">
      <span><b>${escapeHtml(key.name)}</b><small>${escapeHtml(key.maskedKey)}</small></span>
      <span>${key.status === 'active' ? '启用中' : '不可用'}</span>
      <b>${formatMoney(key.todayCost)}</b>
      <span>${Number(key.todayRequests || 0)} 次</span>
    </div>
  `).join('');
}

function renderRecords(payload) {
  const items = payload.items || [];
  document.querySelector('#overviewRecords').innerHTML = items.length ? items.map((item) => `
    <div class="overview-record-row">
      <span>${escapeHtml(formatTime(item.createdAt))}</span>
      <span>${escapeHtml(item.keyName)}</span>
      <span>${escapeHtml(item.model)}</span>
      <b>${formatMoney(item.cost)}</b>
      <span>${formatDuration(item.durationMs)}</span>
    </div>
  `).join('') : '<div class="overview-empty">暂无调用记录</div>';
  const totalPages = Math.max(1, Math.ceil(Number(payload.total || 0) / Number(payload.pageSize || pageSize)));
  document.querySelector('#overviewPageInfo').textContent = `${payload.page} / ${totalPages}`;
  document.querySelector('#prevRecords').disabled = payload.page <= 1;
  document.querySelector('#nextRecords').disabled = payload.page >= totalPages;
}

if (hasDocument) {
  const input = document.querySelector('#overviewApiKey');
  input.value = String(localStorage.getItem(storageKey) || '').trim();
  document.querySelector('#overviewLoadButton').addEventListener('click', () => loadOverview());
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') loadOverview();
  });
  document.querySelector('#prevRecords').addEventListener('click', async () => {
    currentPage = Math.max(1, currentPage - 1);
    await loadRecords();
  });
  document.querySelector('#nextRecords').addEventListener('click', async () => {
    currentPage += 1;
    await loadRecords();
  });
  if (input.value) loadOverview();
}
```

创建 `public/overview.html`，包含以下核心结构：

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>我的修行总览</title>
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <main class="shell overview-shell">
    <nav class="top-nav">
      <a href="/">排行榜</a>
      <a class="active" href="/overview.html">我的总览</a>
    </nav>
    <section id="overviewEntry" class="hero-card">
      <p class="eyebrow">Sealos API</p>
      <h1>我的修行总览</h1>
      <p class="subtitle">查看今日用量和最近调用记录。</p>
      <div class="entry-row">
        <input id="overviewApiKey" class="key-input" type="password" placeholder="输入 API Key">
        <button id="overviewLoadButton" class="primary-button">查看总览</button>
      </div>
      <p id="overviewError" class="error-text"></p>
    </section>
    <section id="overviewContent" class="hidden">
      <div class="page-heading"><h1>我的修行总览</h1><span id="overviewRefreshTime"></span></div>
      <div class="overview-cards">
        <article><small>今日消耗</small><b id="todayCost">$0.00</b></article>
        <article><small>请求次数</small><b id="todayRequests">0</b></article>
        <article><small>当前 Key</small><b id="activeKeyCount">1</b></article>
        <article><small>今日状态</small><b id="todayStatus">-</b></article>
      </div>
      <section class="panel"><h2>当前密钥</h2><div id="overviewKeys" class="overview-key-list"></div></section>
      <section class="panel"><h2>调用记录</h2><div class="overview-record-head"><span>时间</span><span>密钥</span><span>模型</span><span>消耗</span><span>耗时</span></div><div id="overviewRecords"></div><div class="pager"><button id="prevRecords">上一页</button><span id="overviewPageInfo">1 / 1</span><button id="nextRecords">下一页</button></div></section>
    </section>
  </main>
  <script type="module" src="/overview.js"></script>
</body>
</html>
```

在 `public/index.html` 的顶部导航位置增加到 `/overview.html` 的链接。如果当前没有独立 nav，则在标题附近增加一个不破坏布局的链接：

```html
<a class="nav-link" href="/overview.html">我的总览</a>
```

- [ ] **步骤 4：运行测试验证通过**

运行：

```bash
npm test -- tests/overviewDisplay.test.js
```

预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add /Users/night/Documents/code/sealos/sub2api-rank/tests/overviewDisplay.test.js /Users/night/Documents/code/sealos/sub2api-rank/public/overview.js /Users/night/Documents/code/sealos/sub2api-rank/public/overview.html /Users/night/Documents/code/sealos/sub2api-rank/public/index.html
git commit -m "feat(总览): 添加用户总览页面"
```

---

### 任务 6：总览页面视觉样式

**文件：**
- 修改：`/Users/night/Documents/code/sealos/sub2api-rank/public/styles.css`

- [ ] **步骤 1：编写失败的样式检查**

运行以下命令，确认样式类还不存在：

```bash
grep -n "overview-cards" /Users/night/Documents/code/sealos/sub2api-rank/public/styles.css
```

预期：命令没有输出，退出码为 1。

- [ ] **步骤 2：编写最少样式代码**

在 `public/styles.css` 末尾追加：

```css
.top-nav {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-bottom: 18px;
}

.top-nav a,
.nav-link {
  color: var(--muted-gold, #d6b985);
  text-decoration: none;
  border: 1px solid rgba(214, 185, 133, 0.28);
  border-radius: 999px;
  padding: 8px 14px;
  background: rgba(24, 16, 9, 0.42);
}

.top-nav a.active,
.nav-link:hover {
  color: #fff2c7;
  border-color: rgba(246, 208, 122, 0.7);
  box-shadow: 0 0 24px rgba(246, 208, 122, 0.16);
}

.overview-shell {
  max-width: 1180px;
}

.page-heading {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: end;
  margin-bottom: 22px;
}

.page-heading span {
  color: var(--muted-gold, #d6b985);
}

.overview-cards {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
  margin-bottom: 18px;
}

.overview-cards article,
.panel {
  border: 1px solid rgba(214, 185, 133, 0.25);
  border-radius: 22px;
  background: linear-gradient(145deg, rgba(45, 27, 13, 0.82), rgba(16, 11, 8, 0.74));
  box-shadow: 0 22px 60px rgba(0, 0, 0, 0.28);
}

.overview-cards article {
  padding: 18px;
}

.overview-cards small {
  display: block;
  color: var(--muted-gold, #d6b985);
  margin-bottom: 8px;
}

.overview-cards b {
  color: #fff2c7;
  font-size: 28px;
}

.panel {
  padding: 20px;
  margin-top: 18px;
}

.overview-key-row,
.overview-record-head,
.overview-record-row {
  display: grid;
  grid-template-columns: 1.4fr 0.8fr 0.8fr 0.7fr;
  gap: 12px;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid rgba(214, 185, 133, 0.14);
}

.overview-record-head,
.overview-record-row {
  grid-template-columns: 1.2fr 1fr 1fr 0.7fr 0.6fr;
}

.overview-key-row small {
  display: block;
  margin-top: 4px;
  color: rgba(246, 222, 176, 0.62);
}

.overview-record-head {
  color: var(--muted-gold, #d6b985);
  font-size: 13px;
}

.overview-empty {
  color: var(--muted-gold, #d6b985);
  padding: 24px 0;
  text-align: center;
}

.pager {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
}

.pager button {
  border: 1px solid rgba(214, 185, 133, 0.32);
  border-radius: 999px;
  background: rgba(255, 242, 199, 0.08);
  color: #fff2c7;
  padding: 8px 14px;
}

.pager button:disabled {
  opacity: 0.45;
}

@media (max-width: 820px) {
  .overview-cards {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .overview-key-row,
  .overview-record-head,
  .overview-record-row {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **步骤 3：运行样式检查验证通过**

运行：

```bash
grep -n "overview-cards" /Users/night/Documents/code/sealos/sub2api-rank/public/styles.css
```

预期：输出包含 `.overview-cards`。

- [ ] **步骤 4：运行相关测试**

运行：

```bash
npm test -- tests/overviewDisplay.test.js
```

预期：PASS。

- [ ] **步骤 5：Commit**

```bash
git add /Users/night/Documents/code/sealos/sub2api-rank/public/styles.css
git commit -m "style(总览): 优化用户总览视觉"
```

---

### 任务 7：全量验证与浏览器验收

**文件：**
- 不要求固定修改文件；如果发现问题，只修改引入问题的最小文件。

- [ ] **步骤 1：运行全量测试**

运行：

```bash
npm test
```

预期：全部 PASS。

- [ ] **步骤 2：启动本地服务**

运行：

```bash
PORT=3099 npm run dev
```

预期：输出 `Sub2API Rank listening on http://localhost:3099`。

- [ ] **步骤 3：浏览器打开页面**

打开：

```text
http://localhost:3099/overview.html
```

预期：

- 如果 `localStorage.sub2api_rank_user_key` 存在，页面自动加载。
- 如果不存在，页面显示 API Key 输入区。
- 页面有「排行榜」和「我的总览」导航。

- [ ] **步骤 4：手动验证用户视角文案**

检查页面上不出现以下词：

```text
admin
管理员
内部映射
服务端缓存
接口调试信息
token
tokens
```

预期：页面不出现这些词。

- [ ] **步骤 5：手动验证功能**

输入一个有效 API Key。

预期：

- 今日消耗、请求次数、当前 Key、今日状态有值。
- 当前密钥区域展示 Key 名、脱敏 Key、状态、今日消耗、请求次数。
- 调用记录展示时间、密钥、模型、消耗、耗时。
- 点击「下一页」只刷新记录列表，不重载整个页面。
- 刷新页面后不需要重新输入 API Key。

- [ ] **步骤 6：Commit 修正**

如果步骤 1-5 发现问题，按 TDD 增加或调整对应测试，再做最小修复并提交：

```bash
git add <changed-files>
git commit -m "fix(总览): 修正用户总览验收问题"
```

如果没有发现问题，不创建空提交。

---

## 自检记录

- 规格覆盖度：已覆盖页面入口、缓存复用、今日用量、密钥概览、调用记录分页、不展示 token、用户文案、后端数据流、测试和验收。
- 占位符扫描：计划不包含未完成标记或空泛步骤。
- 类型一致性：计划统一使用 `userId`、`todayCost`、`todayRequests`、`pageSize`、`listAdminUsage`、`getAdminUsageStats`。
- 范围控制：不实现管理员页面、不实现导出、筛选、图表或实时推送。
