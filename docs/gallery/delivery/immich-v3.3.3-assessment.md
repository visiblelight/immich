# Immich v3.3.3 升级评估

2026-10-17：只读评估完成，尚未合并、升级或迁移数据库。

当前 Gallery 上游基线为 v3.2.0。官方最新稳定版 [v3.3.3](https://github.com/immich-app/immich/releases/tag/v3.3.3) 于 10 月 14 日发布，包含探索页性能修复；[v3.3.0](https://github.com/immich-app/immich/releases/tag/v3.3.0) 引入更高质量缩略图/预览、人像共享及其它改进。既有衍生图不会自动获得新画质。

GitHub compare 返回 288 个提交；完整 Git tree（未截断）与本地迁移目录比较，新增：

- 1789419229196-ConvertUserOAuthIdEmptyStringToNull.ts
- 1790587508209-RenameGeoNamesCountries.ts
- 1790616293884-PersonSharing.ts
- 1790693088454-AddPersonUserTableSharedBySharedWithConstraint.ts

建议继续同步现有 fork 的稳定 tag，无需重新 fork。升级应沿用 v3.2.0 隔离演练流程：独立工作树检查合并与工具链变化，备份副本运行官方迁移，验证 Gallery 视图/来源资格/地点/媒体/发布契约，再演练整库与媒体恢复。尤其检查 GeoNames 国家更名与人像权限迁移。仅上述文件清单不构成兼容性通过结论。工作和生产数据库、Immich 服务与 main 均未更改。
