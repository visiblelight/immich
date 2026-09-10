# Gallery 本地开发：阶段 A

状态：工程初始化说明。2026-09-10。

## 当前能力边界

已经创建五个 workspace 包。core/db/ui 是由消费端构建器编译的 TypeScript/Svelte 源码包，build 脚本对它们执行类型／组件检查；public/admin 使用 adapter-node 输出真正独立的 Node 服务构建产物。

本阶段没有用户登录、相册业务、数据库迁移或公开图库。根页面返回 503 是有意的未开放状态，不是已交付的视觉方案。不会展示该占位页作为产品预览。

## 工具链

- Node：24.15.0，与根 mise.toml 一致。
- pnpm：11.22.0，与根 packageManager 一致。
- TypeScript 使用与 Immich Web 相同的 `@typescript/typescript6` 6.0.2 别名包；这个包的命令名是 `tsc6`，不要假定安装后会提供 `tsc`。
- 新机器优先使用已有 mise 安装这两个工具，不需要为 Gallery 安装整个 Immich 的 Java/FFmpeg/移动端工具链。
- 此机器默认 Node 为 22；本轮在 `.gallery-local/toolchain/` 安装了经官方 SHA-256 校验的 Node 24，Corepack/pnpm、缓存均在 `.gallery-local/`，不修改全局默认 Node。
- `.gallery-local/` 不进入 Git。便捷包装命令会在该本地工具链存在时使用它，否则使用机器上的 pnpm。它不是自动安装器。

所有命令在仓库根目录执行：

```sh
# 已有正确 Node/pnpm 的常规环境：
pnpm --filter '@gallery/*' install --frozen-lockfile --ignore-scripts
pnpm gallery:doctor
pnpm gallery:check
pnpm gallery:test
pnpm gallery:build
pnpm gallery:smoke
```

此机器可以用下列命令自动选择隔离工具链：

```sh
sh deployment/gallery/scripts/pnpm.sh gallery:doctor
sh deployment/gallery/scripts/pnpm.sh gallery:check
sh deployment/gallery/scripts/pnpm.sh gallery:test
sh deployment/gallery/scripts/pnpm.sh gallery:build
sh deployment/gallery/scripts/pnpm.sh gallery:smoke
```

首次安装针对 Gallery 的五个包，跳过生命周期脚本；SvelteKit sync 在 check 中显式执行。pnpm 会维护根共享锁文件，并可能检查全工作区锁定依赖的供应链策略，但不会因此启动 Immich 或 CVAT 服务。不要关闭仓库既有依赖审核策略来加速安装。

## 开发服务

```sh
sh deployment/gallery/scripts/pnpm.sh gallery:dev:public
# 另一个终端：
sh deployment/gallery/scripts/pnpm.sh gallery:dev:admin
```

默认只监听 127.0.0.1，public 为 3100，admin 为 3101；端口被占用会报错，不悄悄改到别的端口。

| 接口 | 阶段 A 预期 |
|---|---|
| GET /health/live | 200，service/version/status；只说明 Node 进程可响应 |
| GET /health/ready | 503，foundation-only；应用尚未接入数据库与登录授权 |
| GET / | 503，站点未开放 |

gallery:smoke 会用系统分配的临时端口启动两个生产构建，验证以上行为并自动停止，仅依赖本地回环网络，不需要数据库。完整视觉方向仍按已确认流程另行提交。

## 数据库模块

只能从 `@gallery/db/server` 引入连接工厂；不能在组件和通用 load 文件里使用。工厂要求显式连接串及 public/admin 服务类型，没有默认连接串，不会读取 Immich 的环境变量或在模块导入时连接数据库。

运行配置要求 public 使用 gallery_public、admin 使用 gallery_admin，拒绝通过 URL 查询参数覆盖角色。阶段 B 已在隔离 PG14 中验证实际 GRANT、受控视图和资源适配；操作见[数据库开发说明](database.md)。后续接入应用时必须运行角色／权限／结构兼容检查，不能只检查角色名。远程 TLS 尚未验收，随部署环境配置验证，不自行拼接 URL 参数绕过限制。

`deployment/gallery/.env.example` 与两个服务的 `.env.example` 只提供明确配置位置，不包含真实凭据。阶段 A 不自动加载它们，不打开任何现有数据库。

## CI 与目录

`.github/workflows/gallery.yml` 在 Gallery 分支／PR 上执行固定工具链、过滤安装、检查、测试、构建及 HTTP 冒烟，不依赖 Immich 官方专用密钥。不改变上游已有 workflow；未来向 fork 推送 PR 时，上游 workflow 可能仍被 GitHub 同时触发，需要按运行结果独立处理。

源码包版本统一为 0.1.0-dev.0。当前来源、上游观察值和未验证升级候选保存在 `deployment/gallery/baseline.json`。源提交、构建产物、数据库迁移状态分开记录。
