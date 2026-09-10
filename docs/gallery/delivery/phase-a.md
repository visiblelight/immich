# 阶段 A：工程初始化验收记录

日期：2026-09-10。状态：本地验收完成，未部署生产。

## 完成内容

1. 用户已确认的需求和架构文档独立提交；原有 Immich 数据库参考文档单独提交。
2. 已添加官方 upstream、获取标签并建立 codex/gallery 产品分支；main 留在原始上游基线，没有合入新版本。
3. 源码基线 `469a870a2233e7361bcb855b183fd41272cfd056` 已确认为官方 upstream/main 的祖先；观察到稳定版 v3.2.0，记录为尚未验证的升级候选。
4. 已建立 @gallery/core、@gallery/db、@gallery/ui、@gallery/public、@gallery/admin 五个工作区包。
5. 公共站点与后台分别生成 adapter-node 产物。基础错误页只表示未开放，不作为已确认的视觉设计。
6. 数据库包提供无默认连接的服务端连接工厂与角色配置防误用检查；尚未连接现有 Immich 数据库。
7. 已建立独立开发约定、配置示例、工具链检查、生产启动冒烟脚本与 Gallery CI workflow。
8. 本地独立安装官方 Node 24.15.0 和 pnpm 11.22.0，保留全局 Node 22；所有工具和缓存置于忽略目录。

## 本地验证结果

| 检查 | 结果 |
|---|---|
| Node 官方 SHA-256 校验 | 通过，darwin-arm64 归档校验值为 372331b969779ab5d15b949884fc6eaf88d5afe87bde8ba881d6400b9100ffc4 |
| gallery:doctor | Node/pnpm 版本和五个包依赖检查通过 |
| Gallery 过滤依赖安装 | 完成，未执行安装生命周期脚本 |
| 最终锁文件冻结安装 | 通过，供应链检查通过，无重新解析 |
| gallery:check | 五个包通过；Svelte 检查 0 errors / 0 warnings |
| gallery:test | 5 项数据库配置边界测试全部通过 |
| gallery:build | 源码包检查通过；public/admin 均完成 SSR、客户端与 adapter-node 生产构建 |
| gallery:smoke | 两个生产服务各自启动，/health/live 为 200，/health/ready 与根页为 503；测试后进程停止 |
| 共享锁文件范围 | 原有 12 个 importer、2668 个 package、2690 个 snapshot 的内容保留；只增加 Gallery importer 和新依赖 |
| Git 文本与文档链接检查 | 通过 |

构建有 adapter-node 对未使用环境模块的 empty chunk 提示，不影响产物和启动；尚未运行浏览器视觉验收，因为当前不是设计交付阶段。GitHub workflow 只完成配置，未推送、未在 GitHub 实际执行。

离线冻结安装曾因缺少供应链元数据缓存失败；未跳过策略，随后在线冻结安装通过。共享锁文件解析曾产生上游测试依赖的 peer 重排，已保留上游原始条目并验证最终冻结安装可用。

## 已保留的用户工作

初始化前备份位于本机 `/private/tmp/immich-gallery-baseline-20260910T100042Z`，其中含 tracked.patch、原 mise.lock、原数据库参考文档和方案文档。临时目录不能替代长期备份。

- mise.lock SHA-256：ecdf397dcf7f33e6a9b9ab6803fa98697921a50c5c963e1f4a7a3822a55c01c0，初始化前后不变；仍作为原有未提交修改保留。
- 数据库参考文档 SHA-256：fb2874cbe43772f3e1b312f5e3b384a976f5f98a4bee2c287954091a61b0365a，内容未变，已形成独立 Git 提交。
- 没有更改 Immich 核心源码、数据库、媒体文件或容器运行状态；没有推送远程分支。

## 尚未实现与下一阶段

阶段 B：在隔离环境验证 Gallery schema、专用数据库角色、资源所有者范围、Immich Asset/EXIF/衍生图投影、GPS 自动更新、媒体资格与上游 schema drift。现在的连接串角色检查不是数据库权限隔离的替代。

阶段 C：提供两组 PC／移动视觉方案供用户选择。之后才完成相册、账号、地图和发布业务页面。原有已确认功能不因本阶段只交付基础而被取消。

数据库迁移、完整 Compose、账号创建、公开相册、相册树、地图、媒体服务、生产就绪和上游升级演练均未宣称完成。
