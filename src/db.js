import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';

const defaultDailyRules = [
  { minCost: 0, name: '静心观榜', color: '#8f7d64' },
  { minCost: 5, name: '初试锋芒', color: '#6f8f62' },
  { minCost: 20, name: '灵气充盈', color: '#4f8f6a' },
  { minCost: 60, name: '剑气纵横', color: '#3f7f68' },
  { minCost: 150, name: '一日千里', color: '#b78a3b' },
  { minCost: 300, name: '破晓登峰', color: '#9d4f2f' },
];

const defaultMonthlyRules = [
  { minCost: 0, name: '凡人试炼', color: '#94a3b8' },
  { minCost: 10, name: '炼气入门', color: '#22d3ee' },
  { minCost: 50, name: '筑基敲码', color: '#34d399' },
  { minCost: 120, name: '金丹调参', color: '#facc15' },
  { minCost: 200, name: '元婴上线', color: '#fbbf24' },
  { minCost: 260, name: '化神爆肝', color: '#38bdf8' },
  { minCost: 320, name: '渡劫重构', color: '#c084fc' },
  { minCost: 500, name: '大乘飞升', color: '#fbbf24' },
];

export function createDatabase(databasePath) {
  mkdirSync(dirname(databasePath), { recursive: true });
  const sqlite = new Database(databasePath);
  sqlite.pragma('journal_mode = WAL');
  migrate(sqlite);
  migrateDefaultDailyRules(sqlite);
  seedRankRules(sqlite);

  return {
    listVisibleKeyIds() {
      return sqlite.prepare('SELECT key_id FROM visible_keys ORDER BY key_id ASC').all().map((row) => row.key_id);
    },
    replaceVisibleKeys(keyIds) {
      const now = new Date().toISOString();
      const ids = [...new Set(keyIds.map(String))].sort();
      const replace = sqlite.transaction(() => {
        sqlite.prepare('DELETE FROM visible_keys').run();
        const insert = sqlite.prepare('INSERT INTO visible_keys (key_id, created_at, updated_at) VALUES (?, ?, ?)');
        for (const id of ids) insert.run(id, now, now);
      });
      replace();
    },
    listRankRules() {
      const period = normalizePeriod(arguments[0]);
      return sqlite.prepare('SELECT id, min_cost, name, color FROM rank_rules WHERE period = ? ORDER BY min_cost ASC, id ASC').all(period).map(toRankRule);
    },
    replaceRankRules(periodOrRules, maybeRules) {
      const period = Array.isArray(periodOrRules) ? 'daily' : normalizePeriod(periodOrRules);
      const rules = Array.isArray(periodOrRules) ? periodOrRules : maybeRules;
      const now = new Date().toISOString();
      const replace = sqlite.transaction(() => {
        sqlite.prepare('DELETE FROM rank_rules WHERE period = ?').run(period);
        const insert = sqlite.prepare('INSERT INTO rank_rules (period, min_cost, name, color, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
        rules.forEach((rule, index) => insert.run(period, rule.minCost, rule.name, rule.color, index, now, now));
      });
      replace();
    },
    replaceAPIKeys(keys) {
      const now = new Date().toISOString();
      const replace = sqlite.transaction(() => {
        const upsert = sqlite.prepare(`
          INSERT INTO api_keys (id, user_id, key_hash, name, masked_key, status, quota, quota_used, rate_limit_1d, usage_1d, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            user_id = excluded.user_id,
            key_hash = excluded.key_hash,
            name = excluded.name,
            masked_key = excluded.masked_key,
            status = excluded.status,
            quota = excluded.quota,
            quota_used = excluded.quota_used,
            rate_limit_1d = excluded.rate_limit_1d,
            usage_1d = excluded.usage_1d,
            updated_at = excluded.updated_at
        `);
        for (const key of keys) {
          upsert.run(
            String(key.id),
            String(key.userId || ''),
            key.keyHash,
            key.name,
            key.maskedKey,
            key.status,
            Number(key.quota || 0),
            Number(key.quotaUsed || 0),
            Number(key.rateLimit1d || 0),
            Number(key.usage1d || 0),
            now,
          );
        }
      });
      replace();
    },
    findAPIKeyByHash(keyHash) {
      const row = sqlite.prepare('SELECT id, user_id, key_hash, name, masked_key, status, quota, quota_used, rate_limit_1d, usage_1d, updated_at FROM api_keys WHERE key_hash = ?').get(keyHash);
      return row ? toAPIKey(row) : null;
    },
    listAPIKeys() {
      return sqlite.prepare('SELECT id, user_id, key_hash, name, masked_key, status, quota, quota_used, rate_limit_1d, usage_1d, updated_at FROM api_keys ORDER BY id ASC').all().map(toAPIKey);
    },
    replaceRankSnapshot(period, snapshot) {
      const normalizedPeriod = normalizePeriod(period);
      const refreshedAt = snapshot.refreshedAt;
      const replace = sqlite.transaction(() => {
        sqlite.prepare('DELETE FROM rank_snapshots WHERE period = ?').run(normalizedPeriod);
        const insert = sqlite.prepare(`
          INSERT INTO rank_snapshots (
            period, key_id, rank, key_name, masked_key, actual_cost, realm_cost, requests, tokens,
            rank_name, rank_color, next_rank_name, cost_to_next_rank, progress, visible, refreshed_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const row of snapshot.rows) {
          insert.run(
            normalizedPeriod,
            String(row.keyId),
            row.rank,
            row.keyName,
            row.maskedKey,
            row.actualCost,
            row.realmCost,
            row.requests,
            row.tokens,
            row.rankName,
            row.rankColor,
            row.nextRankName,
            row.costToNextRank,
            row.progress,
            row.visible ? 1 : 0,
            refreshedAt,
          );
        }
        sqlite.prepare(`
          INSERT INTO refresh_runs (period, refreshed_at)
          VALUES (?, ?)
          ON CONFLICT(period) DO UPDATE SET refreshed_at = excluded.refreshed_at
        `).run(normalizedPeriod, refreshedAt);
      });
      replace();
    },
    getRankSnapshot(period) {
      const normalizedPeriod = normalizePeriod(period);
      const run = sqlite.prepare('SELECT refreshed_at FROM refresh_runs WHERE period = ?').get(normalizedPeriod);
      const rows = sqlite.prepare(`
        SELECT
          key_id, rank, key_name, masked_key, actual_cost, realm_cost, requests, tokens,
          rank_name, rank_color, next_rank_name, cost_to_next_rank, progress, visible
        FROM rank_snapshots
        WHERE period = ?
        ORDER BY visible DESC, rank ASC, key_name ASC
      `).all(normalizedPeriod).map(toRankSnapshotRow);
      return { period: normalizedPeriod, refreshedAt: run?.refreshed_at || null, rows };
    },
    createAdminSession(tokenHash, expiresAt) {
      sqlite.prepare('INSERT INTO admin_sessions (token_hash, expires_at, created_at) VALUES (?, ?, ?)').run(tokenHash, expiresAt, new Date().toISOString());
    },
    getAdminSession(tokenHash) {
      return sqlite.prepare('SELECT token_hash, expires_at FROM admin_sessions WHERE token_hash = ?').get(tokenHash);
    },
    deleteExpiredAdminSessions(now = new Date().toISOString()) {
      sqlite.prepare('DELETE FROM admin_sessions WHERE expires_at <= ?').run(now);
    },
    close() {
      sqlite.close();
    },
  };
}

function migrate(sqlite) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS visible_keys (
      key_id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS rank_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      period TEXT NOT NULL DEFAULT 'daily',
      min_cost REAL NOT NULL,
      name TEXT NOT NULL,
      color TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS admin_sessions (
      token_hash TEXT PRIMARY KEY,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT '',
      key_hash TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      masked_key TEXT NOT NULL,
      status TEXT NOT NULL,
      quota REAL NOT NULL DEFAULT 0,
      quota_used REAL NOT NULL DEFAULT 0,
      rate_limit_1d REAL NOT NULL DEFAULT 0,
      usage_1d REAL NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS rank_snapshots (
      period TEXT NOT NULL,
      key_id TEXT NOT NULL,
      rank INTEGER,
      key_name TEXT NOT NULL,
      masked_key TEXT NOT NULL,
      actual_cost REAL NOT NULL,
      realm_cost REAL NOT NULL,
      requests INTEGER NOT NULL DEFAULT 0,
      tokens INTEGER NOT NULL,
      rank_name TEXT NOT NULL,
      rank_color TEXT NOT NULL,
      next_rank_name TEXT,
      cost_to_next_rank REAL,
      progress REAL NOT NULL,
      visible INTEGER NOT NULL,
      refreshed_at TEXT NOT NULL,
      PRIMARY KEY (period, key_id)
    );
    CREATE TABLE IF NOT EXISTS refresh_runs (
      period TEXT PRIMARY KEY,
      refreshed_at TEXT NOT NULL
    );
  `);
  ensureColumn(sqlite, 'rank_rules', 'period', "TEXT NOT NULL DEFAULT 'daily'");
  ensureColumn(sqlite, 'api_keys', 'user_id', "TEXT NOT NULL DEFAULT ''");
  ensureColumn(sqlite, 'api_keys', 'quota', 'REAL NOT NULL DEFAULT 0');
  ensureColumn(sqlite, 'api_keys', 'quota_used', 'REAL NOT NULL DEFAULT 0');
  ensureColumn(sqlite, 'api_keys', 'rate_limit_1d', 'REAL NOT NULL DEFAULT 0');
  ensureColumn(sqlite, 'api_keys', 'usage_1d', 'REAL NOT NULL DEFAULT 0');
  ensureColumn(sqlite, 'rank_snapshots', 'requests', "INTEGER NOT NULL DEFAULT 0");
  sqlite.prepare("UPDATE rank_rules SET period = 'daily' WHERE period IS NULL OR period = ''").run();
}

function seedRankRules(sqlite) {
  const now = new Date().toISOString();
  const insert = sqlite.prepare('INSERT INTO rank_rules (period, min_cost, name, color, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
  for (const [period, rules] of Object.entries({ daily: defaultDailyRules, monthly: defaultMonthlyRules })) {
    const count = sqlite.prepare('SELECT COUNT(*) AS count FROM rank_rules WHERE period = ?').get(period).count;
    if (count > 0) continue;
    rules.forEach((rule, index) => insert.run(period, rule.minCost, rule.name, rule.color, index, now, now));
  }
}

function migrateDefaultDailyRules(sqlite) {
  const existing = sqlite.prepare('SELECT name FROM rank_rules WHERE period = ? ORDER BY min_cost ASC, id ASC').all('daily').map((row) => row.name);
  const oldDefaultNames = defaultMonthlyRules.map((rule) => rule.name);
  if (existing.length !== oldDefaultNames.length) return;
  if (!existing.every((name, index) => name === oldDefaultNames[index])) return;

  const now = new Date().toISOString();
  const replace = sqlite.transaction(() => {
    sqlite.prepare('DELETE FROM rank_rules WHERE period = ?').run('daily');
    const insert = sqlite.prepare('INSERT INTO rank_rules (period, min_cost, name, color, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
    defaultDailyRules.forEach((rule, index) => insert.run('daily', rule.minCost, rule.name, rule.color, index, now, now));
  });
  replace();
}

function toRankRule(row) {
  return {
    id: row.id,
    minCost: row.min_cost,
    name: row.name,
    color: row.color,
  };
}

function ensureColumn(sqlite, tableName, columnName, definition) {
  const columns = sqlite.prepare(`PRAGMA table_info(${tableName})`).all().map((column) => column.name);
  if (!columns.includes(columnName)) sqlite.prepare(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`).run();
}

function normalizePeriod(period) {
  return period === 'monthly' ? 'monthly' : 'daily';
}

function toAPIKey(row) {
  return {
    id: row.id,
    userId: row.user_id,
    keyHash: row.key_hash,
    name: row.name,
    maskedKey: row.masked_key,
    status: row.status,
    quota: row.quota,
    quotaUsed: row.quota_used,
    rateLimit1d: row.rate_limit_1d,
    usage1d: row.usage_1d,
    updatedAt: row.updated_at,
  };
}

function toRankSnapshotRow(row) {
  return {
    keyId: row.key_id,
    rank: row.rank,
    keyName: row.key_name,
    maskedKey: row.masked_key,
    actualCost: row.actual_cost,
    realmCost: row.realm_cost,
    requests: row.requests,
    tokens: row.tokens,
    rankName: row.rank_name,
    rankColor: row.rank_color,
    nextRankName: row.next_rank_name,
    costToNextRank: row.cost_to_next_rank,
    progress: row.progress,
    visible: Boolean(row.visible),
  };
}
