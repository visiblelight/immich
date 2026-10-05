# 地点词典与筛选数据字典

迁移：`0012_places_and_tag_visibility.sql`。两张新增 Gallery 表，无 Immich 外键，不修改 Immich 数据或媒体。

| 表 | 字段 | 含义与约束 |
|---|---|---|
| place_label | id text PK，1–80字符 | 稳定编号：country:AM、region:616051、city:616052 |
| place_label | name_zh、name_en text NOT NULL DEFAULT ''，各≤120 | 空值使用离线名称 |
| place_label | aliases text[] NOT NULL DEFAULT '{}' | 服务限制≤30项、每项≤120字符 |
| place_label | canonical_id text nullable | 同国家同级合并目标；服务阻止循环，清空解除合并 |
| place_label | version bigint DEFAULT 1；updated_at timestamptz | 乐观锁与更新时间 |
| photo_place | asset_id uuid PK | 外部资源身份，无跨 schema 外键 |
| photo_place | place_id text NOT NULL | 仅允许当前 GPS 国家内的地点 |
| photo_place | latitude、longitude double precision | 确认时坐标指纹，各限制 [-90,90]、[-180,180]；不作为展示 GPS 来源 |
| photo_place | version bigint DEFAULT 1；updated_at timestamptz | 乐观锁与更新时间 |

gallery_admin 可维护两表，服务校验管理员身份、site 行锁、来源授权及乐观版本，并写 audit_event。公开角色无基础表读写权限。

`public_place_label` 为只读 security-barrier 词典视图，不含照片坐标。`published_photo_place_source` 以 published_photo 为访问门槛，再接来源元数据；city/state 只在精确模式输出，人工归属还须匹配当前坐标。祖先发布、来源范围及资源状态检查全部保留。

词典和空间格网首次使用时加载；照片归属每次从实时来源推导，请求内缓存重复判断。单相册只读取当前册，避免全库解析。合并前 URL 解析到目标编号。

feed 先从合资格照片中按 Asset 去重，生成筛选证据与候选，最后分页48张。跨册位置取最保守模式；任一公开关联不展示 EXIF 时，去重结果不进入设备筛选。当前用于个人作品图库，未验收十万级作品的多维聚合容量。

0012 同时重建 article_source_photo 的标签投影和 published_tag，仅输出 active 标签，不删除 photo_tag/photo_release_tag。

离线数据许可和复现步骤见 [数据说明](../../../packages/gallery-db/data/places-README.md)。
