# Gallery 开发基线与文档入口

最后整理：2026-11-03。Gallery 已在生产运行，包含相册/照片组、文章、地图与到访、邮箱用户/评论/点赞、作者元数据及拍摄时间核对等功能。生产应用为 `667d972ae`，数据库迁移至 `0018`；版本和服务状态的核对证据见[当前状态](handoff/current-state.md)。

**换电脑、换 agent 或缺失聊天记录时，从[接手入口](handoff/README.md)开始。** 仅克隆 Git 不会恢复真实数据库、媒体、私有配置和未提交修改，详见[本地迁移清单](handoff/local-and-transfer.md)。

本文档集同时保留早期 MVP 设计和后续交付记录。`decisions/` 表示已接受的需求，`architecture/` 解释结构，`delivery/` 记录带日期的实施/验收；历史“待实现”不代表现在仍未实现。状态判断须结合最新记录和运行版本，不能把整个文档集视为一次冻结的 MVP 方案。

## 项目定位

Gallery 是独立的摄影相册与游记展示平台。Immich 集中管理原片及源元数据，Gallery 从允许的 Asset 中跨相册选片，建立自己的相册树、文章、照片资料、互动与发布快照。GPS 保持从 Immich 实时读取；Gallery 功能不修改 Immich 原片、缩略图、预览或元数据。

## 接手必读

| 文档 | 用途 |
|---|---|
| [接手入口](handoff/README.md) | 阅读顺序、依据优先级、交给新 agent 的提示 |
| [当前状态与接续事项](handoff/current-state.md) | 实际版本、本地/生产核对、原有未提交修改、已知缺口 |
| [架构与产品约定](handoff/architecture-and-product.md) | 关键决策、代码定位、权限与数据保护、已确认交互 |
| [本地开发与换机](handoff/local-and-transfer.md) | 代码以外的迁移资产、工具链、真实环境启动与恢复验证 |
| [开发与验证](handoff/development-workflow.md) | 验收范围、测试命令、常见故障与文档维护 |
| [生产运维](handoff/production-operations.md) | CI、凭据职责、迁移、维护任务、备份边界和回退 |

## 功能与历史文档索引

