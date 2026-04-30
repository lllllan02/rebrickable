# LEGO 管理网站

一个本地优先的 LEGO 套装与 MOC 管理工具。应用使用 Rebrickable API 下载官方 Set 数据、Set 零件清单，以及 Set 的 Alternate MOC 摘要，并缓存到本地 SQLite。

## Getting Started

安装依赖后，先创建本地数据库表：

```bash
pnpm install
pnpm db:push
```

启动开发服务器：

```bash
pnpm dev
```

打开 [http://localhost:3000](http://localhost:3000)。

## Configuration

Rebrickable API Key 可以在页面里保存，也可以通过环境变量提供：

```bash
REBRICKABLE_API_KEY=your_key pnpm dev
```

默认数据库路径是：

```text
~/.rebrickable-manager/rebrickable.db
```

可以用 `REBRICKABLE_DB_PATH` 覆盖：

```bash
REBRICKABLE_DB_PATH=/path/to/rebrickable.db pnpm dev
```

## Scripts

- `pnpm dev`：启动开发服务器
- `pnpm build`：生产构建
- `pnpm start`：启动生产服务
- `pnpm lint`：运行 ESLint
- `pnpm db:generate`：生成 Drizzle migration
- `pnpm db:push`：把 schema 应用到本地 SQLite
