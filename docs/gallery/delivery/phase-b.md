# 阶段 B：数据、权限与 Immich 集成验收

状态：已完成隔离技术验证，2026-09-10。现有 Immich 数据库未应用 Gallery 迁移；本阶段没有开放 Gallery 前后台。

## 交付结果

| 内容 | 实际结果 |
|---|---|
| 数据库结构 | 12 张业务表 + 1 张独立迁移记录表；0001/0002 两批迁移 |
| 角色隔离 | migrator、NOLOGIN view_owner、admin、public；真实独立登录连接验证 |
| 资源与公开投影 | 11 个 security_barrier 视图；公开内容由当前发布树、来源白名单和源资源资格共同过滤 |
| 选片适配 | Immich 相册／标签缩小范围、游标分页、跨相册引用、提交 ID 再校验；Gallery 标题描述独立 |
| 地图 | 读取最新 GPS，先应用相册／照片精度上限，再去重、bbox 和完整计数；不用同步表 |
| 媒体输入 | preview/thumbnail、匹配 isEdited、真实路径限定、符号链接逃逸拒绝、缺失不回退、文件版本标识 |
| 运维命令 | 独立 bootstrap、带校验和的事务迁移、来源启用／停用与审计 |
| 兼容检查 | 原始 Immich DatabaseRepository.runMigrations() 与 getSchemaDrift() 通过，0 漂移 |
| 可重复验收 | 锁定的独立工具环境、全新临时 PG14、合成数据、结束自动删除容器 |

具体结构见[数据字典](../architecture/database.md)，运行步骤见[数据库开发说明](../development/database.md)。Gallery 代码、迁移、工具和文档保持在自己的目录，根 pnpm-lock 和 Immich 源码未变。

## 验证基线

- Immich 源码：`469a870a2233e7361bcb855b183fd41272cfd056`，`3.2.0-rc.0`。
- PostgreSQL：14.19；镜像 `ghcr.io/immich-app/postgres:14-vectorchord0.4.3-pgvectors0.2.0`，digest `sha256:bcf63357191b76a916ae5eb93464d65c07511da41e3bf7a8416db519b40b1c23`。
- Node 24.15.0、pnpm 11.22.0；Immich SQL 工具 0.6.3、迁移器 Kysely 0.28.17。
- 测试机器 Apple M4 Pro、48 GiB 内存，Docker 本地回环连接；未模拟互联网延迟。
- 只导出原库 schema，以及 `kysely_migrations` / `migration_overrides` 技术元数据。所有用户、Asset、相册和 GPS 用合成记录建立；媒体权限用临时合成文件验证。

## 已通过的回归

数据库集成测试共 **16 项（含总验收项）**，全部通过：

- 迁移重复执行、迁移角色识别、被改写的历史拒绝、失败 DDL 与迁移记录回滚。
- readiness 可使用的真实角色／危险权限／视图契约检查。
- public 拒绝原始 Immich 数据、Gallery 用户／凭据／会话／草稿／历史；运行角色拒绝 DDL、提权、来源修改和迁移记录修改；admin 不能改旧快照、删除审计。
- 白名单为空时零资源；共享源相册中的白名单外照片被排除；提交伪造或重复 Asset ID 不能通过资格检查。
- 同一 Asset 的 Gallery 相册文案独立；草稿改字、移片、改父级、从 Immich 相册移除均不改变现有发布内容。
- GPS 从第比利斯改为巴统，刷新查询即更新；hidden 返回空坐标、approximate 网格中心、重复 Asset 取较保守精度；细 bbox 不能探测近似模式背后的精确点。
- 无坐标和越界值不输出位置；NaN/Infinity 在此基线由 Immich 地理索引拒绝写入；合法极点／经度边界不溢出。
- 父相册下线同时关闭后代照片、媒体、封面、首页与地图；恢复后仍单独下线的子册不会出现；错误发布环无法从公开根遍历到。
- 回收、deletedAt、hidden/locked、offline、VIDEO、来源停用与 Asset 真正删除立即撤销照片资格；没有跨 schema FK 阻挡 Immich 删除。
- 编辑版衍生图未齐时拒绝，齐备后读取正确变体；重建产生新版本标识；假 photoId、raw、路径穿越、相似前缀目录、符号链接逃逸和文件缺失拒绝。
- 跨册 release 指针、重复选片、无效文档／焦点、带 GPS 键的公开 EXIF、错误会话令牌长度被数据库约束拒绝。
- 1 万条合成地图位置完整计数，无静默截断。

此外，5 项连接配置测试、Gallery 全工作区类型／Svelte 检查、两个应用生产构建与 HTTP 冒烟均通过。页面仍返回未开放状态；liveness 200，readiness 和根页面 503。GitHub CI 尚未推送运行；数据库集成验收目前为本地命令，不冒充现有 CI 已执行。

## 查询测量

全新临时库末轮测试：1 万个 Asset 及各自预览／缩略图记录，单发布相册，全世界 bbox，zoom 8，结果 19 个聚合点、总计 10,000 张。应用端单次聚合耗时约 **28.0 ms**；同一公开照片分支计数的 EXPLAIN ANALYZE 执行约 **11.3 ms**。完整 SQL 计划保存在忽略目录的 map-plan.json。

这是本机合成数据测量，不是生产 p95 或前台性能承诺。当前不需要据此引入 PostGIS、坐标同步表或预计算缓存。地图点详情分页、真实相册分布和前端缩放交互仍在阶段 E 验收。

## 对现有环境的核对

- 对操作前后 pg_dump 的结构部分比较，去除随机 restrict 标记后完全一致；原库不存在 gallery schema。
- 原有 6 个 Immich 容器保持运行，未重启；没有启动 CVAT 或其他无关服务。
- Gallery 临时容器已删除，测试数据不持久保存。
- 原有未提交 mise.lock 保持 SHA-256 `ecdf397dcf7f33e6a9b9ab6803fa98697921a50c5c963e1f4a7a3822a55c01c0`，不纳入 Gallery 提交。
- 没有合并上游新版本、远程推送或生产部署。

## 下一阶段及待实现边界

下一阶段为 **C：两组视觉方向**，分别展示 PC／移动首页和相册关键画面，经用户确认后进入完整前台实现。

阶段 D 实现独立登录、完整富文本校验、编辑并发控制、树防环、发布事务、slug 固定及操作闭环。阶段 E 实现公开页面、图片解码／缩放／去 EXIF/GPS、响应 DTO、no-store 和地图交互。当前媒体函数仅作为服务端处理输入，不是可直接发布的图片端点。

数据库启动链中的原始迁移和漂移方法已验证；完整 Immich 服务栈启动、真实图片端到端检查、远程 TLS、Compose／域名路由、备份恢复和官方前进升级演练仍按阶段 D–F 完成。候选 v3.2.0 尚未标记为兼容版本。