| 文档 | 阅读目的 |
|---|---|
| [确认复用 ADR 0028](decisions/0028-capture-confirmation-reuse.md) | 只改 GPS 复用相机时区确认、源时间变化重新核对 |
| [确认复用与核验交付](delivery/capture-confirmation-reuse.md) | 0018、自动刷新、行程排序、文章照片链接及生产验收 |
| [更新状态 ADR 0027](decisions/0027-capture-update-state.md) | 后台处理中状态与人工核对区分 |
| [独立地点时区 ADR 0026](decisions/0026-manual-capture-destination.md) | 相机时区和拍摄地点时区分别确认 |
| [作者元数据](architecture/media-attribution.md) | Gallery 输出副本作者信息、Immich 源文件保护 |
| [到访管理交付](delivery/visits-overview.md) | 列表、地点展开及管理交互 |
| [旅行日期与移动看图](delivery/travel-dates-viewer.md) | 日期展示、排序与移动端信息布局 |
| [GPS 自动换算与重新读取 ADR 0025](decisions/0025-capture-auto-refresh.md) | 完整 GPS 证据自动换算、独立读取任务和人工决定保护 |
| [拍摄时间重新读取交付](delivery/capture-refresh.md) | GPS 自动换算、主动读取及生产真实图库验收 |
| [拍摄时间 ADR 0024](decisions/0024-capture-time-evidence.md) | 相机钟表、定位时区与独立可撤销时间校正的确认范围 |
| [拍摄时间数据字典](architecture/capture-time.md) | 0016 证据与确认、0017 读取队列、视图及权限 |
| [拍摄时间核对交付](delivery/capture-time.md) | 本地真实证据、佳能/索尼验证与生产发布边界 |
| [用户与互动 ADR 0023](decisions/0023-members-comments-and-likes.md) | 前台邮箱验证码用户、评论与点赞的已确认范围及分阶段边界 |
| [用户与互动交付](delivery/community.md) | 本地真实接入、隔离验收与阿里云发信联调状态 |
| [地区足迹 ADR 0021](decisions/0021-regional-visited-maps.md) | 已确认的中国省份及其他国家地区地图方案、位置保护与分阶段边界 |
| [地区足迹真实接入](delivery/regional-visited.md) | 省份归属、地图详情、独立到访整理及本地验证状态 |
| [中国地图样稿交付](delivery/china-map-prototype.md) | 本地交互样稿进度、视觉确认及真实数据接入边界 |
| [连续浏览 ADR 0020](decisions/0020-continuous-browsing.md) | 相册/相片自动追加、位置恢复与兼容边界 |
| [连续浏览交付](delivery/continuous-browsing.md) | 已确认的本地实现、隔离验收及生产发布状态 |
| [地点与目录 ADR 0018](decisions/0018-places-filters-and-article-outline.md) | 地名、实际焦距组合筛选和目录交互 |
| [地点数据字典](architecture/places.md) | 0012 新增表、实时GPS与权限边界 |
| [地点核对与沿海归属交付](delivery/place-review.md) | 待核对列表、同坐标批量确认与海岸线候选 |
| [地点与目录交付](delivery/places-and-outline.md) | 本地迁移、验证与生产状态 |
| [全部相片与浏览细节](delivery/photo-library-and-map-polish.md) | 跨相册批量编辑、父相册封面、地图语言与界面修订 |
| [文章隐藏作品与图片组](delivery/article-image-groups.md) | 三类图片、两种组引用、权限与本地验收 |
| [私有访问统计](delivery/analytics.md) | Umami 自托管、统计范围、部署与实际验收 |
| [OSS / CDN 接入记录](delivery/oss-cdn.md) | 香港 Bucket 与 CDN 实测状态、5 分钟撤销规则、免费证书自动化及待实施事项 |
| [登录与文章编辑优化](delivery/editor-polish.md) | 长期会话、保存反馈、独立预览、H4 与正文／页脚间距 |
| [独立 Edge 与自动发布](delivery/shared-edge.md) | 公共入口解耦、本地维护线与 CI 发布状态 |
| [首次云端部署准备](delivery/cloud-launch.md) | 正式域名、空库初始化、分阶段存储和上线检查状态 |
| [统一外框与看图器 ADR 0014](decisions/0014-public-shell-and-viewer.md) | 已确认的九项 UI 优化、站点页脚与保存范围 |
| [公共界面交付](delivery/public-ui.md) | 实施、浏览器验收与迁移状态 |
| [富文本扩展 ADR 0013](decisions/0013-rich-content-and-publication-times.md) | 表格、清单、粘贴兼容与真实发布时间 |
| [富文本扩展交付](delivery/rich-content.md) | 实际开发、验证与使用变化 |
| [记录与富文本 ADR 0012](decisions/0012-records-and-rich-text.md) | 已确认的文章、双来源插图、关于选篇与发布边界 |
| [文章数据设计](architecture/articles.md) | 0008 实际结构、内容协议和素材权限 |
| [记录模块交付](delivery/articles.md) | 已认可样例、真实业务与本地验收分阶段跟踪 |
| [内容优先视觉 ADR 0011](decisions/0011-content-first-visual-layout.md) | 已确认的导航统一、筛选侧栏、照片编辑与说明布局 |
| [内容优先视觉交付](delivery/content-first-visual-layout.md) | 本轮实现与浏览器验证 |
| [统一照片与标签 ADR 0010](decisions/0010-shared-photos-and-tags.md) | 全站共用照片资料、独立发布、标签管理与检索 |
| [统一照片与标签交付](delivery/shared-photos-and-tags.md) | 候选验证、已完成迁移与本地使用入口 |
| [沉浸看图 ADR 0009](decisions/0009-immersive-viewer.md) | 简化切换提示、完整照片沉浸查看及说明分区 |
| [沉浸看图交付记录](delivery/immersive-viewer.md) | 已实现交互、桌面与手机布局验证 |
| [Immich 图片画质 ADR 0008](decisions/0008-immich-image-quality.md) | 1080p／4K 衍生图引用、无二次压缩及元数据清理 |
| [Immich 展示图交付记录](delivery/immich-image-quality.md) | 像素与色彩验证、现有来源尺寸及预览入口 |
| [后台交互 ADR 0007](decisions/0007-admin-navigation-and-inventory.md) | 统一导航、作品统计、相册树及新相册位置默认值 |
| [后台交互交付记录](delivery/admin-interactions.md) | 已实现内容、浏览器检查及回归验证 |
| [去过功能 ADR 0006](decisions/0006-visited-map.md) | 已确认的世界足迹、照片地图与多底图方案 |
| [去过数据设计](architecture/visited-map.md) | 派生统计、配置及人工校正的实际结构 |
| [去过交付记录](delivery/visited-map.md) | 区域样稿与真实业务分别记录 |
| [照片组交互与单项发布](delivery/item-publication.md) | 2026-09-12 本轮实现及验收记录 |
| [产品调整 ADR 0005](decisions/0005-item-publication-and-viewer.md) | 独立编辑弹窗、当地时间、双向导航和局部发布 |
| [Markdown、照片组与时间轴交付](delivery/interaction-upgrade.md) | 本轮交互升级、迁移与验证结果 |
| [产品调整 ADR 0004](decisions/0004-markdown-photo-groups.md) | 已确认的 Markdown、照片组与相片页规则 |
| [Immich v3.3.3 升级评估](delivery/immich-v3.3.3-assessment.md) | v3.3.3 生产及本地升级、数据保留与恢复验证 |
| [Immich v3.2.0 升级记录](delivery/immich-v3.2.0.md) | 稳定版、真实备份副本闭环与旧版回滚范围 |
| [MVP 收尾记录](delivery/mvp-completion.md) | 本轮功能、容器、恢复与候选版本验证边界 |
| [运行维护手册](development/operations.md) | 管理员维护、Compose、代理、备份与恢复 |
| [本地 MVP 交付记录](delivery/mvp-local.md) | 当前可用能力、实测结果与待办 |
| [实际应用启动与操作](development/mvp-local.md) | 登录凭据位置、启动、发布和环境恢复 |
| [MVP 需求与页面流程](product/requirements.md) | 确认第一版做什么、每个页面能做什么 |
| [数据库设计与完整数据字典](architecture/database.md) | 查看全部新增表、字段、关系、索引和约束 |
| [草稿、层级与发布规则](architecture/publication.md) | 确认相册嵌套、移动、发布、下线的行为 |
| [Immich 集成与地图规则](architecture/immich-integration.md) | 确认资源范围、GPS 自动更新、媒体权限和升级边界 |
| [应用与部署架构](architecture/overview.md) | 理解模块、三个域名、数据库账号和部署结构 |
| [视觉设计交付说明](design/brief.md) | 确认高质量设计如何进入开发与验收 |
| [Git、开发阶段与验收计划](delivery/plan.md) | 确认开发顺序、上游升级和交付标准 |
| [阶段 A 初始化验收记录](delivery/phase-a.md) | 查看实际完成内容、验证结果与尚未实现的范围 |
| [后台工作台与闭环预览](design/admin-workflow.md) | 选片、编辑、草稿、预览、发布与下线恢复 |
| [当前相册浏览布局](design/album-browser.md) | 固定网格、左右详情、大图和关于页 |
| [产品调整 ADR 0002](decisions/0002-albums-first.md) | 首页暂缓、地图移出 MVP、介绍不插图、未来关于选篇 |
| [阶段 C 视觉评审交付](delivery/phase-c.md) | 实际检查结果、待确认事项与后续范围 |
| [阶段 B 数据与权限验收](delivery/phase-b.md) | 迁移、真实角色隔离、GPS、媒体和上游兼容验证 |
| [数据库开发说明](development/database.md) | 重跑隔离验收、初始化、迁移与来源白名单命令 |
| [本地开发说明](development/getting-started.md) | 工具链、安装、检查、构建与运行命令 |
| [架构决策记录 0001](decisions/0001-product-baseline.md) | 查看本次方案依据，以及已被替代的早期方案 |

