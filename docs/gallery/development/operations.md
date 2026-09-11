# Gallery 运行、账号维护与恢复

2026-09-11。适用于当前本地 MVP；公网 DNS/TLS、真机与 ML 仍需单独验收；稳定版照片工作流升级见[升级记录](../delivery/immich-v3.2.0.md)。Gallery 的数据、部署代码及文档保持在同一个产品分支，运行时不执行自动迁移。

## 管理员维护

页面“账号设置”可修改昵称和密码。改密会退出全部会话；忘记密码、创建第二位管理员、停用管理员使用独立维护命令，前后台进程不持有维护凭据。

从仓库根目录执行，使用 mise 管理的 Node 24.15.0。现有本地环境的维护凭据位于忽略目录 `.gallery-local/runtime/migration.env`，权限应为 0600：

```sh
node --env-file=.gallery-local/runtime/migration.env packages/gallery-db/scripts/account.ts create editor@example.com --name 编辑者 --password-file /absolute/private/password.txt
node --env-file=.gallery-local/runtime/migration.env packages/gallery-db/scripts/account.ts reset-password editor@example.com --password-file /absolute/private/password.txt
node --env-file=.gallery-local/runtime/migration.env packages/gallery-db/scripts/account.ts disable editor@example.com
node --env-file=.gallery-local/runtime/migration.env packages/gallery-db/scripts/account.ts enable editor@example.com
```

如果环境已显式注入 `GALLERY_MIGRATION_DATABASE_URL`，也可使用 `sh deployment/gallery/scripts/pnpm.sh gallery:account ...`。密码文件必须是仅本人可读写的普通文件（0600），密码 16–256 字符，命令完成后从临时位置移除。不把密码放进命令参数、版本库、日志或镜像。

维护命令检查 `current_user=gallery_migrator`；重置／停用／启用都会撤销该用户所有旧会话，重置不会擅自重新启用已停用账号。创建、状态操作串行化，拒绝停用最后一个可用管理员。操作写入 Gallery 审计表，CLI 不输出新密码。

“站点设置”保存名称、简介及最多 10 个联系链接，保存后立即反映到前台关于页；只接受 HTTP、HTTPS、mailto 地址。这里尚不是文章管理模块。

## 独立 Compose 运行

`deployment/gallery/compose/compose.yml` 仅管理 Gallery public/admin；连接已有 Immich 数据库网络，保留原 Immich Compose。镜像按根目录锁文件安装 Gallery 依赖，以 Node 24.15.0 / pnpm 11.22.0 构建。构建上下文为显式允许列表，不包含本地图库、环境文件、Git 历史或凭据。

准备三个独立文件：Compose 参数文件、public 运行环境文件、admin 运行环境文件，均放在版本库外。参数模板见 `deployment/gallery/compose/.env.example`。每个运行环境文件只配置该角色的数据库 URL 和来源衍生图根路径：

```dotenv
# public 文件使用 gallery_public；admin 文件使用 gallery_admin。
# database 是已有 Immich 数据库在 Docker 网络上的服务名，不是 127.0.0.1。
GALLERY_DATABASE_URL=postgresql://gallery_public:REPLACE@database:5432/immich
GALLERY_MEDIA_SOURCE_ROOT=/data/thumbs
```

两个文件不能复用迁移／数据库所有者凭据。初始化角色、迁移、来源白名单仍按[数据库操作说明](database.md)执行，不交给常驻容器。

```sh
docker compose --env-file /absolute/private/compose.env -p gallery -f deployment/gallery/compose/compose.yml build
docker compose --env-file /absolute/private/compose.env -p gallery -f deployment/gallery/compose/compose.yml up -d --wait
docker compose --env-file /absolute/private/compose.env -p gallery -f deployment/gallery/compose/compose.yml ps
```

默认将 3200/3201 绑定到宿主机回环地址。容器非 root、只读根文件系统、只读 thumbs 挂载，不挂载原片目录。镜像不包含运行密码。健康检查访问 `/health/ready`，会校验运行角色、Gallery 结构及初始化状态；设计原型默认关闭。

