# 去过：数据与接口设计草案

状态：产品规则已确认；以下结构为实施设计，尚未迁移或接入运行库。依据 ADR 0006。

## 权威数据与派生数据

| 数据 | 存放方式 | 约束 |
| --- | --- | --- |
| 原创抽象国家轮廓、共享边、标签、海域 | packages/gallery-public 内版本化静态模块 | 只用于展示，不参与 GPS 判断 |
| 真实国家边界及归属口径 | 后续固定来源、版本、许可的服务端资源 | 覆盖小国、岛屿与跨日期变更线；边界歧义显式处理 |
| 可公开照片与当前位置 | gallery.published_photo 动态查询 | 现有权限与近似规则不变，全站按 Asset 去重 |
| 国家与到访统计 | 可重建服务端派生结果 | 不放入发布快照，不以缓存绕过授权 |
| 底图配置 | 拟新增 gallery.map_provider_config | 管理员读写；公网站点只读不含秘密的启用配置 |
| 到访校正 | 拟新增 gallery.visit_override / gallery.visit_override_asset | 管理员操作，证据关联不赋予照片公开资格 |

## 待实施字段

map_provider_config：provider（osm/google/amap 主键）、enabled、is_default、public_options（限制字段的 JSON）、secret_reference 或 encrypted_secret、updated_at、updated_by。数据库约束最多一个启用默认项；不把检查成功视为永久可用。精确的密钥存储方式在现有部署密钥机制核对后落定，不用明文列临时顶替。

visit_override：id、country_code、start_local_date、end_local_date、label、revision、created_at、updated_at、updated_by。日期范围有序；修改使用版本检查避免覆盖并发编辑。

visit_override_asset：override_id、asset_id（联合主键），同一国家下同 Asset 不可分配到两条人工记录。只保存稳定 Asset 引用，不保存原始 GPS；证据被移除或改到其他国家后标记待核对。后台修正不能把隐藏照片的数量、日期或名称带到公开结果。

先验证动态查询成本，再决定是否添加物化国家索引；不预先安装 PostGIS 或写入 Immich 空间索引。正式迁移前把确定结构加入完整数据字典，与迁移一并检查角色权限。

## 拟定接口边界

- 世界摘要：国家标识、去重数量、推导到访时间段及不确定标记，不输出全图库坐标或 Asset 原始 ID。
- 国家聚合：国家标识、WGS84 bbox、缩放级别、可选到访标识，返回完整计数的有限聚合点。
- 聚合成员：分页返回授权 Gallery 相册/照片入口；同点照片不能静默截断。
- 地图服务配置：只返回已启用服务及所需的公开字段，私有密钥永不进入此接口。
- 到访校正：仅后台角色，合并/拆分基于当前证据；公开读取时再次关联当前有效照片。

## 已知现有基础

packages/gallery-db/src/map.server.ts 已有 bbox/zoom/可选 albumId 的服务端网格聚合，使用当前 published_photo，先保守去重再边界筛选。尚缺国家过滤、到访过滤、缩略图代表、分页成员与页面接入。本阶段不宣称这些已完成。
