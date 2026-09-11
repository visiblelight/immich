# 本地 MVP 使用与运行

状态：已在当前本地开发环境接入，2026-09-11。开发数据库继续由 Immich Docker 提供，Gallery 两个服务运行 Node 生产构建。尚不是独立 Compose 发布包。

## 入口与初始账号

- 管理后台：http://localhost:3101/albums（未登录转 /login）。
- 公开相册：http://127.0.0.1:3100/albums；全站相片 /photos；关于页 /about；根路径转相册。
- Immich 开发后台：http://127.0.0.1:3000；API 端口 2283。
- 独立 Gallery 管理员邮箱 `admin@gallery.local`，随机初始密码仅在本机 `.gallery-local/runtime/initial-admin.txt`。文件权限 0600，不提交 Git；登录后可在个人账号里改密。不要复用 Immich 密码。
- `/design` 仍是示例原型，保存和发布只影响页面内存；实际操作必须进入 `/albums`。

后台登录和写入会校验浏览器 Origin 与 `GALLERY_ADMIN_ORIGIN` 完全一致。当前后台入口为 `http://localhost:3101/login`；旧的 `127.0.0.1:3101` 业务页面 GET/HEAD 自动跳转到配置入口，POST 不重定向。原因是实际 Chrome 在 IP 回环地址上发送的 Origin 丢失了端口；使用 localhost 避开该行为，仍保留完整协议、主机与端口校验。前台仍使用 `http://127.0.0.1:3100/albums`。不要关闭来源检查或只比较主机名。