## 持续适用的核心规则

用户已确认独立 Gallery 用户体系与域名、跨 Immich 相册选片、自有相册和图文、父子相册、实时 GPS、简洁统一的 PC/移动体验，以及同库不同 schema。上游升级需独立验证和授权，不能自动合并后直接打开现有数据库。

以下摘要不替代相关功能的最新 ADR：

1. 公众可免登录浏览，前台邮箱用户支持评论和点赞；后台管理员身份独立，注册和互动由后台开关控制。
2. 相册树为单父级，允许每层同时有直接照片和子相册；父相册详情不默认铺开所有后代照片，地图按当前公开范围汇总照片。
3. 按 ADR 0010，一个 Asset 在 Gallery 中只有一份照片资料，多个相册引用同一份标题、描述、标签和照片发布版本；单相册内不重复选同一 Asset。统一资料与标签已迁移并接入开发环境，详见交付记录。
4. 发布必须沿父级自顶向下；任何祖先下线都会阻止整条后代分支被访问。恢复父级时提示会恢复访问的后代。
5. Gallery 文案、选片、层级和位置公开策略走发布流程；GPS 及依赖位置的地图/时间结果按当前来源更新，无需重发文案快照。
6. 按 ADR 0007，新建相册默认精确位置，照片跟随相册；已有设置保留。用户仍可选择隐藏或近似位置，近似模式规则见集成文档。
7. 相册首次发布后固定 slug。标题和父级可以修改，地址不随层级移动变化。
8. 站点基础配置采用“保存并应用”；首页暂缓，关于可选择已发布文章，未配置时保留旧展示；相册有完整草稿预览。
9. 资源所有者白名单为空时不能选片或公开图片；允许访问的 Immich 所有者在初始化时显式配置。

