# 本地开发与换机迁移

所有相对路径均以仓库根目录为基准；本机绝对路径只是 2026-11-03 的已核对值。换机时先恢复副本，不覆盖唯一原始数据。不把生产库直接导入会发邮件、执行后台任务的日常开发环境。

## 1. Git 能恢复与不能恢复的内容

| 内容 | 当前位置/来源 | 迁移方法 |
|---|---|---|
| 代码、迁移、文档、锁文件 | `codex/gallery`，origin 为 visiblelight/immich | 克隆并核对提交；保留本地未推送提交 |
| 未提交修改及未跟踪文件 | `git status`、[当前状态清单](current-state.md) | 分别保存暂存/未暂存补丁和所需新文件；确认没有把密钥放进普通代码归档 |
| 完整开发数据库 | `immich_postgres`，实际目录 `docker/library/postgres` | 用同版本 PostgreSQL 工具导出完整库和角色；不要在运行中复制 PGDATA 作为恢复方案 |
| Immich 媒体 | `docker/library/photos`，容器内 `/data` | 原片、衍生图、sidecar、上传目录一起私下复制，保留权限并校验 |
| Gallery 文章上传素材 | `.gallery-local/article-media` | 与对应数据库快照一起备份；只有数据库会导致文章插图丢失 |
| Gallery 运行配置 | `.gallery-local/runtime/public.env`、`admin.env`、`migration.env` | 私有渠道迁移，0600 权限；新机只改必要路径/origin，不随意重置业务密钥 |
| Immich 开发配置 | `docker/.env`；开发 Compose 及覆盖文件 | 私有迁移 env，保留已提交的 v3.3.3 覆盖配置及以后新增的本地差异 |
| 历史恢复和验证证据 | `.gallery-local/backups/`、`.gallery-local/local-upgrade-333/` 等 | 按保留策略加密归档；不要当作可无条件重跑的部署脚本 |
| SSH / GitHub / 云访问 | `~/.ssh/config`、相应私钥、known_hosts；本机凭据管理 | 按原账号安全迁移或重新授权；不要粘贴进聊天/仓库 |
| 本机工具链/缓存 | `.gallery-local/toolchain`、corepack、pnpm-store、node_modules、build、.svelte-kit、Docker 依赖卷 | 可重建；跨 macOS/Linux/CPU 架构必须重新安装对应依赖 |
| 生产服务数据与凭据 | `/srv/vision`、`/etc/gallery`、`/var/lib/gallery-*`、Edge 项目 | 不因换开发电脑而覆盖；另有生产备份和访问恢复责任 |

`.gallery-local/` 是混合目录：里面既有可丢弃缓存，也有唯一的运行配置、文章素材、私有验收证据。不能整体当缓存删除。早期 `.devcontainer/library` 不是本机当前媒体位置。

## 2. 离开旧电脑前

1. 记录 `git status --short`、分支、HEAD、remote。特别保留 mise.lock 的既有修改及以后新增的本地差异；v3.3.3 dev-compose 已归档，不必再从旧补丁重复应用。导出 `git diff --binary` 及 `git diff --cached --binary`，额外归档未跟踪文件；补丁不包含未跟踪文件，也不包含未推送提交。
2. 对需要长期保存的已提交历史可创建私有 Git bundle；核验 bundle 能被读取。是否提交/推送另按用户授权，不以 `git add -A` 把所有私有文件一起纳入。
3. 先记录当前运行进程和容器。为取得一致的“库+媒体”检查点，在约定维护窗口暂停相关 Gallery/Immich 写入、上传、时间读取及同步任务；只恢复此前运行的服务，不能顺手启动 CVAT 等项目。
4. 导出完整数据库、全局角色和私有配置，备份媒体与文章素材；同时记录源码 SHA、Immich 镜像、Gallery 迁移版本和文件校验。`pg_dump` 自身有一致快照，但不能独自保证扫描中的媒体文件与数据库同一时点。
5. 将迁移包保存到另一台设备/受控存储，并核对校验和。数据库、角色导出和配置含敏感信息，使用受保护传输与加密存储。只放在同一个 NAS/磁盘目录不等于有灾难恢复副本。
6. 在旧机退役前完成新机隔离恢复和真实页面验收。确认相册、照片组、文章、评论用户及时间确认均完整，再切换日常开发。

