# Immich 数据库表结构与设计说明

> 本文档根据当前源码表声明和正在运行的 PostgreSQL 实例自动整理。它用于理解设计与只读排查，不应作为直接修改生产数据库的操作手册。

- 源码提交：`469a870a2`
- 生成日期：`2026-09-08T09:19:20.780Z`
- 数据库：`PostgreSQL / immich`
- 基础表数量：71
- 字段数量：503

## 阅读指南

Immich 采用“关系数据库保存元数据与路径，文件系统保存真实媒体文件”的分层设计。核心 `asset` 表不保存图片二进制；原图路径在 `asset.originalPath`，缩略图、预览图和转码视频路径在 `asset_file.path`。相册和资产通过 `album_asset` 建立多对多关系。

```text
user ──< album_user >── album ──< album_asset >── asset
  │                         │                    ├── asset_exif
  │                         └── shared_link      ├── asset_file
  ├── library                                   ├── asset_face ── person_group ── person
  ├── session                                   ├── asset_metadata
  ├── api_key                                   ├── asset_ocr / smart_search
  └── workflow ──< workflow_step >── plugin_method
```

字段定义中的“默认值”来自当前 PostgreSQL，而不是 TypeScript 的表面类型。`updateId`/`createId` 是 UUIDv7 同步游标；`*_audit` 表主要是删除墓碑，不是面向管理员的操作审计日志。

## 表目录

- **用户、认证与协作**：`user`、`user_metadata`、`session`、`api_key`、`partner`、`cluster_group`、`cluster_group_request`
- **图库与媒体资产**：`library`、`asset`、`asset_file`、`asset_exif`、`asset_audio`、`asset_video`、`asset_keyframe`、`asset_job_status`、`asset_metadata`、`asset_edit`、`move_history`、`integrity_report`
- **相册、分享与互动**：`album`、`album_user`、`album_asset`、`activity`、`shared_link`、`shared_link_asset`
- **人物、人脸、搜索与标签**：`person_group`、`person`、`asset_face`、`face_search`、`smart_search`、`asset_ocr`、`ocr_search`、`tag`、`tag_asset`、`tag_closure`
- **回忆与通知**：`memory`、`memory_asset`、`notification`
- **视频实时转码**：`video_stream_session`、`video_stream_variant`、`video_stream_segment`
- **插件与工作流**：`plugin`、`plugin_method`、`workflow`、`workflow_step`、`workflow_log`
- **同步、地理与系统状态**：`session_sync_checkpoint`、`system_metadata`、`version_history`、`geodata_places`、`naturalearth_countries`
- **删除审计与同步墓碑**：`user_audit`、`user_metadata_audit`、`partner_audit`、`album_audit`、`album_user_audit`、`album_asset_audit`、`asset_audit`、`asset_edit_audit`、`asset_metadata_audit`、`asset_face_audit`、`asset_ocr_audit`、`person_audit`、`person_group_audit`、`stack_audit`、`memory_audit`、`memory_asset_audit`
- **资产堆叠**：`stack`
- **数据库迁移基础设施**：`kysely_migrations`、`kysely_migrations_lock`、`migration_overrides`

## 用户、认证与协作

### `user`

**用途：** 保存 Immich 用户账号、认证标识、管理员状态、配额、存储标签和人脸聚类组。

