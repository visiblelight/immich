# 拍摄时间证据维护

2026-10-26 旧版定时采集上线；2026-10-28 主动读取队列和 GPS 自动换算已获验收并发布，生产新版任务已安装启用；见 [本轮交付](../../../../docs/gallery/delivery/capture-refresh.md)。新照片进入 Gallery 后，由独立维护任务读取已有原片及 sidecar 的时间字段；不会改写文件、生成照片副本或扩大公开范围。

下次获准发布时的顺序：停止旧 timer 并等待服务结束 → 数据库备份 → Gallery 0017 迁移 → 新前后台构建 → 运行本目录 `install.sh` → `systemctl start gallery-capture.service` → 核对统计、原片与关联未变 → 验证通过后 `systemctl enable --now gallery-capture.timer`。维护主机需要 Python 3。安装不自动开启任务。

任务只采集当前来源范围内、已进入 Gallery 的照片。借用现有 Immich 容器的 ExifTool 和地理时区库执行只读采集；报告在进程内存中传递给 Gallery admin 角色导入。Gallery 常驻应用不挂载原片，也不接收 Immich 数据库凭据。默认容器名与现有 Compose 一致；可通过 service 环境变量 `GALLERY_CAPTURE_IMMICH_CONTAINER`、`GALLERY_CAPTURE_ADMIN_CONTAINER` 显式覆盖。

新维护进程每十五秒检查队列，优先读取明确请求的最多一百张照片；空闲时每十分钟尝试完整扫描，完整扫描失败也退避十分钟。文件锁阻止重叠采集，请求令牌阻止过期任务覆盖重试结果。相同证据与分析结果不重复写入、不重复审计；规则升级会重新分析已有证据，保留人工决定的指纹绑定。采集失败保留旧证据；来源时间或位置改变时，旧确认立即失效，重新读取后可恢复核对。完整且吻合的 GPS 证据自动换算，其余仍需核对，没有永久的相机型号默认时区。

本地运行 `sh deployment/gallery/scripts/pnpm.sh gallery:capture:worker`，默认使用 `immich_server`，每三秒检查请求，十分钟完整扫描。只加载本地 admin 角色配置。若用专用只读采集容器，通过 `GALLERY_CAPTURE_IMMICH_CONTAINER` 指定，不能把迁移凭据传给该进程。

回退：先停止 timer。后台“拍摄时间”选择照片、预览并“停用校正”，恢复 Immich 原时间；历史证据和审计保留。不要直接删迁移历史或恢复整库覆盖最新业务数据。代码回退时先停用全部已采集照片的校正，旧应用兼容新增视图列和保留的表。

首次生产扫描 534 张照片约 100 秒，复扫导入 0、未变化 534、失败 0。生产任务在核验通过后已显式启用。已有数据库备份会包含 Gallery 证据、确认和审计表，原片备份策略不变。
