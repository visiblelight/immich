# Immich v3.3.3 升级评估

2026-10-17：经用户授权，现有 fork 已同步 v3.3.3，并完成生产数据库迁移与服务升级。以下保留初次评估和实际验收记录。

初次评估时 Gallery 上游基线为 v3.2.0。官方最新稳定版 [v3.3.3](https://github.com/immich-app/immich/releases/tag/v3.3.3) 于 10 月 14 日发布，包含探索页性能修复；[v3.3.0](https://github.com/immich-app/immich/releases/tag/v3.3.0) 引入更高质量缩略图/预览、人像共享及其它改进。既有衍生图不会自动获得新画质。

GitHub compare 返回 288 个提交；完整 Git tree（未截断）与本地迁移目录比较，新增：

- 1789419229196-ConvertUserOAuthIdEmptyStringToNull.ts
- 1790587508209-RenameGeoNamesCountries.ts
- 1790616293884-PersonSharing.ts
- 1790693088454-AddPersonUserTableSharedBySharedWithConstraint.ts

建议继续同步现有 fork 的稳定 tag，无需重新 fork。升级应沿用 v3.2.0 隔离演练流程：独立工作树检查合并与工具链变化，备份副本运行官方迁移，验证 Gallery 视图/来源资格/地点/媒体/发布契约，再演练整库与媒体恢复。尤其检查 GeoNames 国家更名与人像权限迁移。仅上述文件清单不构成兼容性通过结论。工作和生产数据库、Immich 服务与 main 均未更改。

## 2026-10-17 用户授权后的升级验证

已在独立工作树合并官方 v3.3.3（d2dac658fe1c67e8bbd08aa18200a32e5d45b9e4），Immich 主体与该 tag 一致，保留 Gallery 包、根脚本和发布限制。工具链同步为 Node 24.21.0 / pnpm 11.27.1，Dockerfile 使用固定摘要 Node 镜像；doctor/check/test/build/smoke 与云端工具测试通过。

服务器通过 internal 网络和临时 PostgreSQL 恢复生产数据库副本。官方 v3.2.0 检查 96 项迁移、零漂移；官方 v3.3.3 执行后 100 项迁移、零漂移。Gallery 全部表数据相同，public/admin 受限账号的目录、相片、去过及地点核对查询摘要一致。随后仅重建临时数据库，从原完整 dump 恢复，旧版再次验证 96 项迁移、零漂移，Gallery 摘要相同。临时数据库与网络已移除，生产库和媒体没有被这次演练修改。

数据比较排除了 pg_dump 每次随机生成的 restrict/unrestrict 安全标记，未忽略任何业务行；恢复使用完整 custom-format dump，而非用于比较的数据-only SQL。

正式发布由服务器 systemd 独立执行：暂停 public/admin/Immich server/ML，生成一致数据库、角色、完整媒体和私有配置备份后，执行固定官方镜像内迁移；运行服务仍保持原权限。新服务健康检查失败会恢复备份和旧程序。普通 Gallery CI 自动部署在协调发布期间暂时关闭，结束后恢复。

本地旧开发环境不随生产升级自动迁移。新源码保留于独立升级工作树；原工作目录 mise.lock 修改保持原样。旧的 v3.2.0 本地验证依赖/备份入口仍属于历史演练，本次官方漂移核验改用对应版本的官方镜像。

## 正式发布结果

生产应用提交为 `3624f9631c0e7c2b6199f1b0851880a6256b5c69`，Gallery 镜像为 `ghcr.io/visiblelight/gallery@sha256:bf7e850b3a6751ab10d8bb7bfd0d5f4aa00d187e2d53836fd5af92bcc160e62a`。[GitHub Actions 39023740235](https://github.com/visiblelight/immich/actions/runs/39023740235) 检查和构建成功。新 v3.3.3 数据库结构上的 26 项 Gallery 回归全部通过，结构漂移为零。

服务器 systemd 独立完成正式升级，四个应用服务均 healthy，版本接口返回 v3.3.3。官方迁移记录从 96 项增至 100 项，官方结构检查 drift 为 0。相册第二页、相片、国家地图、已发布文章均 HTTP 200；分页文案已确认无“相册”后缀。后台受限账号只读核验 376 张有 GPS 照片：国家未识别 1 张、城镇待完善 27 张、已归属 348 张；未代用户确认照片归属。

一致备份位于服务器 `/srv/vision/backups/immich-333-20261017T101624Z`，包含完整数据库、角色、约 19GB 媒体、私有配置及校验清单。回滚必须使用相匹配的数据库、媒体及旧版本，不能只降级 Immich 镜像。备份保留后磁盘可用约 6.4GB，后续容量管理需保留有效恢复副本。

首次启动在停止服务前因 Git 递归访问测试素材子模块退出，未更改数据库。升级脚本改为不递归获取生产不使用的测试子模块后重试成功。日常 `GALLERY_DEPLOY_ENABLED` 已恢复为 true。发布由 GitHub 构建镜像、服务器执行备份和迁移，本机仅发起并检查状态。
