# Umami 私有统计交付

需求已确认，2026-09-21。见 ADR 0015。已完成生产部署与当前网络浏览器验收，实际结果见末节。

## 实现

- 公共根布局按部署环境启用，默认关闭；使用官方脚本、手动页面事件，避免 SPA 与自动统计重复。
- 公开页面 PV、photo_view（打开照片）、country_view（国家详情）。页面筛选和翻页不重复计 PV。
- 只允许成功的公开内容路由，不采集参数/片段，外部来源仅保留域名；DNT 与当前浏览器排除设置有效。
- 管理后台增加访问统计说明及独立后台入口。前台偏好入口 `/analytics-preferences`，本页不统计。
- 不增加 Gallery 数据表，不改变 Immich，也不影响公开媒体授权。

## 配置

公共运行环境：`GALLERY_ANALYTICS_WEBSITE_ID`，仅正式域名且 UUID 有效时启用；域名使用既有 `GALLERY_PUBLIC_ORIGIN`。
后台运行环境：`GALLERY_ANALYTICS_DASHBOARD_URL=https://stats.vision.ke`。

统计部署代码维护在 `deployment/gallery/cloud/analytics`，属于本产品 Git 维护线；独立 Compose 项目 `gallery-analytics`。服务器仍在 `/root/work/immich` 下维护代码，不复制出第二份失去版本管理的源码。数据和私有配置 `/srv/gallery-analytics`。
Edge 的域名与两条精确代理路由在独立 edge 仓库维护。仅 Umami Web 加入独立 `gallery-analytics-edge`，数据库使用其内部网络；不占用新的公网端口。

## 运维

- 官方 Umami 3.4.0、PostgreSQL 17 镜像均按真实拉取摘要固定在私有 deployment.env。
- 初始化时只开放宿主回环 3300，完成默认密码替换后才接入 Edge。
- 数据库 owner 只用于数据库容器、维护迁移；应用使用 umami_runtime，无数据库/表所有权及建表权限。应用启动跳过迁移。
- Umami 内存上限 768 MiB、1 CPU，数据库 384 MiB、0.5 CPU；这些是上限，不代表实测占用。
- 未启用公开报表分享、会话录像、热力图、身份识别、Umami 自身 telemetry。
- 首次初始化用 bootstrap.py（非重复执行脚本），中断后需核对实际阶段，再恢复，不删除数据库重来。
- 升级前运行 backup.sh 新备份目录；停止 Umami 写入后，固定新镜像，用 maintenance migrate 运行审查过的迁移，再启动 Web。默认权限覆盖新表，新版本仍须检查权限需求和兼容性。
- 回滚仅改前端统计环境即可停报；Edge 故障不影响 Gallery 页面。Umami 数据库若发生迁移，应用回滚须配套已验证的数据恢复，不能只切镜像。
- 备份含 pg_dump、自有 Compose 及敏感配置；只保存在私有目录。备份到新隔离 PostgreSQL 后 pg_restore，再创建/验证运行角色权限后接入候选 Umami。禁止覆盖生产库做恢复测试。
- 统计不是审计日志：客户端可拒绝或伪造上报，访客数为估算；大陆及境外多网络实测另行验收。

## 本地验证

Gallery check 零错误零警告，test 与 build 通过；新增公开路由白名单和来源脱敏测试。Edge 新增精确路由及恶意配置拒绝测试通过。生产及浏览器验证见下方记录。

## 2026-09-21 生产验收

- Gallery 提交 `96c375175` 经 GitHub 流水线 `35572167800` 完成检查、镜像构建与生产发布，三阶段全部成功。Edge 提交 `83747d4` 通过本地维护线发布，候选及运行中 nginx -t 均通过。
- Umami 3.4.0 镜像 `ghcr.io/umami-software/umami@sha256:85909afc45bdcda1917394594a087421fdbb05610fded0fa9f6fb861abb2f367`；PostgreSQL 镜像 `postgres@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24`。
- `stats.vision.ke` HTTPS 登录页可访问，独立 Let’s Encrypt 证书初始到期 2026-12-20，纳入 Edge 原有 Certbot 续期和代理证书重载机制；本轮没有单独重复 ACME dry-run。
- 正式账号登录和已认证报表 API 成功；匿名报表请求及默认 admin/umami 登录均被 401 拒绝。新密码仅保存在服务器私有 secrets/login.json 和本机被 Git 忽略的 .gallery-local/analytics/login.json。
- 常驻 umami_runtime 非超级用户，无建库、建角色及 public schema CREATE 权限；数据位于独立 PostgreSQL，与 Gallery/Immich 无数据表关联。
- 实测浏览器初次打开 `/photos` 只有一次 PV；切换排序零额外上报；打开大图恰有一次 photo_view。直接查询统计数据库确认真实落库。上报 payload 不含原始查询字符串或片段。
- 浏览器排除设置后访问相册零统计请求；验收后恢复原有允许统计偏好。浏览器模拟阻断 `/analytics/*` 时照片页仍正常；网络阻断在验收后撤销。
- Gallery 前台、后台登录、Immich、JVS、统计后台和同域脚本均返回 HTTP 200；Gallery 与统计容器 healthy。初始空载 Umami 约 188 MiB、数据库约 32 MiB，仅为当前小样本实测。
- 初始化备份 `/srv/gallery-analytics/backups/initial-20260921` 成功，在同统计 PostgreSQL 中创建独立一次性验证库并恢复，核对 1 个站点、26 条已应用迁移；随后清理验证库，不操作生产数据。该备份为同机检查点，定时备份与异机保存尚未配置。
- 本轮浏览器验收数据为少量真实测试浏览，保留在统计中；不伪装成真实访客增长。不同大陆运营商和境外地区的全面可达性仍待用户实测。
