# 拍摄时间证据与校正数据字典

对应迁移：0016、0017、0018；确认范围：[ADR 0024](../decisions/0024-capture-time-evidence.md)、[ADR 0025](../decisions/0025-capture-auto-refresh.md)、[ADR 0028](../decisions/0028-capture-confirmation-reuse.md)。不修改 Immich schema、数据或媒体，也不向发布快照复制 GPS。

## 表

`gallery.capture_evidence`：每个 Immich asset 一行，没有跨 schema 外键。

| 字段 | 类型 | 含义 |
|---|---|---|
| asset_id | uuid PK | 当前来源照片标识，不授予公开访问权 |
| source_signature | text | 来源 UTC 时间、相机本地字段、时区及实时 GPS 的 MD5 变化标识；不是安全凭据 |
| source_time_signature | text nullable | 0018 新增；仅来源 taken_at、local_taken_at 的 MD5 变化标识，不含位置。NULL 表示尚无可验证的历史时间基线 |
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
| resolved | jsonb nullable | 校正后的 takenAt、localTakenAt、timeZone；仅地点变化后复用时可带 cameraConfirmationReused=true；停用时为空 |
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

## 分别确认地点时区（ADR 0026，无新增迁移）

人工核对允许为每张照片显式传入 `destinationZone`（IANA 或合法 UTC 偏移）；null 表示只确认相机时区，省略时保持旧接口沿用证据地点的行为。地点候选来自已有证据或带有效范围坐标的 Immich IANA 时区字段，后者必须由管理员主动选用。候选不写入证据，不参与自动判断，不影响 fingerprint。

结果仍保存于 `capture_correction.resolved.timeZone/localTakenAt/takenAt`，相机时区保存在原有 `source_zone`。没有地点时区时 `resolved.timeZone=null`，前台只对 verified/confirmed 记录通过钟表与真实时刻之差显示相机 UTC 偏移；不会据此生成地点时区或自动到访日期。既有来源变化失效、版本并发、停用及权限规则保持不变。

## 更新状态与自动刷新（ADR 0027，无新增迁移）

管理查询增加 `has_location`，只根据实时坐标是否有效返回布尔值，仍不把经纬度发送到时间管理页。页面用共享分类函数区分人工核对、更新中、读取失败、已确认、保留原始时间及未采集/已停用。来源签名失效和队列工作不计入人工待核对；无有效位置但有相机钟表的非冲突记录也不产生地点补充任务。来源/证据的底层状态及换算算法未改变。

可见的管理页闲置每 15 秒重新查询，更新中每 2.5 秒；切回窗口立即查询。隐藏页面、确认弹窗、提交中暂停；离页清理监听和定时器。发现 stale 且没有当前读取或失败任务时，调用既有鉴权 `capture-refresh` 接口，每批最多 100 张、每个来源签名每次打开页面只自动提交一次。请求失败显示重试提示，不无限提交；处理完成自动更新筛选、数量、选择及分页。没有打开管理页时仍由原来的后台定时扫描处理。

读取失败/过期保留重试入口。后续全量扫描若采集到与当前来源一致、且比失败完成时间更新的证据，管理查询不再显示被该成功结果取代的旧失败；队列表的历史记录仍保留。恢复网络后重试查询，不修改原片、Immich 元数据或既有人工决定的版本保护规则。

## 仅地点变化时复用确认（ADR 0028、迁移 0018）

迁移只在旧完整 source_signature 与当前来源一致时补齐 source_time_signature。已过期且无时间基线的旧记录不推断；临时哈希快照在迁移事务结束即删除，不扩大运行账号权限。后续采集始终保存独立时间签名。

复用要求：原决定为 confirmed，并仍绑定上一份证据及来源；新旧源时间签名一致；clock、explicitOffset、dateSource、gpsUtc、gpsStatus、gpsPositionValid 未变。新生效的 GPS 时间不能与原确认相差超过两分钟。仅 destinationZone、gpsPositionMatches 等地点信息改变时，用已确认的 source_zone 重新计算结果，不沿用旧当地时间。失去地点时保留相机钟表，地点时区为空。停用决定不自动复用。

成功复用在采集事务内更新 correction 的来源绑定、resolved、version 和 updated_at，保留原 updated_by，并记录 capture.reuse-camera-zone 审计。源时间变化使旧绑定失效，之后再更新 GPS 也不能重新启用旧确认；独立可信的新证据仍按既有自动换算规则分析。

后台照片链接优先取 published_photo，相册不可见但文章公开时由 published_article_photo 与 published_article 生成文章内照片锚点；没有公开资格的照片仅提供后台核验入口。文章渲染仅为已授权的图片生成稳定 photo ID 锚点，并支持定位后打开看图器；封面照片可从同一已授权图片映射中打开。链接不授予任何额外公开权限。