以下仅为**已有本地库的导出模板**，不包含暂停写入、媒体归档、传输或完整验收；先检查容器名及目标目录，目标必须是新目录：

```sh
umask 077
mkdir .gallery-local/transfer-YYYYMMDD

docker exec immich_postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' \
  > .gallery-local/transfer-YYYYMMDD/database.dump

docker exec immich_postgres sh -c 'pg_dumpall -U "$POSTGRES_USER" --roles-only' \
  > .gallery-local/transfer-YYYYMMDD/roles.sql

git diff --binary > .gallery-local/transfer-YYYYMMDD/worktree.patch
git diff --cached --binary > .gallery-local/transfer-YYYYMMDD/index.patch
git bundle create .gallery-local/transfer-YYYYMMDD/repository.bundle --all
git bundle verify .gallery-local/transfer-YYYYMMDD/repository.bundle
```

不要输出 env 内容或将密码放进命令参数。角色恢复需要结合新的集群检查：已有 postgres 等角色可能冲突，不能忽略所有错误后声称恢复成功。迁移包的正式恢复应在新建隔离实例中审核执行，不给出指向现有库的破坏性“一键恢复”命令。

## 3. 在新电脑恢复的顺序

1. **只取代码**：克隆 `visiblelight/immich`，切换 `codex/gallery`，核对预期 SHA；再恢复必要的未推送提交及补丁。不要拉 upstream main 到已有开发库来“顺便升级”。
2. **工具链**：按当前 `mise.toml` 安装 Node 24.21.0 和 pnpm 11.27.1（以后以配置为准）；无需安装全部 Immich 移动/Java/FFmpeg 工具。macOS arm64 的私有 Node 安装目录不能直接迁移到 x64/Linux。
3. **容器与隔离库**：使用已验证的 PostgreSQL 14 VectorChord 镜像、Immich v3.3.3 和相应扩展；不要换普通 postgres 镜像省事。先在独立目录、项目名、端口、网络恢复角色/库/媒体，避免同时挂载旧 PGDATA。
4. **恢复配置**：保留数据库角色和密钥关系，修正路径、端口与 Origin。新机恢复成功前关闭真实发信和对生产 OSS 的同步；不得让恢复的开发副本向真实访客发送测试邮件。
5. **验证兼容**：核对 Gallery `schema_migration` 版本及校验和、Immich 版本、资产/相册/文章等计数与必要哈希、代表媒体 SHA-256；存在旧应用/新库不兼容时先查迁移，不反复 bootstrap。
6. **启动 Gallery**：先构建，再按下节启动两个服务，检查真实页面及媒体，使用真实但仅本地的开发数据验收。
7. **恢复维护任务**：只在数据库及媒体路径确定后启动时间读取任务；首先处理下面的 Node 硬编码问题。OSS/CDN、正式发信、生产证书任务不应随本地环境自动启动。

仅恢复 Gallery schema 会丢失 Immich asset 等关联源，不能代替完整开发图库恢复。生产业务数据不应为了方便变成普通开发测试数据。

## 4. 本机已存在环境的启动

先确认 3100/3101 未被其他服务占用、数据库 healthy、运行 env 已存在。不要再次执行 `gallery:local:init`；它是首次初始化工具，不是启动脚本。它也不是生产初始化入口。

全部命令在仓库根目录执行，两个服务分别占用终端：

```sh
sh deployment/gallery/scripts/pnpm.sh gallery:doctor
sh deployment/gallery/scripts/pnpm.sh gallery:build

# 终端一
sh deployment/gallery/scripts/pnpm.sh gallery:local:public

# 终端二
sh deployment/gallery/scripts/pnpm.sh gallery:local:admin
```

