# 去过：数据与接口

状态：2026-09-12，区域样稿确认后实施；0006 已隔离验证并迁移本地开发库。Google/高德需真实 Key 联调。

## 数据来源

原创世界轮廓由 Gallery 内的 cartogram-layout、regional-waters、generate-world-map 生成，195项清单来自自有 tickoff 原型。仅作展示，不使用 world-ex 几何或代码。

国家判定使用 Natural Earth v5.1.2 的10m边界，固定来源、SHA256、公共领域许可及分组方式见 packages/gallery-db/data。点在国界、争议重叠、海域或近似网格横跨国界时保持未知。查找按5度网格和边段索引加速，只缓存坐标→国家，不缓存公开资格或行程。几何概括无法保证每个海岸及争议地区的精确判定。

每次请求在 repeatable-read 事务中查询当前 published_photo，按 Asset 去重、优先较保守精度，再分类。公开摘要不包含 Asset UUID。国家照片聚合与代表文案在同一读取事务中；照片媒体继续走已有独立授权管线。跨日期变更线 bbox 和分页均受控；聚合计数没有静默截断。

到访按可靠拍摄时刻排序、当地日期展示。未知时区或时间单独标为待确认；超过阈值（默认30天）或间隔中出现可靠异国证据则拆分。同时间的异国证据不会因输入次序误拆。人工校正关联 Asset 身份，照片 GPS 移国、失效或撤回后再校验；不保存 GPS 快照。部分失效时隐藏人工名称并重算剩余证据日期，全部失效时不公开，后台可清除或重新整理。

## 表与接口

四张新表：map_settings、map_provider_config、visit_override、visit_override_asset。确定字段、外键、索引与权限见完整数据字典的0006章节；此前 public_options/secret_reference 等是设计候选，已由明确列与 AES-256-GCM 密文替代。

- `/visited`：世界摘要与完整抽象地图。
- `/visited/[country]`：国家照片地图、到访筛选、可用底图选择。
- `/api/visited/[country]`：可选 west/south/east/north/zoom、visit、cluster、page；聚合点和分页成员。每页48张，只返回授权 Gallery 入口及公开处理后的坐标。
- `/albums/[slug]/photos/[photoId]?returnTo=...`：复用照片及照片组查看器。returnTo只接受站内国家地图格式；关闭后保留URL内地区、缩放、底图和到访筛选。
- 后台 `/maps`、`/visits`；认证 API map-settings、visits、visit-save、visit-delete，保留原有 CSRF、独立账户与会话边界。

## 底图与秘密

OSM 使用官方HTTPS瓦片与署名链接，不离线预取；MapLibre6.9.0官方ESM以固定文件及许可存放，避免安装包影响共用的 Immich 开发依赖。地图页面发送 strict-origin-when-cross-origin Referer，以支持瓦片政策和服务商域名限制。只加载访客选中的服务。

Google Maps JS API接收WGS84；高德通过官方convertFrom进行转换，视口及中心使用迭代反向求解，还原到WGS84查询，失败时明确提示切换底图。没有使用“矩形范围内全部算中国”的偏移捷径；海外坐标也交由官方转换处理。代码已有实现，国内外实际控制点精度仍需真实 Key 验证。Google当前使用官方DEMO_MAP_ID作为默认标记地图标识，正式Google部署应替换为自有Cloud Map ID并联调。

高德securityJsCode由服务器AES-256-GCM加密保存，32字节十六进制主密钥由public/admin各自环境文件提供同一值；禁止进入浏览器环境。`/_AMapService/`代理仅允许样式、海外矢量及坐标转换三个固定官方目标路径，校验当前配置Key和来源，限制并发、请求频率、超时、响应尺寸，替换安全码且不转发浏览器cookie。通用路线、搜索等接口不开放。需要新增高德功能时应先确认对应官方代理路径。
