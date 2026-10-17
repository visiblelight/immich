# Immich v3.3.3 升级评估

2026-10-17：只读评估完成，尚未合并、升级或迁移数据库。

当前 Gallery 上游基线为 v3.2.0。官方最新稳定版 [v3.3.3](https://github.com/immich-app/immich/releases/tag/v3.3.3) 于 10 月 14 日发布，包含探索页性能修复；[v3.3.0](https://github.com/immich-app/immich/releases/tag/v3.3.0) 引入更高质量缩略图/预览、人像共享及其它改进。既有衍生图不会自动获得新画质。

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
