# Sealos API Rank

独立的 Sub2API API Key 修炼榜应用。后台定时用 Admin Key 刷新日榜/月榜并写入 SQLite；用户输入自己的启用中 API Key 后，只读取本地快照查看全站排行榜。

## 环境变量

复制 `.env.example` 并配置：

- `SUB2API_BASE_URL`：Sub2API 服务地址，可填站点根地址或 `/api/v1` 地址。
- `ADMIN_KEY`：Sub2API Admin API Key，只在服务端使用。
- `ADMIN_PASSWORD`：排行榜应用管理员密码。
- `PORT`：服务端口，默认 `3000`，示例配置使用 `3099`。
- `DATABASE_PATH`：SQLite 路径，默认 `data/rank.sqlite`。
- `TZ`：服务端时区，建议 `Asia/Shanghai`，用于日榜和月榜日期边界。

## 开发

```bash
npm install
npm run dev
```

用户页：`http://localhost:3099/`

管理员页：`http://localhost:3099/admin.html`

## 数据刷新

- 服务启动后会立即刷新 `daily` 和 `monthly` 两份榜单。
- 后台每 5 分钟重新刷新一次榜单并替换 SQLite 快照。
- 用户页每 30 秒静默读取本应用 API，不会触发 Sub2API 远程刷新。
- 管理员页的 Key 列表来自 SQLite 中最近一次刷新缓存。
- 如果刚启动时还没有快照，先等待首次刷新完成后再查看。

## 测试

```bash
npm test
```

## 安全说明

`ADMIN_KEY` 不会下发到浏览器。用户输入的 API Key 只保存在浏览器 `localStorage`；服务端只保存 API Key 的 SHA-256 哈希、脱敏展示值和榜单快照。
