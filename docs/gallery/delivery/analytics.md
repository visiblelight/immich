# Umami 私有统计交付

需求已确认，2026-09-21。见 ADR 0015。以下为实现和部署准备；生产验收完成后补充实测记录。

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

Gallery check 零错误零警告，test 与 build 通过；新增公开路由白名单和来源脱敏测试。Edge 新增精确路由及恶意配置拒绝测试通过。生产及浏览器验证待下方记录。
