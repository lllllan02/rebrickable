# 默认：拉取远程 → 安装依赖 → 解压本地库 → 启动 Next 开发服务
.PHONY: default pull install db dev start pack

PNPM ?= pnpm

default: dev

pull:
	git pull

install:
	$(PNPM) install

db:
	$(PNPM) exec tsx scripts/ensure-local-db.ts

# 单条顺序链，避免 `make -j` 时 pull 与 install 并行竞态
dev:
	git pull --ff-only
	$(PNPM) install
	$(PNPM) exec tsx scripts/ensure-local-db.ts
	$(PNPM) dev

start: dev

# 压缩 db → 若有变更则自动提交（带时间戳）→ push
pack:
	$(PNPM) db:pack
	git add .
	git diff --cached --quiet || git commit -m "chore(db): $$(date +%Y-%m-%dT%H%M%S)"
	git push
