# Immich 集成、媒体与地图规则

> 2026-09-12 范围补充：[ADR 0006](../decisions/0006-visited-map.md) 已恢复地图开发范围。以下授权、GPS 实时读取和位置公开规则仍适用，新增国家归属、到访和服务商设计见 [去过数据设计](visited-map.md)。

> 2026-09-11 范围修订：见 [ADR 0002](../decisions/0002-albums-first.md)。首页／地图暂缓，详细介绍不再插图，关于未来由文章选篇。本文保留已验证结构和扩展边界，不代表相应 UI 仍在 MVP；本轮未修改迁移或新增文章表。

状态：已确认。版本：0.1，2026-09-10。

## 1. 已核对的源代码基线

源码提交 `469a870a2233e7361bcb855b183fd41272cfd056`，版本 `3.2.0-rc.0`。以下是本地源码观察，不代表所有 Immich 版本的稳定接口。

| 来源表／文件 | 读取用途与已核对字段 |
|---|---|
| [asset.table.ts](../../../server/src/schema/tables/asset.table.ts) | id、ownerId、type、originalFileName、localDateTime、fileCreatedAt、status、deletedAt、visibility、isOffline、isEdited、width、height、updateId |
| [asset-exif.table.ts](../../../server/src/schema/tables/asset-exif.table.ts) | assetId、latitude、longitude、city/state/country、description、相机参数及独立 updateId |
| [asset-file.table.ts](../../../server/src/schema/tables/asset-file.table.ts) | assetId、type、path、isEdited、updateId；唯一键包含 isEdited，不能只按 type 取任意一条 |
| [album.table.ts](../../../server/src/schema/tables/album.table.ts) | 后台相册过滤选项 |
| [album-asset.table.ts](../../../server/src/schema/tables/album-asset.table.ts) | 后台按相册选片的关联 |
| [album-user.table.ts](../../../server/src/schema/tables/album-user.table.ts) | 过滤可供后台显示的相册，角色关系，不作为 Gallery 用户来源 |
| [tag.table.ts](../../../server/src/schema/tables/tag.table.ts) / [tag-asset.table.ts](../../../server/src/schema/tables/tag-asset.table.ts) | 标签及 Asset 关联，注意标签用户范围 |
| [enum.ts](../../../server/src/enum.ts) | IMAGE；active/trashed/deleted；timeline/archive/hidden/locked |

独立适配器提供 Gallery 稳定字段，不让页面直接依赖原始表结构。Gallery 不导入 Immich 整个 NestJS 服务，不复用其账号凭据，不把 REST API 当常规读数据链路。

## 2. 来源范围与资源资格

后台资源选择器和公开投影都必须满足：

- `asset.ownerId` 在启用的 gallery.immich_source_owner 白名单中。
- type = IMAGE、status = active、deletedAt IS NULL、isOffline = false。
- visibility 为 timeline 或 archive；hidden/locked 均排除。当前源码 hidden 也用于 Live Photo 视频部分，不能泛化解释成普通照片保密标记。
- 原始媒体可浏览的 preview/thumbnail 已准备好；不回退到原始 RAW 或任意原片路径。

白名单是管理员显式允许使用的资源范围；其中照片仍需被选片并发布才能公开。Immich 原本没有公开分享链接不妨碍 Gallery 独立发布。没有白名单时禁止选片，不默认读取家庭全部用户。

后台通过相册或标签过滤只缩小上述范围；白名单外的照片即使混在同一个共享相册也不能被选到。相册／标签选择器本身也过滤可见集合，避免展示不相关用户的私有名称。

MVP 初始配置按资源所有者授权，不自动继承复杂的 Immich 相册协作权限。未来如需仅授权某些共享相册，应明确新增资源范围模型，不能假定数据库 JOIN 已执行 Immich 服务层权限检查。

## 3. 数据更新归属

| 信息 | Gallery 行为 |
|---|---|
| 原始 GPS | 最新读取，刷新地图立即反映已提交的修改 |
| GPS 清空或越界／非有限数 | 不输出坐标，相册照片仍可浏览 |
| Immich 城市名 | 仅后台参考，不用它替代坐标做聚合，不承诺 GPS 修改会同步修正文字 |
| Gallery 标题、游记、选片、父级、顺序 | 草稿发布生效 |
| Gallery EXIF 展示设置及允许的相机参数 | 发布时生成筛选快照，不含 GPS |
| Immich 描述、标签、相册名称 | 后台重新请求时更新参考／筛选，不覆盖 Gallery 文案 |
| 从 Immich 相册移除照片或删除相册 | Asset 仍可用则不影响 Gallery |
| Asset 被删、回收、锁定、离线或移出来源范围 | 后续公开请求拒绝访问；后台提示失效 |
| 原图编辑或衍生图重建 | 读取当前匹配 isEdited 的预览，缓存按衍生文件版本失效；未准备好则显示不可用，不使用错误旧变体 |

Asset 行和 EXIF 行各自有 updateId。不能只监测 asset.updateId，也不能用简单 max(updateId) 假装覆盖删除和全部元数据变化。MVP 动态查询 GPS 和资源状态，不需要同步游标；未来缓存索引另行设计。

## 4. 地图位置公开规则

### 4.1 相册和单张策略

