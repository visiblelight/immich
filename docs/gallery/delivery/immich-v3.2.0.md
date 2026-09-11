# Immich v3.2.0 稳定版集成与恢复验收

2026-09-11。范围：本地开发环境的照片工作流。生产上线、手机自动备份、视频、机器学习、人脸与 OCR 不在本次验收范围内。

## 版本与 Git

- 原源码：`469a870a2233e7361bcb855b183fd41272cfd056`，3.2.0-rc.0。
- 目标：官方 `v3.2.0`，`1b6098c9dbfffe978bec2d414606ed7a4c8e019a`。参见[发布说明](https://github.com/immich-app/immich/releases/tag/v3.2.0)及[官方升级说明](https://docs.immich.app/install/upgrading/)。
- 在 `codex/upgrade-immich-v3.2.0` 独立工作树合并，93 个上游文件无冲突；Gallery 包与现有工作流保护保留。随后由 `codex/gallery` 快进接收；`main` 保持上游镜像用途。
- 不另建仓库、不推送远端。Node 24.15.0 / pnpm 11.22.0 不变，用户原有 `mise.lock` 修改保留。
- 稳定镜像：`ghcr.io/immich-app/immich-server@sha256:ae13784ffcfcce8f4178113eb6661602a1fd1912f3d539880b8ac0dd95fc8ac2`。官方镜像内 Node 版本与项目开发工具链分别记录，不混淆。

## 副本与隔离

短暂停止开发环境的 Immich server 和 Gallery admin，完成同一静止窗口的整库 custom-format dump、角色备份及全部媒体复制后立即恢复服务。记录数据库及每个媒体文件 SHA-256。备份目录 `.gallery-local/upgrade-v3.2.0/before/` 保留，不进入 Git；目录 0700，凭据与数据库文件 0600。角色备份含密码哈希，不得展示或提交。

项目 `gallery-upgrade-320` 使用独立 PG14 tmpfs、Redis、数据库口令与媒体副本。应用仅接内部网络；独立 TCP gateway 只转发固定端口，绑定本机：Immich 40283、Gallery public 4100、admin 4101、PG 45432。测试期间禁用副本机器学习，阻断外连；版本检查网络告警是隔离预期。Gallery 服务只持有受限角色凭据与只读衍生图挂载。

副本管理员密码仅在副本重置，Gallery 会话在副本撤销；不修改原有用户密码。测试上传、创建来源相册、发布与回收照片均只发生在副本。

## 实际结果

- 备份恢复并启动稳定版后，原有 5 个来源资产、1 个 Gallery 相册、1 个发布快照和 2 张发布照片及正文摘要一致。
- 官方稳定版：Immich 登录、上传 2 张 JPEG、生成衍生图、创建两个来源相册成功；实际浏览器 Web 登录和大图加载成功。
- Gallery：独立登录、按来源相册筛选、跨两个来源相册选片、父子相册、独立标题／游记、预览、发布、照片直链通过。
- 修改 Immich GPS 后 Gallery 实时坐标更新，Gallery 文案不变；未发布草稿不影响公开正文。
- 父级下线阻止子级页面与媒体，恢复后重新可用；源照片进入回收站后页面及媒体拒绝访问；公开图片去除 EXIF，退出后旧会话失效。
- 合并后的 Gallery 构建、类型检查（0 错误／0 警告）、5 项单元测试通过；采用稳定基线重新编译后，20 项数据库／HTTP／权限／恢复回归全部通过，原始 Immich 迁移与结构检查 0 漂移。
- 合成 240 张照片用例：发布 636 ms，页面 58 ms，24 并发缩略图冷缓存 115 ms／热缓存 90 ms；这是本机合成用例，不代表真实网络或真机性能。

## 旧版恢复

停止测试应用，将隔离数据库重建为空，再恢复升级前整库、角色及媒体副本，启动旧版服务与 Gallery。校验旧版本 API、两套登录、原有相册／正文摘要／媒体均通过。旧版原始迁移与结构检查无漂移。

官方 RC 镜像标签不可用，因此旧版运行镜像以原开发镜像为基底，复制明确的旧版已编译 server、package.json 和实际使用的 Node 24.15.0；生产依赖取自稳定镜像（服务端依赖版本未变）。这是旧源码运行与数据恢复验证，不声称镜像逐字节相同，也未验证旧 Web 静态包。全程不把工作容器的所有卷挂入测试容器。

中间发现并修复了两项演练配置问题：修改 Compose 后依赖重建会清空 tmpfs；重建的旧程序需要显式 `IMMICH_ENV=production`，否则会尝试生成开发 OpenAPI 文件。最终验证在重新恢复的备份副本上执行。回退须同时恢复程序、数据库和匹配媒体，不能只降低镜像版本。

## 重跑入口与顺序

以下脚本针对本次机器上的受保护备份，要求已有本地状态文件，不是生产一键升级器。必须从产品仓库根目录运行。状态文件 `test.env` 包含 TEST_DB_PASSWORD、TEST_IMMICH_IMAGE、TEST_MEDIA、TEST_PUBLIC_PASSWORD、TEST_ADMIN_PASSWORD 及两个受限角色 DATABASE_URL；`test-auth.json` 为本次副本登录凭据。不得引用工作环境媒体路径。

1. 在隔离工作树合并目标 tag，构建 Gallery 镜像；准备一致整库、角色、媒体备份及摘要。
2. 使用 `deployment/gallery/upgrade/compose.yml`、固定项目名 `gallery-upgrade-320` 和受保护的 `test.env` 启动 gateway、database、redis。数据库重建会清空 tmpfs，绝不能在恢复后无意重建。
3. 恢复角色时排除 postgres 自身 CREATE/ALTER，保留测试数据库口令；用 `pg_restore --exit-on-error` 恢复整库。只向 `test-media` 复制备份媒体。
4. `gallery:upgrade:prepare-copy` 校验测试容器项目标签，重设副本凭据并记录恢复前计数。
5. `docker compose ... up -d --no-deps --force-recreate immich public admin`：只启动测试应用。媒体目录若被替换，必须重新创建应用容器；不要只 restart 旧挂载。
6. 待三个应用就绪，运行 `gallery:upgrade:verify`，再人工验证官方 Web 登录与大图。结果写入本机 `flow-result.json`。
7. 停止测试应用，再次从升级前备份恢复空数据库与媒体，准备副本凭据，使用旧程序镜像启动；运行 `gallery:upgrade:rollback`，结果写入 `rollback-result.json`。
8. 核对工作数据库和媒体未被测试修改；保留备份、摘要、版本与结果。结束后只清理 `gallery-upgrade-320` 项目。

所有 Gallery 命令通过根脚本运行，例如 `sh deployment/gallery/scripts/pnpm.sh gallery:upgrade:verify`。数据库契约回归仍使用 `gallery:prepare:db-tests`、`gallery:test:db`；schema 输入不包含真实业务行。

## 开发环境采用稳定版

稳定版开发镜像由目标源码的 `server/Dockerfile.dev` 构建为 `immich-server-dev:gallery-v3.2.0`。使用以下两个 Compose 文件叠加管理 init/server/web：

```sh
docker compose -f docker/docker-compose.dev.yml -f deployment/gallery/upgrade/dev-compose.yml up -d --no-build --no-deps --force-recreate immich-init
# 等 init 健康后，先在一个容器内串行同步服务端与 Web 的冻结依赖。
docker exec immich_init pnpm --filter immich-monorepo --filter 'immich...' --filter 'immich-web...' install --frozen-lockfile
# 再启动 server/web；数据库、Redis、ML 保持原服务。
docker compose -f docker/docker-compose.dev.yml -f deployment/gallery/upgrade/dev-compose.yml up -d --no-build --no-deps --force-recreate immich-server immich-web
```

Gallery 包装脚本及本次开发 Compose 将 `verifyDepsBeforeRun` 设为 `error`：发现失配即报错，防止 pnpm 隐式安装丢失过滤条件而触发全仓重装。没有关闭冻结锁、最低发布时间或供应链策略。需要同步时显式运行过滤后的 install，宿主使用正常开发环境设置，不临时设置 CI（否则 pnpm 虚拟存储模式会与运行时不一致）。

不要在 Immich 开发服务仍挂载宿主工作区时重装／重建根 node_modules。升级前停止 init/server/web，保留旧镜像标签及备份。Gallery 仍使用 3100 / 3101，Immich 开发 Web 3000、API 2283。

## 当前开发环境复核

产品分支已采用稳定版，API 返回 3.2.0 且 prerelease 为 null；现有 Chrome 中 Immich Web 显示 v3.2.0 并正常加载相册。Gallery 两个 readiness 均为 ready，现有初始凭据重新登录成功，公开相册和图片可读，测试登录会话已退出。

本次备份时公开相册含 2 张照片；工作环境运行期间用户又发布了 3 张照片的新版本，当前 1 个相册、2 个历史快照共 5 条快照照片记录保持不动。没有用旧备份覆盖当前库。5 个来源资产与媒体文件字节保持不变；重启仅更新六个 `.immich` 挂载检查标记。备份代表创建时间点，之后新增内容不包含在该旧备份中。

原 `mise.lock` 修改的 SHA-256 与升级前一致。开发服务和 Gallery 继续运行，隔离验收项目清理后释放 40283／4100／4101／45432，备份和本地验收结果保留。

## 尚未完成

真机手势与移动备份客户端、大图库网络性能、视频／ML、实际域名与 TLS、生产及异地备份、GitHub CI 均不能由本次本地照片验收替代。视觉细节按用户要求后续调整。