2026-09-11 已在用户 Chrome 中抓取到 `Origin: http://127.0.0.1`、`Referer: http://127.0.0.1:3101/login`、`Sec-Fetch-Site: same-origin`；与[其他项目的一手复现记录](https://github.com/deepseek-ai/deepseek-harness/discussions/910)一致。未修改浏览器扩展或安全设置。修复后在同一个 Chrome 普通窗口验证：旧登录链接刷新跳转 localhost，原账号密码登录成功并进入现有相册工作台；18 项隔离集成测试（含跨来源／跨端口拒绝、POST 不转发）通过。

本地数据库已初始化 Gallery，来源范围只包含本轮明确选择的 Immich 用户。没有自动创建公开相册。浏览器验收用草稿已删除；照片仍由 Immich 管理。

## 日常流程

1. 在 Immich 上传并管理照片、相册、标签、位置。
2. 登录 Gallery，新建顶级相册或子相册。从 Immich 选片，可按相册／标签／文件名／日期过滤，跨筛选和分页保留选择。
3. 相册正文、照片描述使用 Markdown，支持预览、全屏、.md 导入导出。画面描述和位置策略在照片高级设置中。拖动手柄排列照片；多选组成照片组，编辑共用标题、说明、封面及成员顺序。
4. 保存草稿后打开预览。相册中左右切换项目，上下键或缩略图切换组内视角；全站相片按每张展平、跨相册去重，可按拍摄日期或首次加入 Gallery 时间倒序浏览。保存、刷新、服务重启均不丢失已写入数据库的内容；尚未保存的表单内容不保证恢复，页面离开会提醒。
5. 若需要 EXIF，在基本设置勾选展示。GPS 默认隐藏；相册可以选择近似或精确位置，单张照片只能进一步收紧。草稿预览当前不展示坐标，公开版本才按策略展示。
6. 从父级到子级逐册发布。父相册可先无封面发布，再发布子级并给父级设置后代封面。首次发布后访问地址固定。
7. 再编辑时，先保存草稿，前台保持旧版本；再次发布后才更新。下线关闭该相册分支的页面和图片；“恢复公开版本”只恢复原快照，不发布草稿。单独下线的后代保持下线。
8. 从未发布、无子相册的草稿可删除；已发布相册使用下线。操作均不删除 Immich 原片。

## 启动与重启

在仓库根目录，先确保现有 Immich Docker 的数据库和缩略图目录可用。依赖已安装时不需要重装。

```sh
sh deployment/gallery/scripts/pnpm.sh gallery:check
sh deployment/gallery/scripts/pnpm.sh gallery:build
# 两个终端分别运行；如端口已占用，先停对应的旧 Gallery 进程。
sh deployment/gallery/scripts/pnpm.sh gallery:local:public
sh deployment/gallery/scripts/pnpm.sh gallery:local:admin
```

当前生产构建仍依赖 workspace 中的 @gallery/core、@gallery/db 源码包及其服务端依赖，由 Node 24 读取 TypeScript；不要仅复制 build 目录部署。独立镜像会在 Compose 打包阶段处理。

这是前台终端进程，不是登录即自启的系统服务。关闭进程不删除数据。源码更新后重新构建并重启两个服务。开发调试需要热更新时，用 Node 24 的 `--env-file=.gallery-local/runtime/admin.env`（或 public.env）加载配置后启动对应 Vite，并指定 3101/3100 和 strictPort；不要同时运行相同端口的构建服务。

运行配置：`GALLERY_DATABASE_URL`（各自 gallery_admin / gallery_public）、`GALLERY_ADMIN_ORIGIN`、`GALLERY_PUBLIC_ORIGIN`、`GALLERY_MEDIA_SOURCE_ROOT`、`GALLERY_MEDIA_MOUNTED_ROOT`，以及 adapter-node 的 HOST/PORT/ORIGIN。源文件路径必须位于 Immich thumbs 范围，Gallery 只读取衍生图片。`migration.env` 中的迁移凭据不传给运行服务。

本地初始化命令 `gallery:local:init <明确授权的 Immich 所有者 UUID>` 只针对此仓库既有 `immich_postgres` 开发容器，先执行完整 pg_dump，再创建 Gallery 角色、schema、迁移和初始用户。当前机器已经执行，**不要重复初始化**。已有 schema 或运行配置会拒绝覆盖。

.gallery-local/runtime 配置沿用，0004 升级步骤与备份位置见 [交互升级记录](../delivery/interaction-upgrade.md)。后续迁移用 Node 24 加载 `.gallery-local/runtime/migration.env` 运行 `packages/gallery-db/scripts/database.ts migrate`。来源范围同一脚本的 `source-enable` / `source-disable` 仅使用迁移角色；常驻后台不能自行扩大白名单。

## 验证与恢复边界

```sh
sh deployment/gallery/scripts/pnpm.sh gallery:test
sh deployment/gallery/scripts/pnpm.sh gallery:smoke
# 先 build。只接受无业务行的 schema-only dump 与迁移技术元数据。
sh deployment/gallery/scripts/pnpm.sh gallery:test:db /absolute/path/immich-schema.sql /absolute/path/immich-migration-metadata.sql
```

隔离测试自己启动并删除临时 PostgreSQL 容器，合成照片和账号不接触真实图库。完整 HTTP 测试使用实际生产构建，重启前后台后核对草稿、公开版本和会话。

`/health/live` 只证明进程响应；`/health/ready` 返回 200 ready 才说明角色、视图、站点配置通过检查。图片文件能否读取还需通过选片或公开图片验证。故障检查各自 `.gallery-local/runtime/*.log`，不要把 env 文件或原始数据库错误贴到公共日志。

初始化前完整数据库备份在 `.gallery-local/backups/before-gallery-*.dump`；运行配置和初始凭据在 runtime，均只在本机。该备份不是媒体备份，也不能替代完整恢复演练。恢复时先在新隔离库验证，停止应用写入，再制定现有库的切换步骤；本轮没有对现有数据库执行覆盖恢复。

新依赖安装前必须遵守 [Immich 依赖挂载说明](immich-dependency-mounts.md)：先停止绑定宿主机 node_modules 的 Immich server/web/init，安装后启动并以 API ping 检查。pnpm 包装器限定 Gallery 安装和校验范围，不关闭仓库供应链审核规则。
