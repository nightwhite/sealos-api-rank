import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { createDatabase } from '../src/db.js';

let tempDir;

afterEach(() => {
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  tempDir = undefined;
});

function tempDbPath() {
  tempDir = mkdtempSync(join(tmpdir(), 'sub2api-rank-'));
  return join(tempDir, 'rank.sqlite');
}

describe('createDatabase', () => {
  it('creates default rank rules on first boot', () => {
    const db = createDatabase(tempDbPath());
    const dailyRules = db.listRankRules('daily');
    const monthlyRules = db.listRankRules('monthly');

    expect(dailyRules.map((rule) => rule.name)).toEqual([
      '静心观榜',
      '初试锋芒',
      '灵气充盈',
      '剑气纵横',
      '一日千里',
      '破晓登峰',
    ]);
    expect(dailyRules[0].minCost).toBe(0);
    expect(monthlyRules.map((rule) => rule.name)).toEqual([
      '凡人试炼',
      '炼气入门',
      '筑基敲码',
      '金丹调参',
      '元婴上线',
      '化神爆肝',
      '渡劫重构',
      '大乘飞升',
    ]);
    expect(monthlyRules[0].minCost).toBe(0);
    db.close();
  });

  it('saves visible keys and replaces rank rules', () => {
    const db = createDatabase(tempDbPath());

    db.replaceVisibleKeys(['key-2', 'key-1', 'key-1']);
    expect(db.listVisibleKeyIds()).toEqual(['key-1', 'key-2']);

    db.replaceRankRules('daily', [
      { minCost: 0, name: '入门', color: '#ffffff' },
      { minCost: 100, name: '飞升', color: '#fbbf24' },
    ]);
    expect(db.listRankRules('daily')).toEqual([
      expect.objectContaining({ minCost: 0, name: '入门', color: '#ffffff' }),
      expect.objectContaining({ minCost: 100, name: '飞升', color: '#fbbf24' }),
    ]);
    expect(db.listRankRules('monthly').map((rule) => rule.name)).toEqual([
      '凡人试炼',
      '炼气入门',
      '筑基敲码',
      '金丹调参',
      '元婴上线',
      '化神爆肝',
      '渡劫重构',
      '大乘飞升',
    ]);
    db.close();
  });

  it('stores api key cache and finds keys by hash', () => {
    const db = createDatabase(tempDbPath());

    db.replaceAPIKeys([
      { id: 1, userId: 10, keyHash: 'hash-alpha', name: 'Alpha', maskedKey: 'sk-alpha••••1111', status: 'active', quota: 0, quotaUsed: 0, rateLimit1d: 900, usage1d: 470.72 },
      { id: 2, userId: 20, keyHash: 'hash-beta', name: 'Beta', maskedKey: 'sk-beta••••2222', status: 'disabled', quota: 0, quotaUsed: 0, rateLimit1d: 0, usage1d: 0 },
    ]);

    expect(db.findAPIKeyByHash('hash-alpha')).toMatchObject({
      id: '1',
      userId: '10',
      keyHash: 'hash-alpha',
      name: 'Alpha',
      maskedKey: 'sk-alpha••••1111',
      status: 'active',
      quota: 0,
      quotaUsed: 0,
      rateLimit1d: 900,
      usage1d: 470.72,
    });
    expect(db.listAPIKeys()).toEqual([
      expect.objectContaining({ id: '1', userId: '10', name: 'Alpha', status: 'active', rateLimit1d: 900, usage1d: 470.72 }),
      expect.objectContaining({ id: '2', userId: '20', name: 'Beta', status: 'disabled', rateLimit1d: 0, usage1d: 0 }),
    ]);
    db.close();
  });


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
      { id: 1, userId: 10, keyHash: 'hash-alpha', name: 'Alpha', maskedKey: 'sk-alpha••••1111', status: 'active', quota: 300, quotaUsed: 42, rateLimit1d: 900, usage1d: 470.72 },
    ]);
    expect(db.findAPIKeyByHash('hash-alpha')).toMatchObject({ userId: '10', quota: 300, quotaUsed: 42, rateLimit1d: 900, usage1d: 470.72 });
    db.close();
  });

  it('replaces and reads ranking snapshots per period', () => {
    const db = createDatabase(tempDbPath());

    db.replaceRankSnapshot('daily', {
      refreshedAt: '2026-05-30T00:00:00.000Z',
      rows: [
        {
          rank: 1,
          keyId: '1',
          keyName: 'Alpha',
          maskedKey: 'sk-alpha••••1111',
          actualCost: 12.34,
          realmCost: 12.34,
          requests: 12,
          tokens: 1234,
          rankName: '炼气入门',
          rankColor: '#22d3ee',
          nextRankName: '筑基敲码',
          costToNextRank: 37.66,
          progress: 0.25,
          visible: true,
        },
        {
          rank: null,
          keyId: '2',
          keyName: 'Hidden',
          maskedKey: 'sk-hidden••••2222',
          actualCost: 99,
          realmCost: 99,
          requests: 99,
          tokens: 999,
          rankName: '筑基敲码',
          rankColor: '#34d399',
          nextRankName: null,
          costToNextRank: null,
          progress: 1,
          visible: false,
        },
      ],
    });

    expect(db.getRankSnapshot('daily')).toEqual({
      period: 'daily',
      refreshedAt: '2026-05-30T00:00:00.000Z',
      rows: [
        expect.objectContaining({ keyId: '1', rank: 1, visible: true, actualCost: 12.34, requests: 12, tokens: 1234 }),
        expect.objectContaining({ keyId: '2', rank: null, visible: false, actualCost: 99, requests: 99, tokens: 999 }),
      ],
    });
    expect(db.getRankSnapshot('monthly')).toEqual({ period: 'monthly', refreshedAt: null, rows: [] });
    db.close();
  });

  it('migrates old default daily realm rules to daily merit rules', () => {
    const databasePath = tempDbPath();
    const sqlite = new Database(databasePath);
    sqlite.exec(`
      CREATE TABLE rank_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        period TEXT NOT NULL DEFAULT 'daily',
        min_cost REAL NOT NULL,
        name TEXT NOT NULL,
        color TEXT NOT NULL,
        sort_order INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    const insert = sqlite.prepare('INSERT INTO rank_rules (period, min_cost, name, color, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
    ['凡人试炼', '炼气入门', '筑基敲码', '金丹调参', '元婴上线', '化神爆肝', '渡劫重构', '大乘飞升']
      .forEach((name, index) => insert.run('daily', index * 10, name, '#94a3b8', index, '2026-05-30T00:00:00.000Z', '2026-05-30T00:00:00.000Z'));
    sqlite.close();

    const db = createDatabase(databasePath);

    expect(db.listRankRules('daily').map((rule) => rule.name)).toEqual([
      '静心观榜',
      '初试锋芒',
      '灵气充盈',
      '剑气纵横',
      '一日千里',
      '破晓登峰',
    ]);
    db.close();
  });
});