**源码：** [user.table.ts](../../../server/src/schema/tables/user.table.ts#L20)

| 字段名称 | 字段定义 | 详细描述 |
|---|---|---|
| `id` | `uuid；非空；默认 uuid_generate_v4()；主键` | 表内主键，用于稳定引用该记录；外部关系通常通过此值建立。 |
| `email` | `character varying；非空；唯一` | 用户登录邮箱，在实例内唯一。 |
| `password` | `character varying；可空` | 经过安全哈希处理的密码；绝不保存明文。 |
| `createdAt` | `timestamp with time zone；非空；默认 now()` | 记录创建时间，由数据库在插入时自动生成。 |
| `profileImagePath` | `character varying；非空；默认 ''::character varying` | 用户头像文件在媒体存储中的路径。 |
| `isAdmin` | `boolean；非空；默认 false` | 用户是否拥有实例管理员权限。 |
| `shouldChangePassword` | `boolean；非空；默认 true` | 是否要求用户下次登录时修改密码。 |
| `deletedAt` | `timestamp with time zone；可空` | 软删除或删除审计时间；非空通常表示业务对象已删除。 |
| `oauthId` | `character varying；非空；默认 ''::character varying` | 外部 OAuth/OIDC 身份提供方中的用户标识。 |
| `updatedAt` | `timestamp with time zone；非空；默认 now()` | 记录最后更新时间，通常由 updated_at 触发器自动维护。 |
| `storageLabel` | `character varying；可空；唯一` | 用于生成该用户媒体目录的稳定、可读存储标签。 |
| `name` | `character varying；非空；默认 ''::character varying` | 用户显示名称。 |
| `quotaSizeInBytes` | `bigint；可空` | 管理员为用户设置的存储配额上限，单位字节；为空表示不限制。 |
| `quotaUsageInBytes` | `bigint；非空；默认 0` | 当前计入配额的已用空间，单位字节。 |
| `status` | `character varying；非空；默认 'active'::character varying` | 记录当前生命周期或处理状态。 |
| `profileChangedAt` | `timestamp with time zone；非空；默认 now()` | 用户资料或头像最近变化时间，用于客户端缓存失效。 |
| `updateId` | `uuid；非空；默认 immich_uuid_v7()` | 用于增量同步排序和变更检测的 UUIDv7；每次记录变化时更新。 |
| `avatarColor` | `character varying；可空` | 没有头像时使用的默认头像颜色。 |
| `pinCode` | `character varying；可空` | 用户 PIN 的安全表示；为空表示未配置。 |
| `clusterGroupId` | `uuid；非空；外键 → cluster_group.id` | 关联人脸聚类共享组的标识。 |

**表级约束：**

- 外键 `user_clusterGroupId_fkey`：`FOREIGN KEY ("clusterGroupId") REFERENCES cluster_group(id) ON UPDATE CASCADE`
- 唯一约束 `user_email_uq`：`UNIQUE (email)`
- 主键 `user_pkey`：`PRIMARY KEY (id)`
- 唯一约束 `user_storageLabel_uq`：`UNIQUE ("storageLabel")`

### `user_metadata`

**用途：** 保存用户级可扩展 JSON 元数据，例如偏好或系统附加状态。

**源码：** [user-metadata.table.ts](../../../server/src/schema/tables/user-metadata.table.ts#L18)

| 字段名称 | 字段定义 | 详细描述 |
|---|---|---|
| `userId` | `uuid；非空；联合主键；外键 → user.id` | 关联用户账号的标识。 |
| `key` | `character varying；非空；联合主键` | 用户元数据键；与 userId 共同组成主键。 |
| `value` | `jsonb；非空` | 该用户元数据键对应的 JSON 值。 |
| `updateId` | `uuid；非空；默认 immich_uuid_v7()` | 用于增量同步排序和变更检测的 UUIDv7；每次记录变化时更新。 |
| `updatedAt` | `timestamp with time zone；非空；默认 now()` | 记录最后更新时间，通常由 updated_at 触发器自动维护。 |

**表级约束：**

- 主键 `user_metadata_pkey`：`PRIMARY KEY ("userId", key)`
- 外键 `user_metadata_userId_fkey`：`FOREIGN KEY ("userId") REFERENCES "user"(id) ON UPDATE CASCADE ON DELETE CASCADE`

### `session`

**用途：** 保存 Web/移动端登录会话、设备信息、刷新令牌摘要、OAuth 会话信息和同步状态。

**源码：** [session.table.ts](../../../server/src/schema/tables/session.table.ts#L14)

| 字段名称 | 字段定义 | 详细描述 |
|---|---|---|
| `id` | `uuid；非空；默认 uuid_generate_v4()；主键` | 表内主键，用于稳定引用该记录；外部关系通常通过此值建立。 |
| `token` | `bytea；非空` | 会话刷新令牌的安全摘要，用于验证而不是还原原令牌。 |
| `createdAt` | `timestamp with time zone；非空；默认 now()` | 记录创建时间，由数据库在插入时自动生成。 |
| `updatedAt` | `timestamp with time zone；非空；默认 now()` | 记录最后更新时间，通常由 updated_at 触发器自动维护。 |
| `userId` | `uuid；非空；外键 → user.id` | 关联用户账号的标识。 |
| `deviceType` | `character varying；非空；默认 ''::character varying` | 创建会话的客户端设备类别。 |
| `deviceOS` | `character varying；非空；默认 ''::character varying` | 创建会话的操作系统说明。 |
| `updateId` | `uuid；非空；默认 immich_uuid_v7()` | 用于增量同步排序和变更检测的 UUIDv7；每次记录变化时更新。 |
| `pinExpiresAt` | `timestamp with time zone；可空` | PIN 的失效时间。 |
| `expiresAt` | `timestamp with time zone；可空` | 会话、分享链接或播放会话的失效时间。 |
| `parentId` | `uuid；可空；外键 → session.id` | 创建该会话时所使用的父会话；用于组织派生会话，父会话删除时子会话也会级联删除。 |
| `isPendingSyncReset` | `boolean；非空；默认 false` | 是否要求客户端丢弃同步检查点并进行一次完整同步。 |
| `appVersion` | `character varying；可空` | 创建或最近使用该会话的客户端版本。 |
| `oauthSid` | `character varying；可空` | OIDC 会话标识，用于后端退出等流程。 |
| `oauthBearerToken` | `character varying；可空` | OAuth Bearer Token 的受保护存储值。 |

**表级约束：**

- 外键 `session_parentId_fkey`：`FOREIGN KEY ("parentId") REFERENCES session(id) ON UPDATE CASCADE ON DELETE CASCADE`
- 主键 `session_pkey`：`PRIMARY KEY (id)`
- 外键 `session_userId_fkey`：`FOREIGN KEY ("userId") REFERENCES "user"(id) ON UPDATE CASCADE ON DELETE CASCADE`

### `api_key`

**用途：** 保存用户创建的 API Key、名称和细粒度权限集合；数据库中保存的是不可逆密钥摘要。

**源码：** [api-key.table.ts](../../../server/src/schema/tables/api-key.table.ts#L15)

| 字段名称 | 字段定义 | 详细描述 |
|---|---|---|
| `name` | `character varying；非空` | 用户为 API Key 设置的可读名称。 |
| `key` | `bytea；非空` | API Key 的密码学摘要，用于验证调用方提交的原始密钥。 |
| `userId` | `uuid；非空；外键 → user.id` | 关联用户账号的标识。 |
| `createdAt` | `timestamp with time zone；非空；默认 now()` | 记录创建时间，由数据库在插入时自动生成。 |
| `updatedAt` | `timestamp with time zone；非空；默认 now()` | 记录最后更新时间，通常由 updated_at 触发器自动维护。 |
| `id` | `uuid；非空；默认 uuid_generate_v4()；主键` | 表内主键，用于稳定引用该记录；外部关系通常通过此值建立。 |
| `permissions` | `character varying[]；非空` | API Key 被授予的权限代码集合，遵循最小权限原则。 |
| `updateId` | `uuid；非空；默认 immich_uuid_v7()` | 用于增量同步排序和变更检测的 UUIDv7；每次记录变化时更新。 |

**表级约束：**

- 主键 `api_key_pkey`：`PRIMARY KEY (id)`
- 外键 `api_key_userId_fkey`：`FOREIGN KEY ("userId") REFERENCES "user"(id) ON UPDATE CASCADE ON DELETE CASCADE`

### `partner`

**用途：** 保存用户之间的伙伴图库共享方向与是否把对方资产混入时间线的设置。

**源码：** [partner.table.ts](../../../server/src/schema/tables/partner.table.ts#L15)

| 字段名称 | 字段定义 | 详细描述 |
|---|---|---|
| `sharedById` | `uuid；非空；联合主键；外键 → user.id` | 发起伙伴图库共享的用户标识。 |
| `sharedWithId` | `uuid；非空；联合主键；外键 → user.id` | 接收伙伴图库共享的用户标识。 |
| `createdAt` | `timestamp with time zone；非空；默认 now()` | 记录创建时间，由数据库在插入时自动生成。 |
| `updatedAt` | `timestamp with time zone；非空；默认 now()` | 记录最后更新时间，通常由 updated_at 触发器自动维护。 |
| `inTimeline` | `boolean；非空；默认 false` | 是否将伙伴共享的资产合并显示在接收方时间线中。 |
| `updateId` | `uuid；非空；默认 immich_uuid_v7()` | 用于增量同步排序和变更检测的 UUIDv7；每次记录变化时更新。 |
| `createId` | `uuid；非空；默认 immich_uuid_v7()` | 用于增量同步表示创建事件的 UUIDv7。 |

**表级约束：**

- 主键 `partner_pkey`：`PRIMARY KEY ("sharedById", "sharedWithId")`
- 外键 `partner_sharedById_fkey`：`FOREIGN KEY ("sharedById") REFERENCES "user"(id) ON DELETE CASCADE`
- 外键 `partner_sharedWithId_fkey`：`FOREIGN KEY ("sharedWithId") REFERENCES "user"(id) ON DELETE CASCADE`

### `cluster_group`

**用途：** 把多个用户放入同一人脸聚类共享域，使组内用户可以基于统一人物分组重新生成人脸结果。

**源码：** [cluster-group.table.ts](../../../server/src/schema/tables/cluster-group.table.ts#L12)

| 字段名称 | 字段定义 | 详细描述 |
|---|---|---|
| `id` | `uuid；非空；默认 uuid_generate_v4()；主键` | 表内主键，用于稳定引用该记录；外部关系通常通过此值建立。 |
| `name` | `character varying；可空` | 聚类共享组的可选显示名称。 |
| `createdAt` | `timestamp with time zone；非空；默认 now()` | 记录创建时间，由数据库在插入时自动生成。 |
| `updatedAt` | `timestamp with time zone；非空；默认 now()` | 记录最后更新时间，通常由 updated_at 触发器自动维护。 |
| `updateId` | `uuid；非空；默认 immich_uuid_v7()` | 用于增量同步排序和变更检测的 UUIDv7；每次记录变化时更新。 |

**表级约束：**

- 主键 `cluster_group_pkey`：`PRIMARY KEY (id)`

### `cluster_group_request`

**用途：** 保存邀请某用户加入人脸聚类共享组的待处理请求。

**源码：** [cluster-group-request.table.ts](../../../server/src/schema/tables/cluster-group-request.table.ts#L13)

| 字段名称 | 字段定义 | 详细描述 |
|---|---|---|
| `id` | `uuid；非空；默认 uuid_generate_v4()；主键` | 表内主键，用于稳定引用该记录；外部关系通常通过此值建立。 |
| `clusterGroupId` | `uuid；非空；外键 → cluster_group.id；联合唯一` | 关联人脸聚类共享组的标识。 |
| `userId` | `uuid；非空；联合唯一；外键 → user.id` | 关联用户账号的标识。 |
| `createdAt` | `timestamp with time zone；非空；默认 now()` | 记录创建时间，由数据库在插入时自动生成。 |

**表级约束：**

- 外键 `cluster_group_request_clusterGroupId_fkey`：`FOREIGN KEY ("clusterGroupId") REFERENCES cluster_group(id) ON UPDATE CASCADE ON DELETE CASCADE`
- 唯一约束 `cluster_group_request_clusterGroupId_userId_uq`：`UNIQUE ("clusterGroupId", "userId")`
- 主键 `cluster_group_request_pkey`：`PRIMARY KEY (id)`
- 外键 `cluster_group_request_userId_fkey`：`FOREIGN KEY ("userId") REFERENCES "user"(id) ON UPDATE CASCADE ON DELETE CASCADE`

## 图库与媒体资产

### `library`

**用途：** 定义外部图库及其导入路径、排除规则、所有者和最近扫描时间。

**源码：** [library.table.ts](../../../server/src/schema/tables/library.table.ts#L15)

| 字段名称 | 字段定义 | 详细描述 |
|---|---|---|
| `id` | `uuid；非空；默认 uuid_generate_v4()；主键` | 表内主键，用于稳定引用该记录；外部关系通常通过此值建立。 |
| `name` | `character varying；非空` | 业务对象的人类可读名称。 |
| `ownerId` | `uuid；非空；外键 → user.id` | 拥有该业务对象或媒体资产的用户标识。 |
| `importPaths` | `text[]；非空` | 外部图库扫描的一个或多个根目录。 |
| `exclusionPatterns` | `text[]；非空` | 扫描外部图库时要排除的 glob/路径模式。 |
| `createdAt` | `timestamp with time zone；非空；默认 now()` | 记录创建时间，由数据库在插入时自动生成。 |
| `updatedAt` | `timestamp with time zone；非空；默认 now()` | 记录最后更新时间，通常由 updated_at 触发器自动维护。 |
| `deletedAt` | `timestamp with time zone；可空` | 软删除或删除审计时间；非空通常表示业务对象已删除。 |
| `refreshedAt` | `timestamp with time zone；可空` | 外部图库最近完成扫描刷新的时间。 |
| `updateId` | `uuid；非空；默认 immich_uuid_v7()` | 用于增量同步排序和变更检测的 UUIDv7；每次记录变化时更新。 |

**表级约束：**

- 外键 `library_ownerId_fkey`：`FOREIGN KEY ("ownerId") REFERENCES "user"(id) ON UPDATE CASCADE ON DELETE CASCADE`
- 主键 `library_pkey`：`PRIMARY KEY (id)`

### `asset`

**用途：** Immich 的核心媒体实体，表示一张照片、视频、音频或其他文件；保存所有者、原文件路径、时间线信息、校验和、可见性及尺寸等。

**源码：** [asset.table.ts](../../../server/src/schema/tables/asset.table.ts#L23)

| 字段名称 | 字段定义 | 详细描述 |
|---|---|---|
| `id` | `uuid；非空；默认 uuid_generate_v4()；主键` | 表内主键，用于稳定引用该记录；外部关系通常通过此值建立。 |
| `ownerId` | `uuid；非空；外键 → user.id` | 拥有该业务对象或媒体资产的用户标识。 |
| `type` | `character varying；非空` | 记录的业务类型；可选值由所属领域的枚举定义。 |
| `originalPath` | `character varying；非空` | 原始媒体文件在 Immich 容器文件系统中的规范路径；数据库只存路径，不存文件内容。 |
| `fileCreatedAt` | `timestamp with time zone；非空` | 文件对应的真实拍摄/创建时刻，用于时间线精确排序。 |
| `fileModifiedAt` | `timestamp with time zone；非空` | 原始文件在文件系统中的最后修改时间。 |
| `isFavorite` | `boolean；非空；默认 false` | 是否被当前所有者标记为收藏。 |
| `duration` | `integer；可空` | 视频、GIF 或音频时长；静态图片通常为空，单位由当前模型定义。 |
| `checksum` | `bytea；非空` | 原始文件内容或外部路径的 SHA-1 校验值，用于去重和完整性校验。 |
| `livePhotoVideoId` | `uuid；可空；外键 → asset.id` | Live Photo 配对视频对应的另一条 asset 记录。 |
| `updatedAt` | `timestamp with time zone；非空；默认 now()` | 记录最后更新时间，通常由 updated_at 触发器自动维护。 |
| `createdAt` | `timestamp with time zone；非空；默认 now()` | 记录创建时间，由数据库在插入时自动生成。 |
| `originalFileName` | `character varying；非空` | 原始媒体文件名，保留上传或导入时的名称。 |
| `thumbhash` | `bytea；可空` | 紧凑的模糊占位图二进制，用于缩略图加载前的低清预览。 |
| `isOffline` | `boolean；非空；默认 false` | 外部资产当前是否无法从其文件路径访问。 |
| `libraryId` | `uuid；可空；外键 → library.id` | 关联外部图库；为空表示由 Immich 自己管理的上传资产。 |
| `isExternal` | `boolean；非空；默认 false` | 资产是否来自外部图库，而非由 Immich 上传目录管理。 |
| `deletedAt` | `timestamp with time zone；可空` | 软删除或删除审计时间；非空通常表示业务对象已删除。 |
| `localDateTime` | `timestamp with time zone；非空` | 摄影者所在地的本地拍摄时间，用于按本地日/月对时间线分桶。 |
| `stackId` | `uuid；可空；外键 → stack.id` | 关联资产堆叠；为空表示资产不属于堆叠。 |
| `duplicateId` | `uuid；可空` | 重复资产分组标识；相同值表示被判定为同一组重复项。 |
| `status` | `assets_status_enum；非空；默认 'active'::assets_status_enum` | 记录当前生命周期或处理状态。 |
| `updateId` | `uuid；非空；默认 immich_uuid_v7()` | 用于增量同步排序和变更检测的 UUIDv7；每次记录变化时更新。 |
| `visibility` | `asset_visibility_enum；非空；默认 'timeline'::asset_visibility_enum` | 资产在时间线、归档或锁定区域中的可见性状态。 |
| `width` | `integer；可空` | 媒体像素宽度。 |
| `height` | `integer；可空` | 媒体像素高度。 |
| `isEdited` | `boolean；非空；默认 false` | 资产是否存在并使用非破坏性编辑结果。 |
| `checksumAlgorithm` | `asset_checksum_algorithm_enum；非空` | 说明 checksum 的计算方式，例如文件内容 SHA-1 或已弃用的路径 SHA-1。 |

**表级约束：**

- 外键 `asset_libraryId_fkey`：`FOREIGN KEY ("libraryId") REFERENCES library(id) ON UPDATE CASCADE ON DELETE CASCADE`
- 外键 `asset_livePhotoVideoId_fkey`：`FOREIGN KEY ("livePhotoVideoId") REFERENCES asset(id) ON UPDATE CASCADE ON DELETE SET NULL`
- 外键 `asset_ownerId_fkey`：`FOREIGN KEY ("ownerId") REFERENCES "user"(id) ON UPDATE CASCADE ON DELETE CASCADE`
- 主键 `asset_pkey`：`PRIMARY KEY (id)`
- 外键 `asset_stackId_fkey`：`FOREIGN KEY ("stackId") REFERENCES stack(id) ON UPDATE CASCADE ON DELETE SET NULL`

### `asset_file`

**用途：** 保存由原始资产派生或伴随的文件路径，例如缩略图、预览图、RAW 全尺寸转换图、Sidecar 和转码视频。

**源码：** [asset-file.table.ts](../../../server/src/schema/tables/asset-file.table.ts#L16)

| 字段名称 | 字段定义 | 详细描述 |
|---|---|---|
| `id` | `uuid；非空；默认 uuid_generate_v4()；主键` | 表内主键，用于稳定引用该记录；外部关系通常通过此值建立。 |
| `assetId` | `uuid；非空；外键 → asset.id；联合唯一` | 关联核心 asset 资产记录的标识。 |
| `createdAt` | `timestamp with time zone；非空；默认 now()` | 记录创建时间，由数据库在插入时自动生成。 |
| `updatedAt` | `timestamp with time zone；非空；默认 now()` | 记录最后更新时间，通常由 updated_at 触发器自动维护。 |
| `type` | `character varying；非空；联合唯一` | 派生文件类型：fullsize、preview、thumbnail、sidecar 或 encoded_video。 |
| `path` | `character varying；非空` | 该派生文件在媒体存储中的路径。 |
| `updateId` | `uuid；非空；默认 immich_uuid_v7()` | 用于增量同步排序和变更检测的 UUIDv7；每次记录变化时更新。 |
| `isEdited` | `boolean；非空；默认 false；联合唯一` | 资产是否存在并使用非破坏性编辑结果。 |
| `isProgressive` | `boolean；非空；默认 false` | 控制或记录 isProgressive 状态的布尔值。 |
| `isTransparent` | `boolean；非空；默认 false` | 控制或记录 isTransparent 状态的布尔值。 |

**表级约束：**

- 外键 `asset_file_assetId_fkey`：`FOREIGN KEY ("assetId") REFERENCES asset(id) ON UPDATE CASCADE ON DELETE CASCADE`
- 唯一约束 `asset_file_assetId_type_isEdited_uq`：`UNIQUE ("assetId", type, "isEdited")`
- 主键 `asset_file_pkey`：`PRIMARY KEY (id)`

### `asset_exif`

**用途：** 资产的一对一摄影与媒体元数据表，保存相机、镜头、曝光、GPS、地点、色彩、评分和标签等。

**源码：** [asset-exif.table.ts](../../../server/src/schema/tables/asset-exif.table.ts#L15)

| 字段名称 | 字段定义 | 详细描述 |
|---|---|---|
| `assetId` | `uuid；非空；外键 → asset.id；主键` | 关联核心 asset 资产记录的标识。 |
| `make` | `character varying；可空` | EXIF 相机制造商。 |
| `model` | `character varying；可空` | EXIF 相机型号。 |
| `exifImageWidth` | `integer；可空` | EXIF 报告的原始图像宽度。 |
| `exifImageHeight` | `integer；可空` | EXIF 报告的原始图像高度。 |
| `fileSizeInByte` | `bigint；可空` | 原始媒体文件大小，单位字节。 |
| `orientation` | `character varying；可空` | EXIF 图像方向标记。 |
| `dateTimeOriginal` | `timestamp with time zone；可空` | EXIF 原始拍摄时间。 |
| `modifyDate` | `timestamp with time zone；可空` | EXIF 记录的媒体修改时间。 |
| `lensModel` | `character varying；可空` | EXIF 镜头型号。 |
| `fNumber` | `double precision；可空` | 拍摄光圈的 F 值。 |
| `focalLength` | `double precision；可空` | 拍摄焦距，通常以毫米表示。 |
| `iso` | `integer；可空` | 拍摄 ISO 感光度。 |
| `latitude` | `double precision；可空` | 拍摄位置纬度。 |
| `longitude` | `double precision；可空` | 拍摄位置经度。 |
| `city` | `character varying；可空` | 反向地理编码得到的城市。 |
| `state` | `character varying；可空` | 反向地理编码得到的州、省或一级行政区。 |
| `country` | `character varying；可空` | 反向地理编码得到的国家或地区。 |
| `description` | `text；非空；默认 ''::text` | 面向用户或管理员的文字说明。 |
| `fps` | `double precision；可空` | 视频帧率。 |
| `exposureTime` | `character varying；可空` | 快门/曝光时间的可读表示。 |
| `livePhotoCID` | `character varying；可空` | 用于匹配 Live Photo 图像和视频的内容标识。 |
| `timeZone` | `character varying；可空` | 拍摄地点或 EXIF 推断的 IANA 时区。 |
| `projectionType` | `character varying；可空` | 全景媒体的投影类型。 |
| `profileDescription` | `character varying；可空` | 嵌入 ICC 色彩配置的说明。 |
| `colorspace` | `character varying；可空` | 媒体色彩空间名称。 |
| `bitsPerSample` | `integer；可空` | 每个颜色采样的位深。 |
| `autoStackId` | `character varying；可空` | 自动堆叠算法计算出的候选分组标识。 |
| `rating` | `integer；可空` | 来自 EXIF/XMP 的星级评分。 |
| `updatedAt` | `timestamp with time zone；非空；默认 clock_timestamp()` | 记录最后更新时间，通常由 updated_at 触发器自动维护。 |
| `updateId` | `uuid；非空；默认 immich_uuid_v7()` | 用于增量同步排序和变更检测的 UUIDv7；每次记录变化时更新。 |
| `lockedProperties` | `character varying[]；可空` | 被用户锁定、不应被后续元数据重新提取覆盖的属性列表。 |
| `tags` | `character varying[]；可空` | 从 EXIF/XMP 导入的原始文本标签数组。 |

**表级约束：**

- 外键 `asset_exif_assetId_fkey`：`FOREIGN KEY ("assetId") REFERENCES asset(id) ON DELETE CASCADE`
- 主键 `asset_exif_pkey`：`PRIMARY KEY ("assetId")`

### `asset_audio`

**用途：** 保存音频流或媒体音轨的探测结果，例如码率、流索引、编码器和 profile。

**源码：** [asset-av.table.ts](../../../server/src/schema/tables/asset-av.table.ts#L4)

| 字段名称 | 字段定义 | 详细描述 |
|---|---|---|
| `assetId` | `uuid；非空；外键 → asset.id；主键` | 关联核心 asset 资产记录的标识。 |
| `bitrate` | `integer；非空` | 音频或视频流码率，通常以 bit/s 表示。 |
| `index` | `smallint；非空` | 音频流在原始媒体容器中的流索引。 |
| `profile` | `smallint；可空` | 编解码器 profile，用于描述编码能力级别。 |
| `codecName` | `text；非空` | FFmpeg/ffprobe 识别的编码器短名称。 |

**表级约束：**

- 外键 `asset_audio_assetId_fkey`：`FOREIGN KEY ("assetId") REFERENCES asset(id) ON DELETE CASCADE`
- 主键 `asset_audio_pkey`：`PRIMARY KEY ("assetId")`

### `asset_video`

**用途：** 保存视频流探测信息，包括编码、码率、帧数、像素格式、HDR/Dolby Vision 与色彩参数。

**源码：** [asset-av.table.ts](../../../server/src/schema/tables/asset-av.table.ts#L22)

| 字段名称 | 字段定义 | 详细描述 |
|---|---|---|
| `assetId` | `uuid；非空；外键 → asset.id；主键` | 关联核心 asset 资产记录的标识。 |
| `bitrate` | `integer；非空` | 音频或视频流码率，通常以 bit/s 表示。 |
| `frameCount` | `integer；非空` | 视频流包含的帧数。 |
| `timeBase` | `integer；非空` | 媒体时间戳换算为秒所使用的时间基。 |
| `index` | `smallint；非空` | 视频流在原始媒体容器中的流索引。 |
| `profile` | `smallint；可空` | 编解码器 profile，用于描述编码能力级别。 |
| `level` | `smallint；可空` | 视频编码规范中的 Level，用于表示解码复杂度、分辨率和码率限制。 |
| `colorPrimaries` | `smallint；非空` | 视频色彩原色标准代码，例如 BT.709 或 BT.2020。 |
| `colorTransfer` | `smallint；非空` | 视频传递函数代码，例如 SDR、PQ 或 HLG。 |
| `colorMatrix` | `smallint；非空` | YUV/RGB 色彩矩阵系数代码。 |
| `dvProfile` | `smallint；可空` | Dolby Vision Profile。 |
| `dvLevel` | `smallint；可空` | Dolby Vision Level。 |
| `dvBlSignalCompatibilityId` | `smallint；可空` | Dolby Vision 基础层信号兼容性标识。 |
| `codecName` | `text；非空` | FFmpeg/ffprobe 识别的编码器短名称。 |
| `formatName` | `text；非空` | 容器格式短名称。 |
| `formatLongName` | `text；非空` | 容器格式完整可读名称。 |
| `pixelFormat` | `text；非空` | 视频像素格式，例如 yuv420p 或 yuv420p10le。 |

**表级约束：**

- 外键 `asset_video_assetId_fkey`：`FOREIGN KEY ("assetId") REFERENCES asset(id) ON DELETE CASCADE`
- 主键 `asset_video_pkey`：`PRIMARY KEY ("assetId")`

### `asset_keyframe`

**用途：** 保存视频关键帧及其时长/包统计，用于精确切片、转码和播放进度计算。

**源码：** [asset-av.table.ts](../../../server/src/schema/tables/asset-av.table.ts#L76)

| 字段名称 | 字段定义 | 详细描述 |
|---|---|---|
| `assetId` | `uuid；非空；外键 → asset.id；主键` | 关联核心 asset 资产记录的标识。 |
| `pts` | `integer[]；非空` | 关键帧的显示时间戳（presentation timestamp）。 |
| `accDuration` | `integer[]；非空` | 累积到该关键帧的媒体时长。 |
| `ownDuration` | `integer[]；非空` | 该关键帧区间自身的时长。 |
| `totalDuration` | `integer；非空` | 媒体总时长。 |
| `packetCount` | `integer；非空` | 关键帧区间包含的数据包数量。 |
| `outputFrames` | `integer；非空` | 处理该区间预计或实际输出的帧数。 |

**表级约束：**

- 外键 `asset_keyframe_assetId_fkey`：`FOREIGN KEY ("assetId") REFERENCES asset(id) ON DELETE CASCADE`
- 主键 `asset_keyframe_pkey`：`PRIMARY KEY ("assetId")`

### `asset_job_status`

**用途：** 记录每项资产的后台处理进度时间点，用来判断元数据、人脸、重复检测和 OCR 是否需要重新运行。

**源码：** [asset-job-status.table.ts](../../../server/src/schema/tables/asset-job-status.table.ts#L4)

| 字段名称 | 字段定义 | 详细描述 |
|---|---|---|
| `assetId` | `uuid；非空；外键 → asset.id；主键` | 关联核心 asset 资产记录的标识。 |
| `facesRecognizedAt` | `timestamp with time zone；可空` | 最近完成人脸识别任务的时间；为空表示尚未完成。 |
| `metadataExtractedAt` | `timestamp with time zone；可空` | 最近完成媒体元数据提取的时间。 |
| `duplicatesDetectedAt` | `timestamp with time zone；可空` | 最近完成重复项检测的时间。 |
| `ocrAt` | `timestamp with time zone；可空` | 最近完成 OCR 识别任务的时间。 |

**表级约束：**

- 外键 `asset_job_status_assetId_fkey`：`FOREIGN KEY ("assetId") REFERENCES asset(id) ON UPDATE CASCADE ON DELETE CASCADE`
- 主键 `asset_job_status_pkey`：`PRIMARY KEY ("assetId")`

### `asset_metadata`

**用途：** 可扩展的资产键值元数据表；用于存放不适合固化为 asset/asset_exif 列的 JSON 数据。

**源码：** [asset-metadata.table.ts](../../../server/src/schema/tables/asset-metadata.table.ts#L17)

| 字段名称 | 字段定义 | 详细描述 |
|---|---|---|
| `assetId` | `uuid；非空；外键 → asset.id；联合主键` | 关联核心 asset 资产记录的标识。 |
| `key` | `character varying；非空；联合主键` | 资产扩展元数据键；与 assetId 共同组成主键。 |
| `value` | `jsonb；非空` | 该元数据键对应的 JSON 值。 |
| `updateId` | `uuid；非空；默认 immich_uuid_v7()` | 用于增量同步排序和变更检测的 UUIDv7；每次记录变化时更新。 |
| `updatedAt` | `timestamp with time zone；非空；默认 now()` | 记录最后更新时间，通常由 updated_at 触发器自动维护。 |

**表级约束：**

- 外键 `asset_metadata_assetId_fkey`：`FOREIGN KEY ("assetId") REFERENCES asset(id) ON UPDATE CASCADE ON DELETE CASCADE`
- 主键 `asset_metadata_pkey`：`PRIMARY KEY ("assetId", key)`

### `asset_edit`

**用途：** 按顺序保存对资产执行的非破坏性编辑动作及参数，以便重放编辑链并生成编辑版本。

**源码：** [asset-edit.table.ts](../../../server/src/schema/tables/asset-edit.table.ts#L18)

| 字段名称 | 字段定义 | 详细描述 |
|---|---|---|
| `id` | `uuid；非空；默认 uuid_generate_v4()；主键` | 表内主键，用于稳定引用该记录；外部关系通常通过此值建立。 |
| `assetId` | `uuid；非空；外键 → asset.id；联合唯一` | 关联核心 asset 资产记录的标识。 |
| `action` | `character varying；非空` | 非破坏性编辑操作名称。 |
| `parameters` | `jsonb；非空` | 编辑动作的 JSON 参数。 |
| `sequence` | `integer；非空；联合唯一` | 同一资产编辑链中的执行顺序。 |
| `updatedAt` | `timestamp with time zone；非空；默认 now()` | 记录最后更新时间，通常由 updated_at 触发器自动维护。 |
| `updateId` | `uuid；非空；默认 immich_uuid_v7()` | 用于增量同步排序和变更检测的 UUIDv7；每次记录变化时更新。 |

**表级约束：**

- 外键 `asset_edit_assetId_fkey`：`FOREIGN KEY ("assetId") REFERENCES asset(id) ON UPDATE CASCADE ON DELETE CASCADE`
- 唯一约束 `asset_edit_assetId_sequence_uq`：`UNIQUE ("assetId", sequence)`
- 主键 `asset_edit_pkey`：`PRIMARY KEY (id)`

### `move_history`

**用途：** 记录存储模板迁移或文件整理过程中发生的旧路径到新路径映射，便于恢复和排错。

**源码：** [move.table.ts](../../../server/src/schema/tables/move.table.ts#L4)

| 字段名称 | 字段定义 | 详细描述 |
|---|---|---|
| `id` | `uuid；非空；默认 uuid_generate_v4()；主键` | 表内主键，用于稳定引用该记录；外部关系通常通过此值建立。 |
| `entityId` | `uuid；非空；联合唯一` | 发生文件移动的业务实体标识。 |
| `pathType` | `character varying；非空；联合唯一` | 被移动路径的类别，例如原图、缩略图或转码文件。 |
| `oldPath` | `character varying；非空` | 文件移动前的路径。 |
| `newPath` | `character varying；非空；唯一` | 文件移动后的路径。 |

**表级约束：**

- 唯一约束 `UQ_entityId_pathType`：`UNIQUE ("entityId", "pathType")`
- 唯一约束 `UQ_newPath`：`UNIQUE ("newPath")`
- 主键 `move_history_pkey`：`PRIMARY KEY (id)`

### `integrity_report`

**用途：** 记录文件系统完整性扫描发现的缺失文件、未跟踪文件或其他路径异常。

**源码：** [integrity-report.table.ts](../../../server/src/schema/tables/integrity-report.table.ts#L7)

| 字段名称 | 字段定义 | 详细描述 |
|---|---|---|
| `id` | `uuid；非空；默认 immich_uuid_v7()；主键` | 表内主键，用于稳定引用该记录；外部关系通常通过此值建立。 |
| `type` | `character varying；非空；联合唯一` | 完整性异常类型，例如缺失或未跟踪文件。 |
| `path` | `character varying；非空；联合唯一` | 文件系统路径或完整性报告涉及的路径。 |
| `createdAt` | `timestamp with time zone；非空；默认 now()` | 记录创建时间，由数据库在插入时自动生成。 |
| `assetId` | `uuid；可空；外键 → asset.id` | 关联核心 asset 资产记录的标识。 |
| `fileAssetId` | `uuid；可空；外键 → asset_file.id` | 关联发生完整性问题的 asset_file 派生文件记录。 |

**表级约束：**

- 外键 `integrity_report_assetId_fkey`：`FOREIGN KEY ("assetId") REFERENCES asset(id) ON UPDATE CASCADE ON DELETE CASCADE`
- 外键 `integrity_report_fileAssetId_fkey`：`FOREIGN KEY ("fileAssetId") REFERENCES asset_file(id) ON UPDATE CASCADE ON DELETE CASCADE`
- 主键 `integrity_report_pkey`：`PRIMARY KEY (id)`
- 唯一约束 `integrity_report_type_path_uq`：`UNIQUE (type, path)`

## 相册、分享与互动

### `album`

**用途：** 保存相册本身的名称、描述、封面、排序方式和软删除状态；成员与资产分别通过关联表维护。

**源码：** [album.table.ts](../../../server/src/schema/tables/album.table.ts#L16)

| 字段名称 | 字段定义 | 详细描述 |
|---|---|---|
| `id` | `uuid；非空；默认 uuid_generate_v4()；主键` | 表内主键，用于稳定引用该记录；外部关系通常通过此值建立。 |
| `albumName` | `character varying；非空；默认 'Untitled Album'::character varying` | 相册显示名称。 |
| `createdAt` | `timestamp with time zone；非空；默认 now()` | 记录创建时间，由数据库在插入时自动生成。 |
| `albumThumbnailAssetId` | `uuid；可空；外键 → asset.id` | 被选作相册封面的资产标识；封面资产删除时此字段会置空。 |
| `updatedAt` | `timestamp with time zone；非空；默认 now()` | 记录最后更新时间，通常由 updated_at 触发器自动维护。 |
| `description` | `text；可空` | 面向用户或管理员的文字说明。 |
| `deletedAt` | `timestamp with time zone；可空` | 软删除或删除审计时间；非空通常表示业务对象已删除。 |
| `isActivityEnabled` | `boolean；非空；默认 true` | 是否允许在该相册中使用评论和点赞活动。 |
| `order` | `character varying；非空；默认 'desc'::character varying` | 相册内资产的默认时间排序方向，当前默认值为 desc（降序）。 |
| `updateId` | `uuid；非空；默认 immich_uuid_v7()` | 用于增量同步排序和变更检测的 UUIDv7；每次记录变化时更新。 |

**表级约束：**

- 外键 `album_albumThumbnailAssetId_fkey`：`FOREIGN KEY ("albumThumbnailAssetId") REFERENCES asset(id) ON UPDATE CASCADE ON DELETE SET NULL`
- 主键 `album_pkey`：`PRIMARY KEY (id)`

### `album_user`

**用途：** 相册与用户的多对多关系；通过 owner、editor、viewer 角色表达所有权与协作权限。

**源码：** [album-user.table.ts](../../../server/src/schema/tables/album-user.table.ts#L20)

| 字段名称 | 字段定义 | 详细描述 |
|---|---|---|
| `albumId` | `uuid；非空；外键 → album.id；联合主键` | 关联 album 相册记录的标识。 |
| `userId` | `uuid；非空；联合主键；外键 → user.id` | 关联用户账号的标识。 |
| `role` | `album_user_role_enum；非空；默认 'editor'::album_user_role_enum` | 该用户在相册中的角色；每个相册只能有一个 owner。 |
| `updateId` | `uuid；非空；默认 immich_uuid_v7()` | 用于增量同步排序和变更检测的 UUIDv7；每次记录变化时更新。 |
| `updatedAt` | `timestamp with time zone；非空；默认 now()` | 记录最后更新时间，通常由 updated_at 触发器自动维护。 |
| `createId` | `uuid；非空；默认 immich_uuid_v7()` | 用于增量同步表示创建事件的 UUIDv7。 |
| `createdAt` | `timestamp with time zone；非空；默认 now()` | 记录创建时间，由数据库在插入时自动生成。 |

**表级约束：**

- 外键 `album_user_albumId_fkey`：`FOREIGN KEY ("albumId") REFERENCES album(id) ON UPDATE CASCADE ON DELETE CASCADE`
- 主键 `album_user_pkey`：`PRIMARY KEY ("albumId", "userId")`
- 外键 `album_user_userId_fkey`：`FOREIGN KEY ("userId") REFERENCES "user"(id) ON UPDATE CASCADE ON DELETE CASCADE`

### `album_asset`

**用途：** 相册与媒体资产的多对多关联表；把一张照片加入或移出相册不会改变原始资产记录。

**源码：** [album-asset.table.ts](../../../server/src/schema/tables/album-asset.table.ts#L15)

| 字段名称 | 字段定义 | 详细描述 |
|---|---|---|
| `albumId` | `uuid；非空；外键 → album.id；联合主键` | 关联 album 相册记录的标识。 |
| `assetId` | `uuid；非空；外键 → asset.id；联合主键` | 关联核心 asset 资产记录的标识。 |
| `createdAt` | `timestamp with time zone；非空；默认 now()` | 记录创建时间，由数据库在插入时自动生成。 |
| `updatedAt` | `timestamp with time zone；非空；默认 now()` | 记录最后更新时间，通常由 updated_at 触发器自动维护。 |
| `updateId` | `uuid；非空；默认 immich_uuid_v7()` | 用于增量同步排序和变更检测的 UUIDv7；每次记录变化时更新。 |

**表级约束：**

- 外键 `album_asset_albumId_fkey`：`FOREIGN KEY ("albumId") REFERENCES album(id) ON UPDATE CASCADE ON DELETE CASCADE`
- 外键 `album_asset_assetId_fkey`：`FOREIGN KEY ("assetId") REFERENCES asset(id) ON UPDATE CASCADE ON DELETE CASCADE`
- 主键 `album_asset_pkey`：`PRIMARY KEY ("albumId", "assetId")`

### `activity`

**用途：** 保存相册中的评论与点赞活动；活动可以针对整个相册，也可以指向相册内的某个资产。

**源码：** [activity.table.ts](../../../server/src/schema/tables/activity.table.ts#L20)

| 字段名称 | 字段定义 | 详细描述 |
|---|---|---|
| `id` | `uuid；非空；默认 uuid_generate_v4()；主键` | 表内主键，用于稳定引用该记录；外部关系通常通过此值建立。 |
| `createdAt` | `timestamp with time zone；非空；默认 now()` | 记录创建时间，由数据库在插入时自动生成。 |
| `updatedAt` | `timestamp with time zone；非空；默认 now()` | 记录最后更新时间，通常由 updated_at 触发器自动维护。 |
| `albumId` | `uuid；非空；外键 → album_asset.albumId；外键 → album.id` | 关联 album 相册记录的标识。 |
| `userId` | `uuid；非空；外键 → user.id` | 关联用户账号的标识。 |
| `assetId` | `uuid；可空；外键 → album_asset.assetId；外键 → asset.id` | 关联核心 asset 资产记录的标识。 |
| `comment` | `text；可空` | 活动中的评论正文；点赞记录通常不使用正文。 |
| `isLiked` | `boolean；非空；默认 false` | 该活动是否表达点赞，而不是普通评论。 |
| `updateId` | `uuid；非空；默认 immich_uuid_v7()` | 用于增量同步排序和变更检测的 UUIDv7；每次记录变化时更新。 |

**表级约束：**

- 外键 `activity_albumId_assetId_fkey`：`FOREIGN KEY ("albumId", "assetId") REFERENCES album_asset("albumId", "assetId") ON DELETE CASCADE`
- 外键 `activity_albumId_fkey`：`FOREIGN KEY ("albumId") REFERENCES album(id) ON UPDATE CASCADE ON DELETE CASCADE`
- 外键 `activity_assetId_fkey`：`FOREIGN KEY ("assetId") REFERENCES asset(id) ON UPDATE CASCADE ON DELETE CASCADE`
- 检查约束 `activity_like_check`：`CHECK (comment IS NULL AND "isLiked" = true OR comment IS NOT NULL AND "isLiked" = false)`
- 主键 `activity_pkey`：`PRIMARY KEY (id)`
- 外键 `activity_userId_fkey`：`FOREIGN KEY ("userId") REFERENCES "user"(id) ON UPDATE CASCADE ON DELETE CASCADE`

### `shared_link`

**用途：** 保存无需账号访问的公开分享链接，可关联相册并配置密码、有效期、下载/上传和 EXIF 可见性。

**源码：** [shared-link.table.ts](../../../server/src/schema/tables/shared-link.table.ts#L14)

| 字段名称 | 字段定义 | 详细描述 |
|---|---|---|
| `id` | `uuid；非空；默认 uuid_generate_v4()；主键` | 表内主键，用于稳定引用该记录；外部关系通常通过此值建立。 |
| `description` | `character varying；可空` | 面向用户或管理员的文字说明。 |
| `userId` | `uuid；非空；外键 → user.id` | 关联用户账号的标识。 |
| `key` | `bytea；非空；唯一` | 不可猜测的分享访问密钥二进制值。 |
| `type` | `character varying；非空` | 分享对象类型：相册或一组独立资产。 |
| `createdAt` | `timestamp with time zone；非空；默认 now()` | 记录创建时间，由数据库在插入时自动生成。 |
| `expiresAt` | `timestamp with time zone；可空` | 会话、分享链接或播放会话的失效时间。 |
| `allowUpload` | `boolean；非空；默认 false` | 持有分享链接的访客是否可以向目标相册上传资产。 |
| `albumId` | `uuid；可空；外键 → album.id` | 关联 album 相册记录的标识。 |
| `allowDownload` | `boolean；非空；默认 true` | 持有分享链接的访客是否可以下载资产。 |
| `showExif` | `boolean；非空；默认 true` | 通过分享链接查看时是否向访客显示 EXIF/元数据。 |
| `password` | `character varying；可空` | 可选的分享密码哈希，而非明文。 |
| `slug` | `character varying；可空；唯一` | 可选的可读分享短路径；在实例中唯一。 |

**表级约束：**

- 外键 `shared_link_albumId_fkey`：`FOREIGN KEY ("albumId") REFERENCES album(id) ON UPDATE CASCADE ON DELETE CASCADE`
- 唯一约束 `shared_link_key_uq`：`UNIQUE (key)`
- 主键 `shared_link_pkey`：`PRIMARY KEY (id)`
- 唯一约束 `shared_link_slug_uq`：`UNIQUE (slug)`
- 外键 `shared_link_userId_fkey`：`FOREIGN KEY ("userId") REFERENCES "user"(id) ON UPDATE CASCADE ON DELETE CASCADE`

### `shared_link_asset`

**用途：** 分享链接与单独资产的多对多关联，适用于不以完整相册为单位的分享。

**源码：** [shared-link-asset.table.ts](../../../server/src/schema/tables/shared-link-asset.table.ts#L5)

| 字段名称 | 字段定义 | 详细描述 |
|---|---|---|
| `assetId` | `uuid；非空；外键 → asset.id；联合主键` | 关联核心 asset 资产记录的标识。 |
| `sharedLinkId` | `uuid；非空；联合主键；外键 → shared_link.id` | 关联公开分享链接的标识。 |

**表级约束：**

- 外键 `shared_link_asset_assetId_fkey`：`FOREIGN KEY ("assetId") REFERENCES asset(id) ON UPDATE CASCADE ON DELETE CASCADE`
- 主键 `shared_link_asset_pkey`：`PRIMARY KEY ("assetId", "sharedLinkId")`
- 外键 `shared_link_asset_sharedLinkId_fkey`：`FOREIGN KEY ("sharedLinkId") REFERENCES shared_link(id) ON UPDATE CASCADE ON DELETE CASCADE`

## 人物、人脸、搜索与标签

### `person_group`

**用途：** 表示跨用户共享的人物身份分组，并归属于一个 cluster_group。

**源码：** [person-group.table.ts](../../../server/src/schema/tables/person-group.table.ts#L15)

| 字段名称 | 字段定义 | 详细描述 |
|---|---|---|
| `id` | `uuid；非空；默认 uuid_generate_v4()；主键` | 表内主键，用于稳定引用该记录；外部关系通常通过此值建立。 |
| `clusterGroupId` | `uuid；非空；外键 → cluster_group.id` | 关联人脸聚类共享组的标识。 |
| `createdAt` | `timestamp with time zone；非空；默认 now()` | 记录创建时间，由数据库在插入时自动生成。 |
| `createId` | `uuid；非空；默认 immich_uuid_v7()` | 用于增量同步表示创建事件的 UUIDv7。 |
| `updatedAt` | `timestamp with time zone；非空；默认 now()` | 记录最后更新时间，通常由 updated_at 触发器自动维护。 |
| `updateId` | `uuid；非空；默认 immich_uuid_v7()` | 用于增量同步排序和变更检测的 UUIDv7；每次记录变化时更新。 |

**表级约束：**

- 外键 `person_group_clusterGroupId_fkey`：`FOREIGN KEY ("clusterGroupId") REFERENCES cluster_group(id) ON UPDATE CASCADE ON DELETE CASCADE`
- 主键 `person_group_pkey`：`PRIMARY KEY (id)`

### `person`

**用途：** 保存某个用户视角下的人物资料；同一 person_group 可在共享聚类组内对应多个用户自己的名称、头像和隐藏设置。

**源码：** [person.table.ts](../../../server/src/schema/tables/person.table.ts#L19)

| 字段名称 | 字段定义 | 详细描述 |
|---|---|---|
| `createdAt` | `timestamp with time zone；非空；默认 now()` | 记录创建时间，由数据库在插入时自动生成。 |
| `updatedAt` | `timestamp with time zone；非空；默认 now()` | 记录最后更新时间，通常由 updated_at 触发器自动维护。 |
| `ownerId` | `uuid；非空；外键 → user.id；联合主键` | 拥有该业务对象或媒体资产的用户标识。 |
| `name` | `character varying；非空；默认 ''::character varying` | 该用户为人物设置的名称。 |
| `thumbnailPath` | `character varying；非空；默认 ''::character varying` | 人物头像缩略图在媒体存储中的路径。 |
| `isHidden` | `boolean；非空；默认 false` | 控制或记录 isHidden 状态的布尔值。 |
| `birthDate` | `date；可空` | 人物生日；数据库约束禁止未来日期。 |
| `faceAssetId` | `uuid；可空；外键 → asset_face.id` | 被选作人物代表头像的人脸检测记录。 |
| `isFavorite` | `boolean；非空；默认 false` | 是否被当前所有者标记为收藏。 |
| `color` | `character varying；可空` | 人物在 UI 中使用的可选标识颜色。 |
| `updateId` | `uuid；非空；默认 immich_uuid_v7()` | 用于增量同步排序和变更检测的 UUIDv7；每次记录变化时更新。 |
| `personGroupId` | `uuid；非空；外键 → person_group.id；联合主键` | 关联人物身份分组的标识。 |

**表级约束：**

- 检查约束 `person_birthDate_chk`：`CHECK ("birthDate" <= CURRENT_DATE)`
- 外键 `person_faceAssetId_fkey`：`FOREIGN KEY ("faceAssetId") REFERENCES asset_face(id) ON DELETE SET NULL`
- 外键 `person_ownerId_fkey`：`FOREIGN KEY ("ownerId") REFERENCES "user"(id) ON UPDATE CASCADE ON DELETE CASCADE`
- 外键 `person_personGroupId_fkey`：`FOREIGN KEY ("personGroupId") REFERENCES person_group(id) ON UPDATE CASCADE ON DELETE CASCADE`
- 主键 `person_pkey`：`PRIMARY KEY ("ownerId", "personGroupId")`

### `asset_face`

**用途：** 保存某个资产中检测到的一张人脸、边界框、来源和人物分组关系。

**源码：** [asset-face.table.ts](../../../server/src/schema/tables/asset-face.table.ts#L20)

| 字段名称 | 字段定义 | 详细描述 |
|---|---|---|
| `assetId` | `uuid；非空；外键 → asset.id` | 关联核心 asset 资产记录的标识。 |
| `personGroupId` | `uuid；可空；外键 → person_group.id` | 关联人物身份分组的标识。 |
| `imageWidth` | `integer；非空；默认 0` | 执行人脸检测时使用的图像宽度。 |
| `imageHeight` | `integer；非空；默认 0` | 执行人脸检测时使用的图像高度。 |
| `boundingBoxX1` | `integer；非空；默认 0` | 人脸边界框左上角 X 坐标。 |
| `boundingBoxY1` | `integer；非空；默认 0` | 人脸边界框左上角 Y 坐标。 |
| `boundingBoxX2` | `integer；非空；默认 0` | 人脸边界框右下角 X 坐标。 |
| `boundingBoxY2` | `integer；非空；默认 0` | 人脸边界框右下角 Y 坐标。 |
| `id` | `uuid；非空；默认 uuid_generate_v4()；主键` | 表内主键，用于稳定引用该记录；外部关系通常通过此值建立。 |
| `sourceType` | `sourcetype；非空；默认 'machine-learning'::sourcetype` | 人脸记录来源，例如机器学习检测或人工导入。 |
| `deletedAt` | `timestamp with time zone；可空` | 软删除或删除审计时间；非空通常表示业务对象已删除。 |
| `updatedAt` | `timestamp with time zone；非空；默认 now()` | 记录最后更新时间，通常由 updated_at 触发器自动维护。 |
| `updateId` | `uuid；非空；默认 immich_uuid_v7()` | 用于增量同步排序和变更检测的 UUIDv7；每次记录变化时更新。 |
| `isVisible` | `boolean；非空；默认 true` | 该人脸或 OCR 区域是否在 UI/API 中可见。 |

**表级约束：**

- 外键 `asset_face_assetId_fkey`：`FOREIGN KEY ("assetId") REFERENCES asset(id) ON UPDATE CASCADE ON DELETE CASCADE`
- 外键 `asset_face_personGroupId_fkey`：`FOREIGN KEY ("personGroupId") REFERENCES person_group(id) ON UPDATE CASCADE ON DELETE SET NULL`
- 主键 `asset_face_pkey`：`PRIMARY KEY (id)`

### `face_search`

**用途：** 保存每张检测人脸的向量嵌入，用于相似人脸检索和人物聚类。

**源码：** [face-search.table.ts](../../../server/src/schema/tables/face-search.table.ts#L4)

| 字段名称 | 字段定义 | 详细描述 |
|---|---|---|
| `faceId` | `uuid；非空；外键 → asset_face.id；主键` | asset_face 记录标识，同时作为本表主键。 |
| `embedding` | `vector(512)；非空` | 机器学习生成的向量嵌入，用于向量距离搜索。 |

**表级约束：**

- 外键 `face_search_faceId_fkey`：`FOREIGN KEY ("faceId") REFERENCES asset_face(id) ON DELETE CASCADE`
- 主键 `face_search_pkey`：`PRIMARY KEY ("faceId")`

### `smart_search`

**用途：** 保存资产的 CLIP/视觉语义向量，用于自然语言智能搜索和相似内容匹配。

**源码：** [smart-search.table.ts](../../../server/src/schema/tables/smart-search.table.ts#L4)

| 字段名称 | 字段定义 | 详细描述 |
|---|---|---|
| `assetId` | `uuid；非空；外键 → asset.id；主键` | 关联核心 asset 资产记录的标识。 |
| `embedding` | `vector(512)；非空` | 机器学习生成的向量嵌入，用于向量距离搜索。 |

**表级约束：**

- 外键 `smart_search_assetId_fkey`：`FOREIGN KEY ("assetId") REFERENCES asset(id) ON DELETE CASCADE`
- 主键 `smart_search_pkey`：`PRIMARY KEY ("assetId")`

### `asset_ocr`

**用途：** 保存 OCR 识别出的单个文本区域、四边形坐标、置信度与文本内容。

**源码：** [asset-ocr.table.ts](../../../server/src/schema/tables/asset-ocr.table.ts#L15)

| 字段名称 | 字段定义 | 详细描述 |
|---|---|---|
| `id` | `uuid；非空；默认 uuid_generate_v4()；主键` | 表内主键，用于稳定引用该记录；外部关系通常通过此值建立。 |
| `assetId` | `uuid；非空；外键 → asset.id` | 关联核心 asset 资产记录的标识。 |
| `x1` | `real；非空` | OCR 文本四边形第 1 个点的 X 坐标。 |
| `y1` | `real；非空` | OCR 文本四边形第 1 个点的 Y 坐标。 |
| `x2` | `real；非空` | OCR 文本四边形第 2 个点的 X 坐标。 |
| `y2` | `real；非空` | OCR 文本四边形第 2 个点的 Y 坐标。 |
| `x3` | `real；非空` | OCR 文本四边形第 3 个点的 X 坐标。 |
| `y3` | `real；非空` | OCR 文本四边形第 3 个点的 Y 坐标。 |
| `x4` | `real；非空` | OCR 文本四边形第 4 个点的 X 坐标。 |
| `y4` | `real；非空` | OCR 文本四边形第 4 个点的 Y 坐标。 |
| `boxScore` | `real；非空` | OCR 检测模型对文本框位置的置信度。 |
| `textScore` | `real；非空` | OCR 识别模型对文本内容的置信度。 |
| `text` | `text；非空` | 识别或聚合出的可搜索文本。 |
| `isVisible` | `boolean；非空；默认 true` | 该人脸或 OCR 区域是否在 UI/API 中可见。 |
| `updateId` | `uuid；非空；默认 immich_uuid_v7()` | 用于增量同步排序和变更检测的 UUIDv7；每次记录变化时更新。 |
| `updatedAt` | `timestamp with time zone；非空；默认 now()` | 记录最后更新时间，通常由 updated_at 触发器自动维护。 |

**表级约束：**

- 外键 `asset_ocr_assetId_fkey`：`FOREIGN KEY ("assetId") REFERENCES asset(id) ON UPDATE CASCADE ON DELETE CASCADE`
- 主键 `asset_ocr_pkey`：`PRIMARY KEY (id)`

### `ocr_search`

**用途：** 按资产聚合 OCR 文本，作为 OCR 全文检索/匹配的搜索投影。

**源码：** [ocr-search.table.ts](../../../server/src/schema/tables/ocr-search.table.ts#L4)

| 字段名称 | 字段定义 | 详细描述 |
|---|---|---|
| `assetId` | `uuid；非空；外键 → asset.id；主键` | 关联核心 asset 资产记录的标识。 |
| `text` | `text；非空` | 该资产所有可见 OCR 文本的聚合搜索文本。 |

**表级约束：**

- 外键 `ocr_search_assetId_fkey`：`FOREIGN KEY ("assetId") REFERENCES asset(id) ON UPDATE CASCADE ON DELETE CASCADE`
- 主键 `ocr_search_pkey`：`PRIMARY KEY ("assetId")`

### `tag`

**用途：** 保存用户的层级标签；parentId 构成直接父子关系。

**源码：** [tag.table.ts](../../../server/src/schema/tables/tag.table.ts#L15)

| 字段名称 | 字段定义 | 详细描述 |
|---|---|---|
| `id` | `uuid；非空；默认 uuid_generate_v4()；主键` | 表内主键，用于稳定引用该记录；外部关系通常通过此值建立。 |
| `userId` | `uuid；非空；外键 → user.id；联合唯一` | 关联用户账号的标识。 |
| `value` | `character varying；非空；联合唯一` | 与 key 配对保存的 JSON 值。 |
| `createdAt` | `timestamp with time zone；非空；默认 now()` | 记录创建时间，由数据库在插入时自动生成。 |
| `updatedAt` | `timestamp with time zone；非空；默认 now()` | 记录最后更新时间，通常由 updated_at 触发器自动维护。 |
| `color` | `character varying；可空` | 标签在界面中显示的颜色。 |
| `parentId` | `uuid；可空；外键 → tag.id` | 层级标签的直接父标签；为空表示根标签。 |
| `updateId` | `uuid；非空；默认 immich_uuid_v7()` | 用于增量同步排序和变更检测的 UUIDv7；每次记录变化时更新。 |

**表级约束：**

- 外键 `tag_parentId_fkey`：`FOREIGN KEY ("parentId") REFERENCES tag(id) ON DELETE CASCADE`
- 主键 `tag_pkey`：`PRIMARY KEY (id)`
- 外键 `tag_userId_fkey`：`FOREIGN KEY ("userId") REFERENCES "user"(id) ON UPDATE CASCADE ON DELETE CASCADE`
- 唯一约束 `tag_userId_value_uq`：`UNIQUE ("userId", value)`

### `tag_asset`

**用途：** 标签与资产的多对多关联表。

**源码：** [tag-asset.table.ts](../../../server/src/schema/tables/tag-asset.table.ts#L6)

| 字段名称 | 字段定义 | 详细描述 |
|---|---|---|
| `assetId` | `uuid；非空；外键 → asset.id；联合主键` | 关联核心 asset 资产记录的标识。 |
| `tagId` | `uuid；非空；联合主键；外键 → tag.id` | 关联标签记录的标识。 |

**表级约束：**

- 外键 `tag_asset_assetId_fkey`：`FOREIGN KEY ("assetId") REFERENCES asset(id) ON UPDATE CASCADE ON DELETE CASCADE`
- 主键 `tag_asset_pkey`：`PRIMARY KEY ("assetId", "tagId")`
- 外键 `tag_asset_tagId_fkey`：`FOREIGN KEY ("tagId") REFERENCES tag(id) ON UPDATE CASCADE ON DELETE CASCADE`

### `tag_closure`

**用途：** 标签树的闭包表，预计算任意祖先—后代关系以加速层级查询。

**源码：** [tag-closure.table.ts](../../../server/src/schema/tables/tag-closure.table.ts#L4)

| 字段名称 | 字段定义 | 详细描述 |
|---|---|---|
| `id_ancestor` | `uuid；非空；外键 → tag.id；联合主键` | 标签闭包关系中的祖先标签标识。 |
| `id_descendant` | `uuid；非空；外键 → tag.id；联合主键` | 标签闭包关系中的后代标签标识。 |

**表级约束：**

- 外键 `tag_closure_id_ancestor_fkey`：`FOREIGN KEY (id_ancestor) REFERENCES tag(id) ON DELETE CASCADE`
- 外键 `tag_closure_id_descendant_fkey`：`FOREIGN KEY (id_descendant) REFERENCES tag(id) ON DELETE CASCADE`
- 主键 `tag_closure_pkey`：`PRIMARY KEY (id_ancestor, id_descendant)`

## 回忆与通知

### `memory`

**用途：** 保存“回忆”实体及展示时间窗口、是否已保存/看过和生成参数。

**源码：** [memory.table.ts](../../../server/src/schema/tables/memory.table.ts#L18)

| 字段名称 | 字段定义 | 详细描述 |
|---|---|---|
| `id` | `uuid；非空；默认 uuid_generate_v4()；主键` | 表内主键，用于稳定引用该记录；外部关系通常通过此值建立。 |
| `createdAt` | `timestamp with time zone；非空；默认 now()` | 记录创建时间，由数据库在插入时自动生成。 |
| `updatedAt` | `timestamp with time zone；非空；默认 now()` | 记录最后更新时间，通常由 updated_at 触发器自动维护。 |
| `deletedAt` | `timestamp with time zone；可空` | 软删除或删除审计时间；非空通常表示业务对象已删除。 |
| `ownerId` | `uuid；非空；外键 → user.id` | 拥有该业务对象或媒体资产的用户标识。 |
| `type` | `character varying；非空` | 回忆生成类型。 |
| `data` | `jsonb；非空` | 生成回忆所需的结构化 JSON 参数。 |
| `isSaved` | `boolean；非空；默认 false` | 用户是否显式保存该回忆。 |
| `memoryAt` | `timestamp with time zone；非空` | 该回忆所代表的历史日期/时刻。 |
| `seenAt` | `timestamp with time zone；可空` | 用户首次或最近看过该回忆的时间。 |
| `showAt` | `timestamp with time zone；可空` | 该回忆开始允许展示的时间。 |
| `hideAt` | `timestamp with time zone；可空` | 该回忆停止展示的时间。 |
| `updateId` | `uuid；非空；默认 immich_uuid_v7()` | 用于增量同步排序和变更检测的 UUIDv7；每次记录变化时更新。 |

**表级约束：**

- 外键 `memory_ownerId_fkey`：`FOREIGN KEY ("ownerId") REFERENCES "user"(id) ON UPDATE CASCADE ON DELETE CASCADE`
- 主键 `memory_pkey`：`PRIMARY KEY (id)`

### `memory_asset`

**用途：** 回忆与资产的多对多关联表。

**源码：** [memory-asset.table.ts](../../../server/src/schema/tables/memory-asset.table.ts#L15)

| 字段名称 | 字段定义 | 详细描述 |
|---|---|---|
| `memoriesId` | `uuid；非空；外键 → memory.id；联合主键` | 关联 memory 的标识；名称源于历史关系映射。 |
| `assetId` | `uuid；非空；外键 → asset.id；联合主键` | 关联核心 asset 资产记录的标识。 |
| `createdAt` | `timestamp with time zone；非空；默认 now()` | 记录创建时间，由数据库在插入时自动生成。 |
| `updatedAt` | `timestamp with time zone；非空；默认 now()` | 记录最后更新时间，通常由 updated_at 触发器自动维护。 |
| `updateId` | `uuid；非空；默认 immich_uuid_v7()` | 用于增量同步排序和变更检测的 UUIDv7；每次记录变化时更新。 |

**表级约束：**

- 外键 `memory_asset_assetId_fkey`：`FOREIGN KEY ("assetId") REFERENCES asset(id) ON UPDATE CASCADE ON DELETE CASCADE`
- 外键 `memory_asset_memoriesId_fkey`：`FOREIGN KEY ("memoriesId") REFERENCES memory(id) ON UPDATE CASCADE ON DELETE CASCADE`
- 主键 `memory_asset_pkey`：`PRIMARY KEY ("memoriesId", "assetId")`

### `notification`

**用途：** 保存面向用户的站内通知，包括级别、类型、标题、内容、载荷和阅读状态。

**源码：** [notification.table.ts](../../../server/src/schema/tables/notification.table.ts#L16)

| 字段名称 | 字段定义 | 详细描述 |
|---|---|---|
| `id` | `uuid；非空；默认 uuid_generate_v4()；主键` | 表内主键，用于稳定引用该记录；外部关系通常通过此值建立。 |
| `createdAt` | `timestamp with time zone；非空；默认 now()` | 记录创建时间，由数据库在插入时自动生成。 |
| `updatedAt` | `timestamp with time zone；非空；默认 now()` | 记录最后更新时间，通常由 updated_at 触发器自动维护。 |
| `deletedAt` | `timestamp with time zone；可空` | 软删除或删除审计时间；非空通常表示业务对象已删除。 |
| `updateId` | `uuid；非空；默认 immich_uuid_v7()` | 用于增量同步排序和变更检测的 UUIDv7；每次记录变化时更新。 |
| `userId` | `uuid；可空；外键 → user.id` | 关联用户账号的标识。 |
| `level` | `character varying；非空；默认 'info'::character varying` | 通知严重性/展示级别。 |
| `type` | `character varying；非空；默认 'info'::character varying` | 通知事件类型。 |
| `data` | `jsonb；可空` | 通知携带的结构化 JSON 上下文。 |
| `title` | `character varying；非空` | 面向用户展示的标题。 |
| `description` | `text；可空` | 面向用户或管理员的文字说明。 |
| `readAt` | `timestamp with time zone；可空` | 用户阅读通知的时间；为空表示未读。 |

**表级约束：**

- 主键 `notification_pkey`：`PRIMARY KEY (id)`
- 外键 `notification_userId_fkey`：`FOREIGN KEY ("userId") REFERENCES "user"(id) ON UPDATE CASCADE ON DELETE CASCADE`

## 视频实时转码

### `video_stream_session`

**用途：** 表示一次资产实时转码/播放会话及其过期时间。

**源码：** [video-stream.table.ts](../../../server/src/schema/tables/video-stream.table.ts#L16)

| 字段名称 | 字段定义 | 详细描述 |
|---|---|---|
| `id` | `uuid；非空；默认 uuid_generate_v4()；主键` | 表内主键，用于稳定引用该记录；外部关系通常通过此值建立。 |
| `assetId` | `uuid；非空；外键 → asset.id` | 关联核心 asset 资产记录的标识。 |
| `expiresAt` | `timestamp with time zone；非空` | 会话、分享链接或播放会话的失效时间。 |
| `createdAt` | `timestamp with time zone；非空；默认 now()` | 记录创建时间，由数据库在插入时自动生成。 |

**表级约束：**

- 外键 `video_stream_session_assetId_fkey`：`FOREIGN KEY ("assetId") REFERENCES asset(id) ON DELETE CASCADE`
- 主键 `video_stream_session_pkey`：`PRIMARY KEY (id)`

### `video_stream_variant`

**用途：** 表示实时播放会话中的一个码率、分辨率和编码格式变体。

**源码：** [video-stream.table.ts](../../../server/src/schema/tables/video-stream.table.ts#L32)

| 字段名称 | 字段定义 | 详细描述 |
|---|---|---|
| `id` | `uuid；非空；默认 uuid_generate_v4()；主键` | 表内主键，用于稳定引用该记录；外部关系通常通过此值建立。 |
| `sessionId` | `uuid；非空；外键 → video_stream_session.id` | 关联登录会话或视频流会话的标识，具体取决于所属表。 |
| `createdAt` | `timestamp with time zone；非空；默认 now()` | 记录创建时间，由数据库在插入时自动生成。 |
| `bitrate` | `integer；非空` | 音频或视频流码率，通常以 bit/s 表示。 |
| `codec` | `video_stream_variant_codec_enum；非空` | 实时转码变体使用的视频编码格式。 |
| `resolution` | `smallint；非空` | 实时转码变体的目标垂直分辨率。 |

**表级约束：**

- 主键 `video_stream_variant_pkey`：`PRIMARY KEY (id)`
- 外键 `video_stream_variant_sessionId_fkey`：`FOREIGN KEY ("sessionId") REFERENCES video_stream_session(id) ON DELETE CASCADE`

### `video_stream_segment`

**用途：** 保存某个实时转码变体的媒体分片序号和微秒时长。

**源码：** [video-stream.table.ts](../../../server/src/schema/tables/video-stream.table.ts#L53)

| 字段名称 | 字段定义 | 详细描述 |
|---|---|---|
| `variantId` | `uuid；非空；联合主键；外键 → video_stream_variant.id` | 关联视频实时转码变体的标识。 |
| `index` | `integer；非空；联合主键` | 分片在该变体播放列表中的顺序编号。 |
| `durationUs` | `integer；非空` | 视频分片时长，单位微秒。 |

**表级约束：**

- 主键 `video_stream_segment_pkey`：`PRIMARY KEY ("variantId", index)`
- 外键 `video_stream_segment_variantId_fkey`：`FOREIGN KEY ("variantId") REFERENCES video_stream_variant(id) ON DELETE CASCADE`

## 插件与工作流

### `plugin`

**用途：** 保存已安装插件的清单、WASM 二进制、清单元数据、模板和完整性哈希。

**源码：** [plugin.table.ts](../../../server/src/schema/tables/plugin.table.ts#L14)

| 字段名称 | 字段定义 | 详细描述 |
|---|---|---|
| `id` | `uuid；非空；默认 uuid_generate_v4()；主键` | 表内主键，用于稳定引用该记录；外部关系通常通过此值建立。 |
| `enabled` | `boolean；非空；默认 true` | 控制该对象是否启用；关闭后保留配置但不参与执行。 |
| `name` | `character varying；非空；唯一；联合唯一` | 插件的稳定包名；当前实现要求全表唯一。 |
| `version` | `character varying；非空；联合唯一` | 插件、应用或迁移版本标识。 |
| `title` | `character varying；非空` | 插件的展示标题。 |
| `description` | `character varying；非空` | 插件清单中的功能说明。 |
| `author` | `character varying；非空` | 插件作者信息。 |
| `wasmBytes` | `bytea；非空` | 插件编译后的 WebAssembly 二进制内容。 |
| `createdAt` | `timestamp with time zone；非空；默认 now()` | 记录创建时间，由数据库在插入时自动生成。 |
| `updatedAt` | `timestamp with time zone；非空；默认 now()` | 记录最后更新时间，通常由 updated_at 触发器自动维护。 |
| `templates` | `jsonb；非空` | 插件清单声明的模板集合。 |
| `sha256hash` | `bytea；非空` | 插件二进制/包内容的 SHA-256 完整性哈希。 |

**表级约束：**

- 唯一约束 `plugin_name_uq`：`UNIQUE (name)`
- 唯一约束 `plugin_name_version_uq`：`UNIQUE (name, version)`
- 主键 `plugin_pkey`：`PRIMARY KEY (id)`

### `plugin_method`

**用途：** 描述插件暴露给工作流的可调用方法、适用类型、配置 Schema 和允许的宿主能力。

**源码：** [plugin-method.table.ts](../../../server/src/schema/tables/plugin-method.table.ts#L7)

| 字段名称 | 字段定义 | 详细描述 |
|---|---|---|
| `id` | `uuid；非空；默认 uuid_generate_v4()；主键` | 表内主键，用于稳定引用该记录；外部关系通常通过此值建立。 |
| `pluginId` | `uuid；非空；外键 → plugin.id；联合唯一` | 关联已安装插件的标识。 |
| `name` | `character varying；非空；联合唯一` | 插件内部的方法名；在同一插件内唯一。 |
| `title` | `character varying；非空` | 方法的展示标题。 |
| `description` | `character varying；非空` | 方法能力和行为说明。 |
| `types` | `character varying[]；非空` | 插件方法支持的工作流或调用场景类型集合。 |
| `hostFunctions` | `boolean；非空；默认 false` | 插件方法是否需要调用宿主提供的受控函数。 |
| `uiHints` | `character varying[]；非空；默认 '{}'::character varying[]` | 帮助前端渲染插件配置表单的提示集合。 |
| `schema` | `jsonb；可空` | 插件方法配置参数的 JSON Schema。 |
| `allowedHosts` | `character varying[]；非空；默认 '{}'::character varying[]` | 插件网络访问允许的主机白名单。 |

**表级约束：**

- 主键 `plugin_method_pkey`：`PRIMARY KEY (id)`
- 外键 `plugin_method_pluginId_fkey`：`FOREIGN KEY ("pluginId") REFERENCES plugin(id) ON UPDATE CASCADE ON DELETE CASCADE`
- 唯一约束 `plugin_method_pluginId_name_uq`：`UNIQUE ("pluginId", name)`

### `workflow`

**用途：** 保存用户定义的自动化工作流、触发器、启用状态和日志开关。

**源码：** [workflow.table.ts](../../../server/src/schema/tables/workflow.table.ts#L15)

| 字段名称 | 字段定义 | 详细描述 |
|---|---|---|
| `id` | `uuid；非空；默认 uuid_generate_v4()；主键` | 表内主键，用于稳定引用该记录；外部关系通常通过此值建立。 |
| `ownerId` | `uuid；非空；外键 → user.id` | 拥有该业务对象或媒体资产的用户标识。 |
| `trigger` | `character varying；非空` | 启动工作流的事件/触发器定义。 |
| `name` | `character varying；可空` | 用户为工作流设置的名称。 |
| `description` | `character varying；可空` | 工作流用途说明。 |
| `createdAt` | `timestamp with time zone；非空；默认 now()` | 记录创建时间，由数据库在插入时自动生成。 |
| `updatedAt` | `timestamp with time zone；非空；默认 now()` | 记录最后更新时间，通常由 updated_at 触发器自动维护。 |
| `updateId` | `uuid；非空；默认 immich_uuid_v7()` | 用于增量同步排序和变更检测的 UUIDv7；每次记录变化时更新。 |
| `enabled` | `boolean；非空；默认 true` | 控制该对象是否启用；关闭后保留配置但不参与执行。 |
| `logging` | `boolean；非空；默认 false` | 是否为该工作流记录详细执行日志。 |

**表级约束：**

- 外键 `workflow_ownerId_fkey`：`FOREIGN KEY ("ownerId") REFERENCES "user"(id) ON UPDATE CASCADE ON DELETE CASCADE`
- 主键 `workflow_pkey`：`PRIMARY KEY (id)`

### `workflow_step`

**用途：** 保存工作流中有序的插件方法调用及其 JSON 配置。

**源码：** [workflow-step.table.ts](../../../server/src/schema/tables/workflow-step.table.ts#L7)

| 字段名称 | 字段定义 | 详细描述 |
|---|---|---|
| `id` | `uuid；非空；默认 uuid_generate_v4()；主键` | 表内主键，用于稳定引用该记录；外部关系通常通过此值建立。 |
| `enabled` | `boolean；非空；默认 true` | 控制该对象是否启用；关闭后保留配置但不参与执行。 |
| `workflowId` | `uuid；非空；外键 → workflow.id` | 关联所属工作流的标识。 |
| `pluginMethodId` | `uuid；非空；外键 → plugin_method.id` | 关联插件所暴露方法的标识。 |
| `config` | `jsonb；可空` | 工作流步骤传递给插件方法的 JSON 配置。 |
| `order` | `integer；非空` | 步骤在工作流中的执行序号。 |

**表级约束：**

- 主键 `workflow_step_pkey`：`PRIMARY KEY (id)`
- 外键 `workflow_step_pluginMethodId_fkey`：`FOREIGN KEY ("pluginMethodId") REFERENCES plugin_method(id) ON UPDATE CASCADE ON DELETE CASCADE`
- 外键 `workflow_step_workflowId_fkey`：`FOREIGN KEY ("workflowId") REFERENCES workflow(id) ON UPDATE CASCADE ON DELETE CASCADE`

### `workflow_log`

**用途：** 记录工作流一次运行或步骤执行的结果、运行批次和触发数据。

**源码：** [workflow-log.table.ts](../../../server/src/schema/tables/workflow-log.table.ts#L14)

| 字段名称 | 字段定义 | 详细描述 |
|---|---|---|
| `id` | `uuid；非空；默认 uuid_generate_v4()；主键` | 表内主键，用于稳定引用该记录；外部关系通常通过此值建立。 |
| `createdAt` | `timestamp with time zone；非空；默认 now()` | 记录创建时间，由数据库在插入时自动生成。 |
| `workflowId` | `uuid；非空；外键 → workflow.id` | 关联所属工作流的标识。 |
| `result` | `character varying；非空` | 工作流运行或步骤执行结果状态。 |
| `workflowStepId` | `uuid；可空；外键 → workflow_step.id` | 关联具体工作流步骤的标识。 |
| `triggerDataId` | `uuid；可空` | 触发工作流的资产或其他业务数据标识。 |
| `runId` | `uuid；非空` | 把同一次工作流运行产生的多条日志关联起来的标识。 |

**表级约束：**

- 主键 `workflow_log_pkey`：`PRIMARY KEY (id)`
- 外键 `workflow_log_workflowId_fkey`：`FOREIGN KEY ("workflowId") REFERENCES workflow(id) ON UPDATE CASCADE ON DELETE CASCADE`
- 外键 `workflow_log_workflowStepId_fkey`：`FOREIGN KEY ("workflowStepId") REFERENCES workflow_step(id) ON UPDATE CASCADE ON DELETE SET NULL`

## 同步、地理与系统状态

### `session_sync_checkpoint`

**用途：** 保存每个会话对各同步数据流确认到的 updateId，支持断点增量同步。

**源码：** [sync-checkpoint.table.ts](../../../server/src/schema/tables/sync-checkpoint.table.ts#L15)

| 字段名称 | 字段定义 | 详细描述 |
|---|---|---|
| `sessionId` | `uuid；非空；联合主键；外键 → session.id` | 关联登录会话或视频流会话的标识，具体取决于所属表。 |
| `type` | `character varying；非空；联合主键` | 同步数据流类型。 |
| `createdAt` | `timestamp with time zone；非空；默认 now()` | 记录创建时间，由数据库在插入时自动生成。 |
| `updatedAt` | `timestamp with time zone；非空；默认 now()` | 记录最后更新时间，通常由 updated_at 触发器自动维护。 |
| `ack` | `character varying；非空` | 该数据流已经被客户端确认处理到的 updateId。 |
| `updateId` | `uuid；非空；默认 immich_uuid_v7()` | 用于增量同步排序和变更检测的 UUIDv7；每次记录变化时更新。 |

**表级约束：**

- 主键 `session_sync_checkpoint_pkey`：`PRIMARY KEY ("sessionId", type)`
- 外键 `session_sync_checkpoint_sessionId_fkey`：`FOREIGN KEY ("sessionId") REFERENCES session(id) ON UPDATE CASCADE ON DELETE CASCADE`

### `system_metadata`

**用途：** 以键值形式保存实例级系统状态和内部配置元数据。

**源码：** [system-metadata.table.ts](../../../server/src/schema/tables/system-metadata.table.ts#L5)

| 字段名称 | 字段定义 | 详细描述 |
|---|---|---|
| `key` | `character varying；非空；主键` | 实例级系统元数据键，也是该表主键。 |
| `value` | `jsonb；非空` | 系统元数据的 JSON 值。 |

**表级约束：**

- 主键 `system_metadata_pkey`：`PRIMARY KEY (key)`

### `version_history`

**用途：** 记录实例已经执行或确认过的应用级版本迁移。

**源码：** [version-history.table.ts](../../../server/src/schema/tables/version-history.table.ts#L3)

| 字段名称 | 字段定义 | 详细描述 |
|---|---|---|
| `id` | `uuid；非空；默认 uuid_generate_v4()；主键` | 已经完成的应用级版本迁移编号。 |
| `createdAt` | `timestamp with time zone；非空；默认 now()` | 记录创建时间，由数据库在插入时自动生成。 |
| `version` | `character varying；非空` | 插件、应用或迁移版本标识。 |

**表级约束：**

- 主键 `version_history_pkey`：`PRIMARY KEY (id)`

### `geodata_places`

**用途：** GeoNames 地点数据集的本地表，用经纬度和行政区代码支持反向地理编码。

**源码：** [geodata-places.table.ts](../../../server/src/schema/tables/geodata-places.table.ts#L3)

| 字段名称 | 字段定义 | 详细描述 |
|---|---|---|
| `id` | `integer；非空；主键` | 表内主键，用于稳定引用该记录；外部关系通常通过此值建立。 |
| `name` | `character varying(200)；非空` | 业务对象的人类可读名称。 |
| `longitude` | `double precision；非空` | 拍摄位置经度。 |
| `latitude` | `double precision；非空` | 拍摄位置纬度。 |
| `countryCode` | `character(2)；非空` | ISO 国家代码。 |
| `admin1Code` | `character varying(20)；可空` | 一级行政区代码。 |
| `admin2Code` | `character varying(80)；可空` | 二级行政区代码。 |
| `modificationDate` | `date；非空` | 上游地理数据最后修改日期。 |
| `admin1Name` | `character varying；可空` | 一级行政区名称。 |
| `admin2Name` | `character varying；可空` | 二级行政区名称。 |
| `alternateNames` | `character varying；可空` | 地点的别名、多语言名称或历史名称集合。 |

**表级约束：**

- 主键 `geodata_places_pkey`：`PRIMARY KEY (id)`

### `naturalearth_countries`

**用途：** Natural Earth 国家边界数据，用于地图、国家定位和空间查询。

**源码：** [natural-earth-countries.table.ts](../../../server/src/schema/tables/natural-earth-countries.table.ts#L3)

| 字段名称 | 字段定义 | 详细描述 |
|---|---|---|
| `id` | `integer；非空；主键` | 表内主键，用于稳定引用该记录；外部关系通常通过此值建立。 |
| `admin` | `character varying(50)；非空` | Natural Earth 数据中的国家/行政实体名称。 |
| `admin_a3` | `character varying(3)；非空` | Natural Earth 使用的三字母行政区代码。 |
| `type` | `character varying(50)；非空` | 记录的业务类型；可选值由所属领域的枚举定义。 |
| `coordinates` | `polygon；非空` | 国家边界的 PostGIS/几何坐标数据。 |

**表级约束：**

- 主键 `naturalearth_countries_pkey`：`PRIMARY KEY (id)`

## 删除审计与同步墓碑

### `user_audit`

**用途：** 记录用户被删除的事件，作为同步墓碑。

**源码：** [user-audit.table.ts](../../../server/src/schema/tables/user-audit.table.ts#L4)

| 字段名称 | 字段定义 | 详细描述 |
|---|---|---|
| `userId` | `uuid；非空` | 关联用户账号的标识。 |
| `deletedAt` | `timestamp with time zone；非空；默认 clock_timestamp()` | 源记录被删除并写入墓碑的时间。 |
| `id` | `uuid；非空；默认 immich_uuid_v7()；主键` | 审计墓碑记录自身的 UUIDv7 标识。 |

**表级约束：**

- 主键 `user_audit_pkey`：`PRIMARY KEY (id)`

### `user_metadata_audit`

**用途：** 记录被删除的用户元数据键，供增量同步。

**源码：** [user-metadata-audit.table.ts](../../../server/src/schema/tables/user-metadata-audit.table.ts#L5)

| 字段名称 | 字段定义 | 详细描述 |
|---|---|---|
| `id` | `uuid；非空；默认 immich_uuid_v7()；主键` | 审计墓碑记录自身的 UUIDv7 标识。 |
| `userId` | `uuid；非空` | 关联用户账号的标识。 |
| `key` | `character varying；非空` | 被删除的用户元数据键；与 userId 一起指出同步端应清理哪项元数据。 |
| `deletedAt` | `timestamp with time zone；非空；默认 clock_timestamp()` | 源记录被删除并写入墓碑的时间。 |

**表级约束：**

- 主键 `user_metadata_audit_pkey`：`PRIMARY KEY (id)`

### `partner_audit`

**用途：** 记录伙伴共享关系的删除事件，供增量同步。

**源码：** [partner-audit.table.ts](../../../server/src/schema/tables/partner-audit.table.ts#L4)

| 字段名称 | 字段定义 | 详细描述 |
|---|---|---|
| `id` | `uuid；非空；默认 immich_uuid_v7()；主键` | 审计墓碑记录自身的 UUIDv7 标识。 |
| `sharedById` | `uuid；非空` | 发起伙伴图库共享的用户标识。 |
| `sharedWithId` | `uuid；非空` | 接收伙伴图库共享的用户标识。 |
| `deletedAt` | `timestamp with time zone；非空；默认 clock_timestamp()` | 源记录被删除并写入墓碑的时间。 |

**表级约束：**

- 主键 `partner_audit_pkey`：`PRIMARY KEY (id)`

### `album_audit`

**用途：** 记录相册删除事件及受影响用户，供移动端/客户端增量同步删除状态。

**源码：** [album-audit.table.ts](../../../server/src/schema/tables/album-audit.table.ts#L4)

| 字段名称 | 字段定义 | 详细描述 |
|---|---|---|
| `id` | `uuid；非空；默认 immich_uuid_v7()；主键` | 审计墓碑记录自身的 UUIDv7 标识。 |
| `albumId` | `uuid；非空` | 关联 album 相册记录的标识。 |
| `userId` | `uuid；非空` | 关联用户账号的标识。 |
| `deletedAt` | `timestamp with time zone；非空；默认 clock_timestamp()` | 源记录被删除并写入墓碑的时间。 |

**表级约束：**

- 主键 `album_audit_pkey`：`PRIMARY KEY (id)`

### `album_user_audit`

**用途：** 记录已删除的相册成员关系，供同步端识别成员退出或权限关系消失。

**源码：** [album-user-audit.table.ts](../../../server/src/schema/tables/album-user-audit.table.ts#L4)

| 字段名称 | 字段定义 | 详细描述 |
|---|---|---|
| `id` | `uuid；非空；默认 immich_uuid_v7()；主键` | 审计墓碑记录自身的 UUIDv7 标识。 |
| `albumId` | `uuid；非空` | 关联 album 相册记录的标识。 |
| `userId` | `uuid；非空` | 关联用户账号的标识。 |
| `deletedAt` | `timestamp with time zone；非空；默认 clock_timestamp()` | 源记录被删除并写入墓碑的时间。 |

**表级约束：**

- 主键 `album_user_audit_pkey`：`PRIMARY KEY (id)`

### `album_asset_audit`

**用途：** 记录已删除的相册—资产关联，作为增量同步所需的墓碑记录。

**源码：** [album-asset-audit.table.ts](../../../server/src/schema/tables/album-asset-audit.table.ts#L5)

| 字段名称 | 字段定义 | 详细描述 |
|---|---|---|
| `id` | `uuid；非空；默认 immich_uuid_v7()；主键` | 审计墓碑记录自身的 UUIDv7 标识。 |
| `albumId` | `uuid；非空；外键 → album.id` | 关联 album 相册记录的标识。 |
| `assetId` | `uuid；非空` | 关联核心 asset 资产记录的标识。 |
| `deletedAt` | `timestamp with time zone；非空；默认 clock_timestamp()` | 源记录被删除并写入墓碑的时间。 |

**表级约束：**

- 外键 `album_asset_audit_albumId_fkey`：`FOREIGN KEY ("albumId") REFERENCES album(id) ON UPDATE CASCADE ON DELETE CASCADE`
- 主键 `album_asset_audit_pkey`：`PRIMARY KEY (id)`

### `asset_audit`

**用途：** 记录已删除资产的标识、原所有者和删除时间，是增量同步的资产删除墓碑。

**源码：** [asset-audit.table.ts](../../../server/src/schema/tables/asset-audit.table.ts#L4)

| 字段名称 | 字段定义 | 详细描述 |
|---|---|---|
| `id` | `uuid；非空；默认 immich_uuid_v7()；主键` | 审计墓碑记录自身的 UUIDv7 标识。 |
| `assetId` | `uuid；非空` | 关联核心 asset 资产记录的标识。 |
| `ownerId` | `uuid；非空` | 拥有该业务对象或媒体资产的用户标识。 |
| `deletedAt` | `timestamp with time zone；非空；默认 clock_timestamp()` | 源记录被删除并写入墓碑的时间。 |

**表级约束：**

- 主键 `asset_audit_pkey`：`PRIMARY KEY (id)`

### `asset_edit_audit`

**用途：** 记录被删除的资产编辑动作，供客户端同步编辑链删除。

**源码：** [asset-edit-audit.table.ts](../../../server/src/schema/tables/asset-edit-audit.table.ts#L4)

| 字段名称 | 字段定义 | 详细描述 |
|---|---|---|
| `id` | `uuid；非空；默认 immich_uuid_v7()；主键` | 审计墓碑记录自身的 UUIDv7 标识。 |
| `editId` | `uuid；非空` | 关联被删除编辑动作的标识。 |
| `assetId` | `uuid；非空` | 关联核心 asset 资产记录的标识。 |
| `deletedAt` | `timestamp with time zone；非空；默认 clock_timestamp()` | 源记录被删除并写入墓碑的时间。 |

**表级约束：**

- 主键 `asset_edit_audit_pkey`：`PRIMARY KEY (id)`

### `asset_metadata_audit`

**用途：** 记录被删除的资产元数据键，供客户端增量同步删除。

**源码：** [asset-metadata-audit.table.ts](../../../server/src/schema/tables/asset-metadata-audit.table.ts#L4)

| 字段名称 | 字段定义 | 详细描述 |
|---|---|---|
| `id` | `uuid；非空；默认 immich_uuid_v7()；主键` | 审计墓碑记录自身的 UUIDv7 标识。 |
| `assetId` | `uuid；非空` | 关联核心 asset 资产记录的标识。 |
| `key` | `character varying；非空` | 被删除的资产元数据键；与 assetId 一起指出同步端应清理哪项元数据。 |
| `deletedAt` | `timestamp with time zone；非空；默认 clock_timestamp()` | 源记录被删除并写入墓碑的时间。 |

**表级约束：**

- 主键 `asset_metadata_audit_pkey`：`PRIMARY KEY (id)`

### `asset_face_audit`

**用途：** 记录被删除的人脸检测记录，供人脸与移动端同步。

**源码：** [asset-face-audit.table.ts](../../../server/src/schema/tables/asset-face-audit.table.ts#L4)

| 字段名称 | 字段定义 | 详细描述 |
|---|---|---|
| `id` | `uuid；非空；默认 immich_uuid_v7()；主键` | 审计墓碑记录自身的 UUIDv7 标识。 |
| `assetFaceId` | `uuid；非空` | 关联 assetFace 业务对象的标识。 |
| `assetId` | `uuid；非空` | 关联核心 asset 资产记录的标识。 |
| `deletedAt` | `timestamp with time zone；非空；默认 clock_timestamp()` | 源记录被删除并写入墓碑的时间。 |

**表级约束：**

- 主键 `asset_face_audit_pkey`：`PRIMARY KEY (id)`

### `asset_ocr_audit`

**用途：** 记录资产 OCR 结果被删除的事件，供同步客户端清理本地 OCR 数据。

**源码：** [asset-ocr-audit.table.ts](../../../server/src/schema/tables/asset-ocr-audit.table.ts#L4)

| 字段名称 | 字段定义 | 详细描述 |
|---|---|---|
| `id` | `uuid；非空；默认 immich_uuid_v7()；主键` | 审计墓碑记录自身的 UUIDv7 标识。 |
| `assetId` | `uuid；非空` | 关联核心 asset 资产记录的标识。 |
| `deletedAt` | `timestamp with time zone；非空；默认 clock_timestamp()` | 源记录被删除并写入墓碑的时间。 |

**表级约束：**

- 主键 `asset_ocr_audit_pkey`：`PRIMARY KEY (id)`

### `person_audit`

**用途：** 记录用户视角的人物记录删除事件，供同步客户端清理人物数据。

**源码：** [person-audit.table.ts](../../../server/src/schema/tables/person-audit.table.ts#L4)

| 字段名称 | 字段定义 | 详细描述 |
|---|---|---|
| `id` | `uuid；非空；默认 immich_uuid_v7()；主键` | 审计墓碑记录自身的 UUIDv7 标识。 |
| `ownerId` | `uuid；非空` | 拥有该业务对象或媒体资产的用户标识。 |
| `deletedAt` | `timestamp with time zone；非空；默认 clock_timestamp()` | 源记录被删除并写入墓碑的时间。 |
| `personGroupId` | `uuid；非空` | 关联人物身份分组的标识。 |

**表级约束：**

- 主键 `person_audit_pkey`：`PRIMARY KEY (id)`

### `person_group_audit`

**用途：** 记录人物分组删除事件以及原聚类组，供同步与级联清理。

**源码：** [person-group-audit.table.ts](../../../server/src/schema/tables/person-group-audit.table.ts#L4)

| 字段名称 | 字段定义 | 详细描述 |
|---|---|---|
| `id` | `uuid；非空；默认 immich_uuid_v7()；主键` | 审计墓碑记录自身的 UUIDv7 标识。 |
| `personGroupId` | `uuid；非空` | 关联人物身份分组的标识。 |
| `clusterGroupId` | `uuid；非空` | 关联人脸聚类共享组的标识。 |
| `deletedAt` | `timestamp with time zone；非空；默认 clock_timestamp()` | 源记录被删除并写入墓碑的时间。 |

**表级约束：**

- 主键 `person_group_audit_pkey`：`PRIMARY KEY (id)`

### `stack_audit`

**用途：** 记录堆叠关系删除事件，供客户端增量同步。

**源码：** [stack-audit.table.ts](../../../server/src/schema/tables/stack-audit.table.ts#L4)

| 字段名称 | 字段定义 | 详细描述 |
|---|---|---|
| `id` | `uuid；非空；默认 immich_uuid_v7()；主键` | 审计墓碑记录自身的 UUIDv7 标识。 |
| `stackId` | `uuid；非空` | 关联资产堆叠；为空表示资产不属于堆叠。 |
| `userId` | `uuid；非空` | 关联用户账号的标识。 |
| `deletedAt` | `timestamp with time zone；非空；默认 clock_timestamp()` | 源记录被删除并写入墓碑的时间。 |

**表级约束：**

- 主键 `stack_audit_pkey`：`PRIMARY KEY (id)`

### `memory_audit`

**用途：** 记录被删除的回忆及其用户，供增量同步。

**源码：** [memory-audit.table.ts](../../../server/src/schema/tables/memory-audit.table.ts#L4)

| 字段名称 | 字段定义 | 详细描述 |
|---|---|---|
| `id` | `uuid；非空；默认 immich_uuid_v7()；主键` | 审计墓碑记录自身的 UUIDv7 标识。 |
| `memoryId` | `uuid；非空` | 关联被删除或审计的 memory 标识。 |
| `userId` | `uuid；非空` | 关联用户账号的标识。 |
| `deletedAt` | `timestamp with time zone；非空；默认 clock_timestamp()` | 源记录被删除并写入墓碑的时间。 |

**表级约束：**

- 主键 `memory_audit_pkey`：`PRIMARY KEY (id)`

### `memory_asset_audit`

**用途：** 记录被删除的回忆—资产关联，供增量同步。

**源码：** [memory-asset-audit.table.ts](../../../server/src/schema/tables/memory-asset-audit.table.ts#L5)

| 字段名称 | 字段定义 | 详细描述 |
|---|---|---|
| `id` | `uuid；非空；默认 immich_uuid_v7()；主键` | 审计墓碑记录自身的 UUIDv7 标识。 |
| `memoryId` | `uuid；非空；外键 → memory.id` | 关联被删除或审计的 memory 标识。 |
| `assetId` | `uuid；非空` | 关联核心 asset 资产记录的标识。 |
| `deletedAt` | `timestamp with time zone；非空；默认 clock_timestamp()` | 源记录被删除并写入墓碑的时间。 |

**表级约束：**

- 外键 `memory_asset_audit_memoryId_fkey`：`FOREIGN KEY ("memoryId") REFERENCES memory(id) ON UPDATE CASCADE ON DELETE CASCADE`
- 主键 `memory_asset_audit_pkey`：`PRIMARY KEY (id)`

## 资产堆叠

### `stack`

**用途：** 定义一组堆叠资产及其中的主资产；asset.stackId 指向该记录。

**源码：** [stack.table.ts](../../../server/src/schema/tables/stack.table.ts#L16)

| 字段名称 | 字段定义 | 详细描述 |
|---|---|---|
| `id` | `uuid；非空；默认 uuid_generate_v4()；主键` | 表内主键，用于稳定引用该记录；外部关系通常通过此值建立。 |
| `primaryAssetId` | `uuid；非空；外键 → asset.id；唯一` | 堆叠中作为封面和默认显示项的主资产。 |
| `ownerId` | `uuid；非空；外键 → user.id` | 拥有该业务对象或媒体资产的用户标识。 |
| `createdAt` | `timestamp with time zone；非空；默认 now()` | 记录创建时间，由数据库在插入时自动生成。 |
| `updatedAt` | `timestamp with time zone；非空；默认 now()` | 记录最后更新时间，通常由 updated_at 触发器自动维护。 |
| `updateId` | `uuid；非空；默认 immich_uuid_v7()` | 用于增量同步排序和变更检测的 UUIDv7；每次记录变化时更新。 |

**表级约束：**

- 外键 `stack_ownerId_fkey`：`FOREIGN KEY ("ownerId") REFERENCES "user"(id) ON UPDATE CASCADE ON DELETE CASCADE`
- 主键 `stack_pkey`：`PRIMARY KEY (id)`
- 外键 `stack_primaryAssetId_fkey`：`FOREIGN KEY ("primaryAssetId") REFERENCES asset(id)`
- 唯一约束 `stack_primaryAssetId_uq`：`UNIQUE ("primaryAssetId")`

## 数据库迁移基础设施

### `kysely_migrations`

**用途：** Kysely 迁移框架维护的已执行迁移清单。

**来源：** 数据库框架/迁移基础设施自动创建，无对应业务 Table 类。

| 字段名称 | 字段定义 | 详细描述 |
|---|---|---|
| `name` | `character varying(255)；非空；主键` | 迁移文件或迁移任务的唯一名称；Kysely 据此判断该迁移是否已经执行。 |
| `timestamp` | `character varying(255)；非空` | 迁移执行时间戳，由 Kysely 迁移框架维护。 |

**表级约束：**

- 主键 `kysely_migrations_pkey`：`PRIMARY KEY (name)`

### `kysely_migrations_lock`

**用途：** Kysely 迁移框架的互斥锁表，防止多个进程并发执行迁移。

**来源：** 数据库框架/迁移基础设施自动创建，无对应业务 Table 类。

| 字段名称 | 字段定义 | 详细描述 |
|---|---|---|
| `id` | `character varying(255)；非空；主键` | Kysely 迁移锁记录的固定主键，用来定位唯一的全局锁行。 |
| `is_locked` | `integer；非空；默认 0` | 迁移锁是否已被某个迁移执行器持有。 |

**表级约束：**

- 主键 `kysely_migrations_lock_pkey`：`PRIMARY KEY (id)`

### `migration_overrides`

**用途：** 保存 SQL Tools 生成器的数据库对象覆盖定义，例如手写函数、触发器或约束 SQL。

**来源：** 数据库框架/迁移基础设施自动创建，无对应业务 Table 类。

| 字段名称 | 字段定义 | 详细描述 |
|---|---|---|
| `name` | `character varying；非空；主键` | 被覆盖的数据库函数、触发器或对象名称。 |
| `value` | `jsonb；非空` | 覆盖对象的结构化定义和 SQL 内容。 |

**表级约束：**

- 主键 `migration_overrides_pkey`：`PRIMARY KEY (name)`

## 设计要点总结

1. **资产是中心实体。** 时间线、EXIF、缩略图、人脸、OCR、语义搜索、编辑和相册最终都围绕 `asset.id` 组织。
2. **真实文件与数据库分离。** PostgreSQL 保存路径和元数据，原图与派生文件位于 `UPLOAD_LOCATION`；恢复时二者必须一致。
3. **相册不拥有资产。** `album_asset` 只是关系，因此同一资产可以进入多个相册，删除相册不会删除原片。
4. **相册所有权也被关系化。** `album_user.role = owner` 表达唯一所有者，editor/viewer 表达协作权限。
5. **搜索采用投影表。** `smart_search`、`face_search`、`ocr_search` 保存面向不同检索方式优化的数据，避免把大向量或全文字段塞进核心资产表。
6. **同步依赖 UUIDv7 游标和删除墓碑。** `updateId`/`createId` 表示变化顺序，`*_audit` 保留已经消失的关系或实体，让离线客户端知道应该删除什么。
7. **机器学习结果与用户语义分离。** `asset_face` 保存检测框，`person_group` 表示聚类身份，`person` 保存每个用户对该人物的名称、头像和偏好。
8. **公开分享不是复制数据。** `shared_link` 和 `shared_link_asset` 只保存访问策略与关联，访客仍读取同一批资产。
9. **插件运行在 WASM 边界。** 插件二进制、方法声明与工作流配置分别存储，便于权限隔离、版本校验和可组合自动化。

## 安全阅读与修改建议

- 可以使用 `psql`、DBeaver 或 pgAdmin 只读查看这些表。
- 不要直接修改 `asset.originalPath`、关联表或 `*_audit` 表；这可能造成文件丢失、同步错乱或 schema drift。
- 结构变更应从 `server/src/schema/tables/*.table.ts` 开始，并通过项目迁移命令生成 migration。
- API 对外字段还会经过 DTO 映射，不能把数据库列直接等同于客户端 JSON。

