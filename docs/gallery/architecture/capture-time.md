# 拍摄时间证据与校正数据字典

对应迁移：0016、0017；确认范围：[ADR 0024](../decisions/0024-capture-time-evidence.md)、[ADR 0025](../decisions/0025-capture-auto-refresh.md)。不修改 Immich schema、数据或媒体，也不向发布快照复制 GPS。

## 表

`gallery.capture_evidence`：每个 Immich asset 一行，没有跨 schema 外键。

| 字段 | 类型 | 含义 |
|---|---|---|
| asset_id | uuid PK | 当前来源照片标识，不授予公开访问权 |
| source_signature | text | 来源 UTC 时间、相机本地字段、时区及实时 GPS 的 MD5 变化标识；不是安全凭据 |
| fingerprint | text | 规范化证据 JSON 的 SHA256 |
| evidence | jsonb | 相机钟表 clock、显式偏移 explicitOffset（分钟）、日期字段来源 dateSource、地点历史时区 destinationZone、GPS UTC 和定位有效性/匹配布尔值；不存经纬度或文件路径 |
| analysis | jsonb | verified/suggested/unknown/conflict、原因、建议源时区、UTC 时刻、当地钟表及 GPS 校验差 |
| version | bigint | 每次有效证据变化递增，默认 1 |
| collected_at | timestamptz | 最近证据变化的采集时刻；相同输入不更新 |

相同证据在分析规则升级后可更新 analysis 与 version/collected_at，但 fingerprint 不变，已确认或停用的决定继续生效。可靠 GPS 的自动结果为 verified，保留相机秒数。

`gallery.capture_refresh`（0017）：每个 asset 保留最近一次主动读取请求，无 Immich 外键。

| 字段 | 类型 | 含义 |
|---|---|---|
| asset_id | uuid PK | 当前合格 Gallery 照片 |
| token | uuid | 每次新请求的代次；旧任务不能覆盖新请求 |
| state | text | queued / reading / completed / failed |
| requested_by | uuid FK | Gallery 管理员 |
| requested_at / started_at / finished_at | timestamptz | 请求、领取、完成时间，后两项可空 |
| error | text nullable | 固定安全提示，不记录路径、密码或原始错误 |

仅 gallery_admin 有 SELECT/INSERT/UPDATE，公共及 community 角色无访问权。入队检查当前来源资格；维护进程独占领取最多 100 项，并对失去资格的请求标为失败。等待超过两分钟、读取超过十五分钟可重试。导入证据与完成状态在同一事务中落库；任务代次变化则丢弃旧结果。失败不覆盖最近有效证据。全量自动扫描不生成请求记录。

`gallery.capture_correction`：每个 asset 一条当前人工决定；完整历史记录在 `audit_event`。

| 字段 | 类型 | 含义 |
|---|---|---|
| asset_id | uuid PK | 照片标识，无跨 schema 外键 |
| source_signature / evidence_fingerprint | text | 绑定确认时的原记录及证据，任一不符即不应用 |
| mode | text | confirmed 应用明确确认；disabled 恢复 Immich 原时间 |
| source_zone | text nullable | 人工指定或明确接受建议的 UTC 偏移 / IANA 时区 |
| resolved | jsonb nullable | 校正后的 takenAt、localTakenAt、timeZone；停用时为空 |
| version | bigint | 乐观并发版本，默认 1 |
| updated_by | uuid FK | Gallery 管理员，引用 gallery.user |
| updated_at | timestamptz | 决定时间 |

钟表字段 `clock` / `localTakenAt` 用 UTC 形状的 ISO 字符串承载年月日时分秒，不代表 UTC 时刻。只有 `takenAt` 和 `gpsUtc` 是真正的时刻。时区换算使用拍摄日期的历史规则；重复/缺失的夏令时时间拒绝自动解释，要求指定明确偏移。

## 视图、权限和一致性

- `capture_source_asset` 保留原 `admin_source_asset` 的来源白名单、资源状态和两种衍生图检查，返回未校正的时间及 source_signature。只有 admin/view_owner 可读。
- `admin_source_asset` 原列顺序保留；时间三列改为有效结果，追加 capture_status/source_signature。采集 verified 或人工 confirmed 才替换 UTC 时刻；suggested/unknown/conflict 使用相机钟表展示，清空地点时区，排序时暂保留 Immich 原 UTC；stale 自动停止使用旧结果。
- `article_source_photo` 和 `published_photo` 继续执行现有公开继承、快照成员、来源范围、照片隐藏、坐标公开精度规则，追加 capture_status。前台只得到有效时间和状态，不得到完整时间证据。
- 公共展示、按拍摄时间排序、年月过滤、自动行程推断从同一视图读有效值；未确认的当地日期不用于已知日期的自动行程。人工国家/省级行程显式日期不被时间操作修改。
- 两张新表：admin SELECT/INSERT/UPDATE，view_owner SELECT；public/community 无表权限。纯计算签名函数不读表，可由视图调用者执行，不是 SECURITY DEFINER。
- 导入及确认由 site 行锁串行化；预览和提交都校验来源签名、证据版本、确认版本。批量中任一不符整批回滚。来源并发变化后的旧签名确认即使写入也不会生效。
- 审计 action：capture.collect、capture.confirm、capture.disable，记录证据指纹、操作人及前后有效时间。没有覆盖相册、照片组、文章或到访记录的写入。

来源的时间/GPS 更新后即时失效；文件内部元数据改变但 Immich 尚未更新的情况，由下一次只读扫描发现。已停用决定绑定当前证据；新的来源证据需要重新核对。证据采集范围为已经进入 Gallery 的合格照片，并非任意已知 asset ID。