## 文档独立管理

- `docs/gallery/` 是 Gallery 文档的唯一主入口，独立于 Immich 官方文档目录 `docs/docs/`，本期不接入其 Docusaurus 站点。
- 正式开发后与 Gallery 代码一起进入产品分支；不会为了更新 Gallery 文档修改上游文档导航。
- 文档分别标记“待确认／已确认／已实现”，产品范围与交付状态分开记录。
- 架构变更新增编号决策，保留被替代决策；需求、数据字典、迁移和验证说明在同一个功能变更中同步更新。
- 迁移文件是结构执行依据，数据字典负责解释设计。数据库变更必须同时更新这两处。
- 不记录密码、会话令牌、生产密钥或真实私有资产清单。示例使用虚构内容。
- 前次的 [Immich 数据字典](../docs/developer/database-schema-reference.zh-CN.md) 保留为上游结构参考；Gallery 表只在本目录说明。
- 初始化、测试、部署、备份恢复与升级操作手册在相关功能实现时补充实际可执行步骤。本轮计划中的未来命令不是已验证脚本。

## 当前交付状态摘要

| 范围 | 目前状态与依据 |
|---|---|
| 基础架构、发布与权限 | 前后台真实数据与生产运行；当前迁移 0001–0018 |
| 相册、相片、照片组 | 共享资料、独立发布、连续浏览、筛选与直链已实现 |
| 文章 | 富文本、表格、图片组、独立素材、保存反馈、发布快照、关于选篇已实现 |
| 地点与到访 | 世界与中国省级地图、地点核对、国家/省级到访整理已实现 |
| 用户与互动 | 邮箱验证码、用户资料、评论审核与点赞上线；专项机器人防护按用户要求延期 |
| 作者信息与媒体 | Gallery 输出与 OSS 副本携带作者信息，保留 Immich 源文件；CDN 与证书维护已上线 |
| 拍摄时间 | 证据换算、人工可撤销确认、重新读取、自动刷新与确认复用已上线 |
| 开发与生产 | Immich v3.3.3 基线已验证；生产服务本次正常；本地 Immich API 尚需排查，见当前状态 |
| 恢复保障 | 有历史隔离恢复和服务器检查点；持续异机备份未在本次验证，现有备份脚本有覆盖缺口 |

当前一级导航为相册、相片、去过、记录、关于，独立首页暂缓。早期“地图移出 MVP”和“公众用户后续实现”的范围已被后续 ADR 替代。

相册、照片和照片组说明使用 Markdown；文章使用受限结构的 Tiptap 富文本；访客评论只有纯文字。这三类内容协议不同，不能为了复用编辑器混为一体。`/design/*` 使用样例，不自动写入真实内容。文章素材须随数据库一起备份。

所有已验收、已上线与尚未验证的边界，继续在相应交付记录中按日期记录。最新全局接续情况见[当前状态](handoff/current-state.md)。