相册 location_mode 默认 hidden，可设 approximate 或 exact；单张默认 inherit，也可进一步降低精度。计算公开模式时取两者中更保守者，单张 exact 不能突破相册 hidden/approximate 上限。

- hidden：所有公开 JSON、HTML、图片内元数据都不含坐标。
- exact：返回 Immich 最新合法经纬度。
- approximate：服务器把坐标落到固定 0.02° 经纬网格中心，边界钳制到合法经纬范围。它是近似位置，不等同于“城市中心”，也不承诺固定公里误差。

近似规则只在服务端执行；浏览器不先接收精确 GPS 再模糊。不同缩放级别使用同一近似点，避免靠多次请求反推出原坐标。正文由用户自己写出的地点名称不受自动脱敏处理。

### 4.2 去重与聚合

1. 根据当前地图范围查询有效公开相册及其照片出现位置。
2. 校验 Asset 当前资格、GPS 合法性，计算每个出现位置的有效公开模式。
3. 去掉 hidden 出现位置，再按 Immich Asset 去重；同一 Asset 若存在 exact 与 approximate 出现位置，当前汇总地图采用较保守的 approximate。
4. 仅返回允许显示位置的出现位置列表，供访客进入对应相册和照片；不夹带隐藏或已下线相册的名称。
5. 在脱敏后的坐标上执行边界筛选、聚合与数量统计，避免通过精细边界探测隐藏的精确坐标。

一个相册中隐藏位置，不会否定管理员在另一个已发布相册对同 Asset 明确授予的位置展示；后台选片复用提示这一点。相册地图只考虑自身分支，全站地图考虑所有有效公开出现位置。

聚合随地图缩放变化，不承诺按行政城市分组。精确模式下，GPS 从第比利斯改到巴统，下次请求的点与聚合都会移动；Gallery 相册成员不移动。近似模式下在同一个网格内的小幅移动可能看不出变化。

### 4.3 请求与规模

MVP 地图响应和地图数据页面使用 no-store，刷新发起新查询；不承诺 WebSocket 自动刷新。地图 API 接收 bbox、zoom 和可选 albumId，限制坐标范围、查询时间与返回数量；聚合在服务端完成，不把整个图库一次性发给浏览器。

查询数量限制不能通过静默截断造成错误聚合计数：先基于完整符合条件的集合聚合，再分页提供点详情。小样本用数据库查询与应用聚合验证；较大测试集用 EXPLAIN 和内存测量决定是否需要空间索引或预计算。MVP 不默认安装 PostGIS，也不改写 Immich 的现有空间索引。

底图服务提供商、版权署名、访问地域和费用待技术阶段核对官方条件；配置化接入。公开照片坐标用于地图服务时要检查请求是否会把整组坐标发送给第三方，优先保持照片聚合数据在 Gallery 服务内。

## 5. 媒体访问

- 公开路径使用 Gallery album/photoId 和明确尺寸，不接收磁盘路径。封面有自己的相册上下文校验。
- 先验证当前发布版本、整条祖先链、具体出现位置、来源范围和 Asset 当前状态，再解析允许的衍生文件。
- 文件根只读挂载 thumbs；本期不挂载公开可读原片或转码视频。实际来源目录通过配置，不假定所有环境都在默认 upload 下。
- 规范化并解析真实路径，限制在允许的挂载根内，阻止路径穿越和符号链接逃逸；不能靠字符串前缀检查。
- 选择匹配 Asset 当前 isEdited 的 preview/thumbnail；没有匹配文件时不随意切到旧的未编辑图。
- 按 [ADR 0008](../decisions/0008-immich-image-quality.md)，尺寸与压缩由 Immich 生成（当前 Thumbnail 1080p、Preview 2160p）；Gallery 保留 JPEG／WebP 压缩像素、ICC 与透明度，仅清理 EXIF/GPS、XMP、IPTC 等附加信息，不再缩放或二次有损压缩。公开参数只从受控 JSON 提供，变体不放到反向代理可直接访问的静态目录。
- 缓存键包含 Asset、衍生文件 ID/updateId、尺寸和处理版本；每次命中缓存前仍先授权。缓存可重建，无需业务表。
- MVP 动态媒体响应不允许公共长期缓存，先用 private/no-store 保障下线检查；浏览器已取得的图片无法收回。将来引入 CDN 必须另行设计撤销与缓存规则。
- 数据库或兼容检查失败时返回不可用，不能绕过授权直接读缓存文件。

## 6. 与 Immich 升级的关系

Gallery 依赖的表、列、枚举、资产资格和衍生文件语义形成契约测试，不把内部数据库当永远稳定接口。启动需检查实际数据库结构与支持范围，不只检查版本字符串。

当前 Immich [数据库检查实现](../../../server/src/repositories/database.repository.ts) 对不同对象的 extra 忽略规则不同，不能凭“独立 schema”断言不产生 schema drift。阶段 A/B 必须实测：添加 Gallery 表、视图和角色后 Immich 启动与迁移正常；不得关闭上游检查掩盖冲突。

若额外对象导致兼容问题，先在 Gallery 侧调整命名和对象类型；仍不能解决则记录决策并提交具体修订，不默默改成两个数据库或绕开用户确认的直连方案。

数据库备份需包含 public 与 gallery 的一致快照，恢复后重建必要角色授权；照片与数据库有对应的恢复检查点。只备份 gallery schema 不构成完整恢复方案。
