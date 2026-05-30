import express from 'express';
import cookieParser from 'cookie-parser';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { createDatabase } from './db.js';
import { createSub2APIClient } from './sub2apiClient.js';
import { createRankService } from './rankService.js';
import { createAdminAuth } from './adminAuth.js';
import { createOverviewService } from './overviewService.js';

const currentDir = dirname(fileURLToPath(import.meta.url));
const publicDir = join(currentDir, '..', 'public');

export function createApp({ config, db, client, now = () => new Date() }) {
  const app = express();
  const adminAuth = createAdminAuth({ adminPassword: config.adminPassword, db, now });
  const rankService = createRankService({ client, db, now });
  const overviewService = createOverviewService({ client, db, now });

  app.use(express.json({ limit: '64kb' }));
  app.use(cookieParser());
  app.use(express.static(publicDir));

  app.post('/api/rankings', async (req, res) => {
    try {
      const apiKey = String(req.body?.apiKey || '').trim();
      const period = req.body?.period === 'monthly' ? 'monthly' : 'daily';
      if (!apiKey) {
        res.status(400).json({ message: '请输入 API Key' });
        return;
      }
      res.json(await rankService.getRankings({ apiKey, period }));
    } catch (error) {
      res.status(400).json({ message: error.message || '排行榜暂时无法更新' });
    }
  });


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

  app.post('/api/admin/login', (req, res) => {
    const result = adminAuth.login(String(req.body?.password || ''));
    if (!result.ok) {
      res.status(401).json({ message: '密码不正确' });
      return;
    }
    res.cookie('sub2api_rank_admin', result.token, result.cookieOptions);
    res.json({ ok: true });
  });

  app.use('/api/admin', (req, res, next) => {
    if (!adminAuth.verify(req.cookies.sub2api_rank_admin)) {
      res.status(401).json({ message: '请先登录' });
      return;
    }
    next();
  });

  app.get('/api/admin/keys', async (req, res) => {
    try {
      const visibleSet = new Set(db.listVisibleKeyIds());
      const keys = db.listAPIKeys();
      res.json({
        items: keys.map((key) => ({
          id: String(key.id),
          name: key.name,
          maskedKey: key.maskedKey,
          status: key.status,
          visible: visibleSet.has(String(key.id)),
        })),
      });
    } catch (error) {
      res.status(500).json({ message: error.message || '无法读取 Key 列表' });
    }
  });

  app.put('/api/admin/visible-keys', (req, res) => {
    db.replaceVisibleKeys(Array.isArray(req.body?.keyIds) ? req.body.keyIds.map(String) : []);
    res.json({ ok: true });
  });

  app.get('/api/admin/rank-rules', (req, res) => {
    res.json({ items: db.listRankRules(normalizePeriod(req.query.period)) });
  });

  app.put('/api/admin/rank-rules', (req, res) => {
    const period = normalizePeriod(req.query.period);
    const rules = Array.isArray(req.body?.rules) ? req.body.rules.map(normalizeRule).filter(Boolean) : [];
    db.replaceRankRules(period, rules);
    res.json({ ok: true });
  });

  return app;
}

export function startRankSchedulers({ rankService, intervalMs = 5 * 60 * 1000 }) {
  const timers = [];
  for (const period of ['daily', 'monthly']) {
    const refresh = () => {
      rankService.refreshRankings({ period }).catch((error) => {
        console.warn(`Failed to refresh ${period} rankings: ${error.message}`);
      });
    };
    timers.push(setTimeout(refresh, 0));
    timers.push(setInterval(refresh, intervalMs));
  }
  return {
    stop() {
      timers.forEach((timer) => clearTimeout(timer));
    },
  };
}

function normalizeRule(rule) {
  const name = String(rule.name || '').trim();
  const color = String(rule.color || '').trim();
  const minCost = Number(rule.minCost);
  if (!name || !color || !Number.isFinite(minCost)) return null;
  return { minCost, name, color };
}

function normalizePeriod(period) {
  return period === 'monthly' ? 'monthly' : 'daily';
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const config = loadConfig();
  const db = createDatabase(config.databasePath);
  const client = createSub2APIClient({ baseUrl: config.sub2apiBaseUrl, adminKey: config.adminKey });
  const rankService = createRankService({ client, db });
  const app = createApp({ config, db, client });
  startRankSchedulers({ rankService });
  app.listen(config.port, () => {
    console.log(`Sub2API Rank listening on http://localhost:${config.port}`);
  });
}
