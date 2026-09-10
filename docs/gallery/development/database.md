# Gallery 数据库开发与验证

阶段 B 已实现，2026-09-10。当前实际图库未执行 Gallery 初始化或迁移。

## 1. 代码与权限

- `packages/gallery-db/migrations/0001_foundation.sql`：12 张业务表、约束、索引、管理角色权限。
- `0002_source_and_public_views.sql`：11 个 security_barrier 视图，由 NOLOGIN 的 gallery_view_owner 持有。
- `src/migrate.server.ts`：第 13 张 schema_migration、advisory lock、校验和、事务与顺序检查。
- `src/source.server.ts`：独立选片 DTO、相册／标签过滤、游标分页、提交 ID 再校验。
- `src/map.server.ts`：读取当前发布分支；按 Asset 去重、取较保守精度后再 bbox 过滤和完整聚合，支持跨日期变更线。一次视口最多约 65×65 个格子。
- `src/media.server.ts`：每次先查询当前公开资格；只接受 preview/thumbnail，限制真实路径与文件大小，匹配 isEdited，版本包含文件 ID/updateId。返回值只是服务端图片处理流水线的输入，**不能直接作为公开 HTTP 图片响应**。
- `src/compatibility.server.ts`：核实 PG14、真实登录角色、危险权限和视图列契约；供后续应用 readiness 调用。

当前两个应用仍是阶段 A 的未开放页面，readiness 仍为 503；阶段 D/E 接入数据库与授权之后才开放。数据库权限通过不代表登录、发布事务或前台已完成。

PG14 视图按视图所有者检查底层权限；security_barrier 保护过滤边界。设计依据：[PostgreSQL 14 Rules and Privileges](https://www.postgresql.org/docs/14/rules-privileges.html)。本项目还使用真实 gallery_admin/gallery_public 登录连接进行拒绝用例验证，不仅核对角色名称。

## 2. 重跑隔离验收

在仓库根目录，使用阶段 A 的工具链。前提：Docker、本基线的 PostgreSQL 镜像，以及已编译的 `server/dist`、`packages/plugin-sdk/dist`。

```sh
sh deployment/gallery/scripts/pnpm.sh gallery:prepare:db-tests
```

此命令把 `deployment/gallery/verification` 中锁定的独立验证依赖安装到 `.gallery-local/drift`，再复制已有 Immich 编译产物。使用 npm ci 的范围仅为这一临时工具目录，不修改根 pnpm-lock、Immich 服务依赖或运行容器。缺少已有编译产物时明确报错，不用伪造 schema 代替。

现有机器导出结构和必要技术元数据（容器名称只适用于本地开发环境）：

```sh
docker exec immich_postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --schema-only --no-owner --no-privileges' > .gallery-local/immich-schema.sql

docker exec immich_postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --data-only --no-owner --no-privileges --table=public.migration_overrides --table=public.kysely_migrations' > .gallery-local/immich-migration-metadata.sql

sh deployment/gallery/scripts/pnpm.sh gallery:test:db \
  "$PWD/.gallery-local/immich-schema.sql" \
  "$PWD/.gallery-local/immich-migration-metadata.sql"
```

第二份文件只包含迁移名称、时间与 schema 覆盖定义。`migration_overrides` 是上游比较函数／触发器等定义时必须使用的技术记录；省略它会产生不真实的漂移报告。没有导出用户、照片、相册、位置或凭据数据。

验收器新建带 `gallery.isolation=true` 标签的临时 PG14 容器，随机回环端口、随机密码、内存数据盘，不挂载现有图库／数据库卷。仅向此库恢复结构，随后使用合成数据验证；无论测试成功或失败均尝试删除本次容器。连接信息位于忽略目录，权限 0600。不要把 dump、连接文件或 `.gallery-local` 提交到 Git。

结果：`.gallery-local/phase-b/validation.json`、`schema-drift.json`、`upstream-check.json`、`map-plan.json`。前两份比较涵盖新增 Gallery 前后差异；`upstream-check` 实际调用未改动的 Immich `DatabaseRepository.runMigrations()` 和 `getSchemaDrift()`，仅注入隔离连接与日志接收器。未运行整个 Immich HTTP/Redis/机器学习服务栈，也不等于完成跨版本升级演练。

若仅提供结构文件，命令只做 Gallery 回归与新增漂移比较；完整阶段 B 验收必须同时提供技术元数据，并准备真实编译产物。

## 3. 首次初始化与后续迁移

以下命令已提供，真实环境执行属于后续部署流程。不要把数据库管理凭据放进常驻服务。

将 `deployment/gallery/database/admin.env.example` 复制到 `.gallery-local/gallery-db-admin.env`，设置权限 0600，填入数据库所有者连接、现有 Immich 数据库登录角色、专用 migrator 连接，以及三个至少 24 字符的随机密码。

```sh
sh deployment/gallery/scripts/pnpm.sh exec node \
  --env-file=.gallery-local/gallery-db-admin.env \
  packages/gallery-db/scripts/database.ts bootstrap

sh deployment/gallery/scripts/pnpm.sh exec node \
  --env-file=.gallery-local/gallery-db-admin.env \
  packages/gallery-db/scripts/database.ts migrate
```

Bootstrap 一次性创建四个角色与 gallery schema；遇到同名角色会回滚并拒绝接管。PG14 默认可能允许 PUBLIC 在 public schema 建对象，因此初始化会撤销该继承权限，并显式保留 `GALLERY_IMMICH_DATABASE_ROLE` 的 USAGE/CREATE；现有 Immich 表结构与迁移记录不修改。后续迁移使用 gallery_migrator，不需要在 Gallery 运行容器里保存数据库所有者连接。

迁移可重复执行；已执行文件被改写、未知版本、倒序补迁移会拒绝继续。SQL 失败会回滚当前迁移及记录。发布业务的版本锁、树防环、slug 固定、富文本块及安全链接的完整校验由阶段 D 服务实现，不能用直接写表绕过这些规则。

## 4. 配置来源所有者

白名单初始为空，Gallery 用户不会自动扩大来源权限。使用同一个一次性迁移配置执行：

```sh
sh deployment/gallery/scripts/pnpm.sh exec node \
  --env-file=.gallery-local/gallery-db-admin.env \
  packages/gallery-db/scripts/database.ts source-enable <Immich所有者UUID> '来源说明'

sh deployment/gallery/scripts/pnpm.sh exec node \
  --env-file=.gallery-local/gallery-db-admin.env \
  packages/gallery-db/scripts/database.ts source-disable <Immich所有者UUID> '停用说明'
```

配置与审计在同一事务提交。gallery_admin 不能修改来源表。停用后新的选片、照片、封面、地图和媒体资格查询立即排除该来源。

## 5. 媒体挂载与运行边界

适配器接受明确映射：`sourceRoot` 是 Immich 数据库中的缩略图绝对根路径，`mountedRoot` 是 Gallery 实际只读挂载位置。仅映射 thumbs，不挂载原片目录；路径按目录关系判断，不能用字符串前缀替代。文件缺失、路径逃逸、未就绪的编辑版本均不回退原片。

阶段 E 将实现图片解码／缩放／清除嵌入 EXIF/GPS、公开响应 DTO、no-store、缓存命中前重授权和地图点详情分页。现在没有公开媒体 HTTP 接口或静态缓存入口，因此尚未提供端到端的图片隐私验收。

本轮验证的是本地 PG14 无 TLS 回环连接。远程连接的 CA／TLS 配置和证书验证在部署阶段单独验证；现有运行连接工厂继续拒绝 URL 查询参数覆盖角色或 TLS 行为。