公网部署在宿主机使用反向代理，模板见 `Caddyfile.example`，分别对应 Immich、Gallery、Gallery Admin 三个域名。配置文件内域名必须与各自 `GALLERY_*_ORIGIN` 完全一致；不要删除端口校验或放宽 Origin 比对。代理不缓存页面、JSON 和图片，保证下线即时撤销。正式域名和 DNS/TLS 尚未配置。

代理后需正确识别客户端地址，避免所有登录共享同一个代理 IP 的限流额度。只在应用端口仅能由可信代理访问时，在后台环境设置 `ADDRESS_HEADER=x-forwarded-for`、`XFF_DEPTH=1`（单层代理）；多层链路按实际层数单独验证。Caddy 默认处理转发头，勿信任客户端自行提交的地址头。参考 [Caddy reverse_proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy) 与 [Compose 网络](https://docs.docker.com/compose/how-tos/networking/)。

## 备份与恢复

Gallery 和 Immich 共用数据库、分别使用 schema。正式备份采用整库 custom-format `pg_dump -Fc`，并保留对应时间点的 Immich 媒体文件／存储快照；只备份 Gallery 表不能恢复 Immich Asset 与衍生图依赖。凭据、来源配置、Compose 参数和版本提交另行加密备份，不能只有数据库备份。

建议恢复顺序：

1. 停止目标环境写入和对外服务，保留故障库与磁盘快照；恢复先在新建的隔离库进行。
2. 使用与备份兼容的 PostgreSQL／扩展镜像，预建与备份一致的角色；恢复同一时间点的媒体。
3. 使用 `pg_restore --exit-on-error` 恢复到空库，保留所有者与授权。不要向工作库执行 `--clean`。
4. 比较相册／发布／照片／用户数量和正文摘要；检查扩展、迁移历史、来源白名单及三个运行角色。
5. 撤销恢复库内全部旧会话：`UPDATE gallery.session SET revoked_at=now() WHERE revoked_at IS NULL;`，避免备份中的旧会话复活。
6. 使用运行角色检查发布页面、照片、相册下线后的拒绝行为；管理员重新登录，验证草稿保存与发布。
7. 验收后才切换连接与入口；保留旧库作为回滚点。数据库发生不可逆升级时，不通过降级镜像冒充回滚，使用升级前整库及媒体快照。

`gallery:test:db` 已包含完整 `pg_dump/pg_restore` 演练：同一标记隔离容器内的新库，预存测试角色，合成相册和照片，校验正文、发布数量、受限角色及媒体读取。它验证数据库恢复流程，不代表真实图库的磁盘灾难恢复、跨 PostgreSQL 大版本恢复或异地备份策略已经验收。

## 上游候选验证

不修改 `main` 或工作数据库。在记录候选 tag/commit 并核对官方发布说明后：

```sh
sh deployment/gallery/scripts/pnpm.sh gallery:prepare:upgrade
GALLERY_UPGRADE_CHECK=1 sh deployment/gallery/scripts/pnpm.sh gallery:test:db /absolute/immich-schema.sql /absolute/immich-migration-metadata.sql
```

准备命令从 Git 对象提取候选服务端源码，单独编译原始迁移／结构检查代码，使用已锁定的隔离验证依赖；不编译或启动完整 Immich 服务。输出保存于 `.gallery-local/upgrade/` 与 `.gallery-local/phase-b/`。不能以该结果替代完整服务端／Web／移动备份客户端升级验收，亦不能把它写成“生产升级完成”。完整升级仍需独立工作树、备份副本、候选 Immich 服务和 Gallery 端到端回归后再合并。

## v3.2.0 完整照片工作流升级

已在独立工作树、数据库和媒体副本中完成官方稳定镜像启动、Web 登录看图、Gallery 发布链路与旧版备份恢复。脚本、镜像、步骤及验收边界见[升级记录](../delivery/immich-v3.2.0.md)。上文候选数据库检查仍是快速预检，不替代这一完整流程。