打开 [本地前台](http://localhost:3100/albums) 与 [本地后台](http://localhost:3101/albums)。`/health/live` 只证明进程可响应，`/health/ready` 为 ready 才代表配置和数据库契约通过。更新源码后须重建并重启构建服务；进程退出不删除数据。

需要热更新可用 `gallery:dev:public` / `gallery:dev:admin`，但它们**不会自动加载** `.gallery-local/runtime/*.env`。须按 [本地使用说明](../development/mvp-local.md)显式将 env 传给对应 Vite。不要把 env 文件 shell source 后不加检查地导出到所有命令；更不要用 `set -x` 输出它。

样稿命令 `gallery:design` / `gallery:design:admin` 显式启用 `GALLERY_DESIGN_PREVIEW=1`。它们使用虚构内容，不能据样稿页面确认真实数据库功能已完成。正式运行和生产保持关闭。

### 关键环境映射

| 配置 | 本机值/作用 |
|---|---|
| `HOST`、`PORT` | `127.0.0.1`；前台 3100、后台 3101 |
| `ORIGIN`、`GALLERY_PUBLIC_ORIGIN`、`GALLERY_ADMIN_ORIGIN` | 对应 `http://localhost:3100` / `http://localhost:3101`，实际浏览器 origin 要匹配，不能关闭 Origin 校验解决问题 |
| `GALLERY_DATABASE_URL` | public/admin 使用各自受限角色；不共用 owner |
| `GALLERY_COMMUNITY_DATABASE_URL` | 仅前台专用互动角色；后台不用它替代管理连接 |
| `GALLERY_MEDIA_SOURCE_ROOT` | `/data/thumbs`，与源数据库内路径对应 |
| `GALLERY_MEDIA_MOUNTED_ROOT` | 本机 `<仓库>/docker/library/photos/thumbs`；只读衍生图 |
| `GALLERY_ARTICLE_MEDIA_ROOT` | `<仓库>/.gallery-local/article-media`；必须与数据库一起迁移 |
| `GALLERY_MAP_SECRET_KEY` | 既有地图配置加密密钥，私下保存，不随换机重生成 |
| `GALLERY_MEMBER_CODE_SECRET`、发信凭据 | 私下保存；本地验证使用授权邮箱，不能向真实访客群发 |
| `GALLERY_MIGRATION_DATABASE_URL` | 独立维护配置，禁止注入长期运行服务 |

恢复备份后要考虑撤销被备份复活的会话，尤其前台 `member_session`；不要把生产会话连同数据恢复成可联网的测试站。

## 5. 依赖安装、开发 Compose 与读取任务

依赖已正常时不重复安装。必须安装时，先读[宿主机与 Docker 依赖挂载](../development/immich-dependency-mounts.md)，只暂停会受宿主 node_modules 重建影响的 Immich server/web/init，记录其原先运行状态。数据库和媒体卷不参与清理。

```sh
sh deployment/gallery/scripts/pnpm.sh install --frozen-lockfile --ignore-scripts
```

包装器只过滤 Gallery 与根脚本，优先使用本机私有工具链，否则使用 PATH。它不会为新机自动安装 Node。不得关闭供应链审核、随意更新 pnpm-lock/mise.lock，或把 macOS node_modules 复制进 Linux 依赖卷。

Immich 开发使用 `docker/docker-compose.dev.yml` 叠加 `deployment/gallery/upgrade/dev-compose.yml`，并保留原 project name、env-file、目录解析方式。先通过容器标签和有效配置核对现有项目，别用新 project name 重复创建另一套卷。覆盖文件的 v3.3.3 改动已在 `abdca3c60` 归档；新机确保包含此提交，见[状态](current-state.md)。容器 Up 不等于 API 正常，需实测 2283。

时间任务入口：

```sh
sh deployment/gallery/scripts/pnpm.sh gallery:capture:worker
```

**先检查可移植性**：当前 `worker.py --local` 固定 darwin-arm64 的 Node 路径，新机其他平台需先修正工具链选择并验证，再运行。它默认读取 `immich_server` 内的工具；若使用只读维护容器，应显式设置 `GALLERY_CAPTURE_IMMICH_CONTAINER` 为已核验的读取容器。该容器的依赖、数据库权限和媒体只读挂载需确认，不能把目前存在的 `gallery-capture-reader` 当作 Git 克隆后自动拥有的资源。

新环境首次初始化请读[数据库开发](../development/database.md)与[独立站点初始化](../../../deployment/gallery/cloud/README.md)，区分 bootstrap、migrate、创建管理员、创建站点、来源白名单和社区角色；有完整备份恢复的库不走全新初始化流程。
