# 默认：拉取远程 → 安装依赖 → 解压本地库 → 启动 Next 开发服务
.PHONY: default pull install db dev start pack pack-all

PNPM ?= pnpm

default: dev

pull:
	git pull

install:
	$(PNPM) install

# 从 assets/*.csv.gz 全量重建目录库（不覆盖 data/rebrickable-user.db）；请先停 dev 并更新 assets
db:
	$(PNPM) db:import

# 单条顺序链，避免 `make -j` 时 pull 与 install 并行竞态
dev:
	git pull --ff-only
	$(PNPM) install
	$(PNPM) exec tsx scripts/ensure-local-db.ts
	$(PNPM) dev

start: dev

# 压缩用户库与上传 → 若有变更则提交（带时间戳）→ push（不含目录库）
pack:
	$(PNPM) db:pack
	git add data/rebrickable-user.db.gz data/build-uploads/
	git diff --cached --quiet || git commit -m "chore(db): $$(date +%Y-%m-%dT%H%M%S)"
	git push

# 目录库 + 用户库 + 上传一并打包提交；请先停 dev，目录库需已存在（如 make db 后）
pack-all:
	$(PNPM) db:pack-catalog
	$(PNPM) db:pack
	git add data/rebrickable.db.gz data/rebrickable-user.db.gz data/build-uploads/
	git diff --cached --quiet || git commit -m "chore(db): $$(date +%Y-%m-%dT%H%M%S)"
	git push
