# GPS 自动换算与重新读取交付

2026-10-28：本地实现已获用户验收，已按授权 commit、push 并发布生产，完成真实图库验收。确认范围见 [ADR 0025](../decisions/0025-capture-auto-refresh.md)。

## 实现

- GPS 证据完整且吻合时自动得到 verified；明确偏移保持原规则，缺失与冲突继续待核对。
- 同一证据的规则变化也会重新分析，保留证据指纹及人工决定；重复分析结果相同则不写入。
- Gallery 0017 增加读取队列，后台单张／批量重新读取，展示等待、读取中、完成、失败与超时重试；完成后页面自动更新。
- 独立维护进程优先处理请求，没有请求时最多每十分钟扫描全图库；生产已安装并启用，每十五秒检查队列。本地通过 `gallery:capture:worker` 持续处理真实读取请求。
- 不扩大常驻前后台权限，不修改 Immich 或图片文件。

## 验收

- `gallery:check`：前后台及共享组件零错误、零警告；`gallery:build` 通过。
- `gallery:test`：72 项数据库/核心单元测试、3 项后台测试、15 项前台测试通过。
- `gallery:test:db`：29 项完整隔离验收通过，包括备份恢复、公开范围、角色权限、来源变化、旧任务隔离、失败保留旧证据、人工确认和停用优先；Immich schema drift 为 0。新增“后补位置但没有有效 GPS 时间，读取后仍可人工校正”的专项验证。
- 对先前只读保存的 534 张生产时间证据在本地重放：449 项完全不变，85 项由 suggested 变 verified，换算值与原建议相同；无其他变化。没有向本地数据库导入生产照片，也未写生产环境。
- 当前本地真实图库 12 张，完整读取 imported 0 / unchanged 12 / stale 0 / readErrors 0。浏览器实际验证单张、两张批量读取：等待状态出现，完成后页面自动显示完成提示和读取时间，原展示时间不变。
- 原图库前后 27 张来源/内容表行数与内容指纹一致，47 个原片、缩略图和关联媒体的 SHA256 一致。

本地 0017 已应用；前后台 3100/3101 就绪。备份及私有验证材料位于 `.gallery-local/capture-refresh/`：`before.dump`（已验证备份目录）、`data-before/after.json`、`media-before/after.json`、`replay-summary.json`、页面截图与运行日志。该目录被忽略，不提交 Git。

本地 Immich 原容器报告 running，但没有运行进程，无法执行采集。本轮未启动 Immich 应用或任何元数据处理任务，改用 `gallery-capture-reader`：沿用同一镜像与现有挂载，根文件系统和共享挂载只读，无新增端口，仅用于独立读取。后台维护进程通过 `GALLERY_CAPTURE_IMMICH_CONTAINER=gallery-capture-reader` 运行；它的本地配置为私有 0600 文件。原 Immich 服务运行异常不在本轮修复范围。

## 本地验收入口

- `http://localhost:3101/capture-times`：真实图库管理，切换“全部”，可单张或批量重新读取。
- `http://localhost:3101/design/capture-times`：已核验时间字段的只读对照。佳能佩特拉自动显示 12:21:37；索尼第比利斯保持 14:19:28；后补位置但无有效 GPS UTC 的佳能照片仍待人工指定源时区。

回退代码前停止新 worker；0017 可保留，不删历史。已确认/停用的决定优先级不变。自动校正可通过既有“停用校正”恢复 Immich 时间显示，原片及内容关联没有回滚需要。

## 生产发布与验收（2026-10-28）

- 功能提交 `80d94b39f4d9880c3905bc76c51a84655a7c66c0` 已推送 `codex/gallery`；[Gallery CI 40647929869](https://github.com/visiblelight/immich/actions/runs/40647929869) 的检查、镜像和部署全部成功。生产镜像 `ghcr.io/visiblelight/gallery@sha256:07f8b05dfa57e781f9032c7bae71cfc3044451ce43332454165c5f5f09d60ea6`。
- 先停止旧 timer 并确认服务空闲；数据库、角色、配置、旧任务和旧版本备份保存在服务器私有目录 `/srv/vision/backups/before-capture-refresh-80d94b39f4d9`。校验和与备份目录读取通过。专用迁移角色只应用 0017，常驻前后台没有获得迁移凭据。
- 新前后台部署并通过健康检查后安装新版维护脚本。首次采集 558 张，imported 109 / unchanged 449 / stale 0 / readErrors 0；109 项为既有证据重新分析，证据指纹均未变化。
- 27 张此前 suggested 的照片自动变 verified，换算值与原建议一致，待核对由 36 降至 9。最终 verified 459、confirmed 90、unknown 9；90 项人工确认及整个校正表逐字段保持不变。现有明确偏移的展示结果保持不变。
- 浏览器实测 `IMG_2017_01_24_0403.JPG` 重新读取，状态经过读取中并自动完成；后台和生产前台均显示 **2017/01/24 11:00:52 · Asia/Amman**。`IMG_2017_01_23_0192.JPG` 的既有人工确认是 **14:57:07**，再次读取后仍保留，本轮没有再次修改其确认。
- 27 张来源／内容表指纹、2106 个原片／sidecar／预览／缩略图 SHA256 前后相同，Immich 公共 schema 未变化。未改写元数据、媒体文件、OSS、相册／照片组／文章关联或人工行程。
- 定时任务已启用；公网前后台 ready，样稿页面返回 404，匿名管理页跳转登录。操作与核验材料在服务器 `/srv/vision/capture-release-80d94b39f4d9`，本机截图及统计在 `.gallery-local/capture-refresh/`。

代码回退可使用 `/srv/vision/releases/previous` 记录的 `529dbcab9` 镜像及上述旧任务备份。先停新版任务，保留 0017 和审计；若要同时撤销自动时间效果，先通过既有核对流程停用相关校正，避免整库恢复覆盖发布后的业务写入。
