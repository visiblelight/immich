# Gallery 本地开发

状态：本地功能 MVP。2026-09-11。实际登录和操作优先阅读 [MVP 本地使用](mvp-local.md)。

## 当前能力边界

已经创建五个 workspace 包。core/db/ui 是由消费端构建器编译的 TypeScript/Svelte 源码包，build 脚本对它们执行类型／组件检查；public/admin 使用 adapter-node 输出真正独立的 Node 服务构建产物。

应用已接入独立登录、相册编辑发布与真实公开图库。配置缺失时仍返回 503；配置完整且数据库兼容时根路径跳转到相册页，后台先要求登录。`/design` 保留示例预览，与真实数据隔离。

## 工具链

宿主机安装／更新依赖前，先阅读 [Immich 开发依赖挂载注意事项](immich-dependency-mounts.md)。本机曾出现宿主机重建 node_modules 后，运行中的 Immich 容器读到 macOS 依赖而退出的情况；安装前停止相应开发容器，安装后重新启动并检查实际 API 响应。

- Node：24.15.0，与根 mise.toml 一致。
- pnpm：11.22.0，与根 packageManager 一致。
- TypeScript 使用与 Immich Web 相同的 `@typescript/typescript6` 6.0.2 别名包；这个包的命令名是 `tsc6`，不要假定安装后会提供 `tsc`。
- 新机器优先使用已有 mise 安装这两个工具，不需要为 Gallery 安装整个 Immich 的 Java/FFmpeg/移动端工具链。
- 此机器默认 Node 为 22；本轮在 `.gallery-local/toolchain/` 安装了经官方 SHA-256 校验的 Node 24，Corepack/pnpm、缓存均在 `.gallery-local/`，不修改全局默认 Node。
- `.gallery-local/` 不进入 Git。便捷包装命令会在该本地工具链存在时使用它，否则使用机器上的 pnpm。它不是自动安装器。

所有命令在仓库根目录执行：

```sh
# 已有正确 Node/pnpm 的常规环境：
sh deployment/gallery/scripts/pnpm.sh install --frozen-lockfile --ignore-scripts
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

安装范围为 Gallery 五个包和根脚本包，包装器也让嵌套 pnpm 校验使用同一过滤范围与 store。首次安装，跳过生命周期脚本；SvelteKit sync 在 check 中显式执行。pnpm 会维护根共享锁文件，并可能检查全工作区锁定依赖的供应链策略，但不会因此启动 Immich 或 CVAT 服务。不要关闭仓库既有依赖审核策略来加速安装。

## 开发服务

```sh
sh deployment/gallery/scripts/pnpm.sh gallery:dev:public
# 另一个终端：
sh deployment/gallery/scripts/pnpm.sh gallery:dev:admin
```

默认只监听 127.0.0.1，public 为 3100，admin 为 3101；端口被占用会报错，不悄悄改到别的端口。

| 接口 | 未配置环境的冒烟预期 |
|---|---|
| GET /health/live | 200，service/version/status；只说明 Node 进程可响应 |
| GET /health/ready | 503，foundation-only；当前进程缺少显式运行配置 |
| GET / | 503，站点未开放 |

gallery:smoke 会用系统分配的临时端口启动两个生产构建，验证以上行为并自动停止，仅依赖本地回环网络，不需要数据库。设计预览额外验证开关和响应头，见下文。

## 数据库模块

只能从 `@gallery/db/server` 引入连接工厂；不能在组件和通用 load 文件里使用。工厂要求显式连接串及 public/admin 服务类型，没有默认连接串，不会读取 Immich 的环境变量或在模块导入时连接数据库。

运行配置要求 public 使用 gallery_public、admin 使用 gallery_admin，拒绝通过 URL 查询参数覆盖角色。阶段 B 已在隔离 PG14 中验证实际 GRANT、受控视图和资源适配；操作见[数据库开发说明](database.md)。应用现已在 readiness 和真实请求入口执行角色／权限／结构兼容检查，每个进程缓存成功结果最多 15 秒。远程 TLS 尚未验收，随部署环境配置验证，不自行拼接 URL 参数绕过限制。

`deployment/gallery/.env.example` 与两个服务的 `.env.example` 不包含真实凭据。此机器的实际配置在忽略目录 `.gallery-local/runtime/`；`gallery:local:*` 显式加载相应 env 文件。上面的 dev 命令不自动读取该目录，真实数据热更新调试须用 Node `--env-file` 启动 Vite，见 MVP 使用说明。

## CI 与目录

`.github/workflows/gallery.yml` 在 Gallery 分支／PR 上执行固定工具链、过滤安装、检查、测试、构建及 HTTP 冒烟，不依赖 Immich 官方专用密钥。不改变上游已有 workflow；未来向 fork 推送 PR 时，上游 workflow 可能仍被 GitHub 同时触发，需要按运行结果独立处理。

源码包版本统一为 0.1.0-dev.0。当前来源、上游观察值和未验证升级候选保存在 `deployment/gallery/baseline.json`。源提交、构建产物、数据库迁移状态分开记录。

## 阶段 C 视觉预览

```sh
sh deployment/gallery/scripts/pnpm.sh gallery:design
```

打开 http://127.0.0.1:3100/design。该脚本显式设置 `GALLERY_DESIGN_PREVIEW=1`；普通 public 开发／运行命令不开启该入口。切换模式需要停止占用 3100 端口的服务后重启。示例内容不连接数据库。设计取舍、八张关键画面和素材许可见[当前相册浏览布局](../design/album-browser.md)。

## 后台工作台交互预览

```sh
sh deployment/gallery/scripts/pnpm.sh gallery:design:admin
```

打开 http://127.0.0.1:3101/design。普通后台开发命令默认不开启设计入口；如已有服务占用 3101，应先停该服务再切换。此模式只使用示例数据，保存和发布只在当前页面内存生效，刷新重置。页面范围与真实业务边界见[后台设计记录](../design/admin-workflow.md)。无需安装新依赖或改动 Immich 容器。
