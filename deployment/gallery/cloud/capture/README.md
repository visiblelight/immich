# 拍摄时间证据维护

本地实现阶段，生产未安装或启用。新照片进入 Gallery 后，由独立维护任务读取已有原片及 sidecar 的时间字段；不会改写文件、生成照片副本或扩大公开范围。

部署顺序：数据库备份 → Gallery 0016 迁移 → 新前后台构建 → 运行本目录 `install.sh` → `systemctl start gallery-capture.service` → 核对统计、原片与关联未变 → 用户验收后 `systemctl enable --now gallery-capture.timer`。安装不自动开启任务。

任务只采集当前来源范围内、已进入 Gallery 的照片。借用现有 Immich 容器的 ExifTool 和地理时区库执行只读采集；报告以 0600 临时文件传递给 Gallery admin 角色导入，完成或失败后移除。Gallery 常驻应用不挂载原片，也不接收 Immich 数据库凭据。默认容器名与现有 Compose 一致；可通过 service 环境变量 `GALLERY_CAPTURE_IMMICH_CONTAINER`、`GALLERY_CAPTURE_ADMIN_CONTAINER` 显式覆盖。

每轮结束十分钟后再扫描；相同证据不重复写入、不重复审计。采集失败保留旧证据并使任务以非零状态退出，不把缺失当作新证据。来源时间或位置改变时，旧确认立即失效；原片/sidecar 中仅元数据改变、Immich 尚未刷新的变化，在下一轮读取后失效。建议始终需要人工确认，没有永久的相机型号默认时区。

回退：先停止 timer。后台“拍摄时间”选择照片、预览并“停用校正”，恢复 Immich 原时间；历史证据和审计保留。不要直接删迁移历史或恢复整库覆盖最新业务数据。代码回退时先停用全部已采集照片的校正，旧应用兼容新增视图列和保留的表。

整库/大量文件扫描的耗时需生产首次运行实测；本阶段没有自动启用生产任务。已有数据库备份会包含 Gallery 证据、确认和审计表，原片备份策略不变。
