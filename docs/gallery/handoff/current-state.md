# 当前状态与接续事项

核对时间：2026-11-03，Asia/Shanghai。以下为一次只读检查的快照；下次接手先重新检查。不要据此启动或覆盖服务。

## 2026-11-07 子相册发布准备

子相册已改为 4:3 大封面卡片，直接子相册一次完整展示，并移除子相册的加载结束提示。用户已验收本地效果并授权提交、推送和生产发布；实际部署结果将于完成后更新。见[实现与验证记录](../delivery/child-albums.md)。本机 3102 为这次候选构建预览，3100/3101 保持原服务；没有修改图库数据，既有 `mise.lock` 改动保留不动。11-07 发布前核验生产仍为下列应用版本，前后台 ready，根盘可用约 51G；其余历史服务细节仍以 11-03 检查为准。

## 代码、工具链和生产版本

| 项目 | 核对结果 |
|---|---|
| 当前工作目录 | `/Users/vision/NAS/hub/work/projects/immich`；新机可不同 |
| 产品分支 | `codex/gallery` |
| origin | `git@github.com:visiblelight/immich.git` |
| upstream | `https://github.com/immich-app/immich.git` |
| 文档整理前 HEAD | `579f33529`：上次生产验收文档提交；不是本次归档后的 HEAD |
| 本地升级配置归档 | `abdca3c60`；交接文档在其后的独立提交归档，当前 HEAD 用 `git log -1` 核对 |
| 生产实际应用提交 | `667d972ae31efb3a7483566ac57127c65dcde892` |
| 生产镜像 | `ghcr.io/visiblelight/gallery@sha256:83df5aa08848a8be05b0c2fe78bf1ad1eede98b8ad17d220cfc14c788e8e86f9` |
| Immich 基线 | `v3.3.3`，源码 `d2dac658fe1c67e8bbd08aa18200a32e5d45b9e4`；生产版本接口实测 3.3.3 |
| Gallery 数据库 | 生产迁移 18 项，`0001` 至 `0018` |
| Node / pnpm | `24.21.0` / `11.27.1`；以后以 `mise.toml`、根 `packageManager` 为准 |
| 最近完整功能验收 | [2026-11-01 交付记录](../delivery/capture-confirmation-reuse.md)；[CI 41263738253](https://github.com/visiblelight/immich/actions/runs/41263738253) |

文档提交与应用提交不同是正常现象：本次两个归档提交均使用 `[skip ci]`，不重新构建或发布生产应用。不要仅按文件扩展名推断 CI 是否会执行，deployment/gallery 下的文档也匹配 workflow。`deployment/gallery/baseline.json` 的 Immich/toolchain 信息可参考，但 `phase`、`productionReady`、早期迁移数量等仍是历史阶段字段，**不能用来判断现在是否已上线**；本轮未修改这个受工具读取的文件。

没有在本次任务查询上游新版本，也没有升级 Immich；“当前基线”不等于“今天最新稳定版”。

## 交接前修改与本次归档

用户已明确授权交接文档和本地升级配置分别提交、推送，并要求不发布生产；`mise.lock` 继续保留不动。本地升级配置先归档，交接文档在随后独立提交中归档。

| 文件 | 处理结果 |
|---|---|
| `deployment/gallery/upgrade/dev-compose.yml` | 已在 `abdca3c60` 归档 v3.3.3 镜像和版本标识；新机克隆包含该提交的分支即可取得，无需再寻找旧补丁 |
| `docs/gallery/delivery/immich-v3.3.3-assessment.md` | 与本地配置同一提交归档，保留 2026-10-18 实际升级验收及 2026-11-03 配置检查范围 |
| `docs/gallery/README.md` | 原有升级入口说明保留，随本轮交接文档整理一并归档 |
| `mise.lock` | 唯一明确留在工作区的既有修改；FFmpeg 平台锁定条目差异不暂存、不恢复、不重生成 |

两个提交都带 `[skip ci]`。远端同步结果以 `git ls-remote origin refs/heads/codex/gallery` 与本地 HEAD 核对，未来接手仍先看实际 `git status`；新产生的未提交修改不能靠此表推断归属。`mise.lock` 的本机差异仍需私有迁移副本，不能假定远端已有。

## 服务现状

**本地**：Docker context 为 `colima`；Gallery `http://localhost:3100/health/ready`、`http://localhost:3101/health/ready` 均返回 ready。`immich_postgres` healthy。当前数据库挂载为 `docker/library/postgres`，Immich 媒体挂载为 `docker/library/photos → /data`，文章素材为 `.gallery-local/article-media`。本机没有 `.devcontainer/library`。

`immich_server` 和 `immich_web` 容器显示 Up，但本次 `2283/api/server/ping` 返回 Empty reply；`immich_redis` 已退出。**不能把本地 Immich 记为健康**。`gallery-capture-reader` 只读维护容器在运行；Gallery 现有图库读取与 Immich API 健康是不同检查项。本次只整理文档，没有擅自重启或修复它们。后续需要上传/编辑 Immich 时，先按[依赖挂载排查](../development/immich-dependency-mounts.md)核验日志、Redis 和挂载，保留数据卷。

**生产**：`vision-public-1`、`vision-admin-1`、Immich server/ML、数据库、Redis 均 healthy；前后台 readiness 正常。`gallery-capture.timer`、`gallery-media-sync.timer`、`gallery-certificate.timer` 均已调度。服务器根盘 148G，可用约 55G；容量只代表本次采样。

服务器还有 Edge、JVS、访问统计和图片检测等服务，本机还有 CVAT；它们不属于普通 Gallery 发布的重启范围。

## 最新已交付行为

2026-11-01 的生产版已经包含：

- 已确认相机时区，在原始时间和时间证据不变、只补 GPS 时复用；源时间变化后重新核对，不会因再次补 GPS 复活失效确认。
- 来源变化或主动重新读取时显示“正在更新拍摄时间”，处理完自动刷新；处理中与真正需要人工确认分开。
- 到访后台先按国家/省份名称，再按同地点日期倒序排列，排序在分页之前完成。
- 核验链接覆盖相册公开、仅文章公开及仅后台可见照片；不扩大公开资格。
- 人工行程保持明确成员，新补照片不会擅自加入或合并人工行程。格鲁吉亚、西班牙出现相邻自动段与人工段时，可显式勾选合并，不应再改成无条件自动合并。

上次验收的数字是 **2026-11-01 历史证据**：611 张时间证据，609 张自动或人工确认，2 张缺少依据；569 张相册链接、37 张文章链接、5 张后台入口。106 项单元测试、29 项完整隔离数据库测试通过；2,294 个原片/衍生文件的 SHA-256 前后一致。本次没有重跑这些业务验收，也不把这些计数作为今天的硬编码预期。

## 后续需要留意的真实缺口

1. **换机可移植性**：`deployment/gallery/cloud/capture/worker.py --local` 当前固定使用 `.gallery-local/toolchain/node-v24.21.0-darwin-arm64/bin/node`。其他系统/架构须先改为受控工具链路径选择并验证；不能仅把 Linux 二进制放进假冒的 darwin 目录。普通 pnpm 包装器已有 PATH 回退，但这个 worker 尚无。
2. **本地 Immich 健康**：见上面的 Empty reply / Redis 退出，原因尚未在本轮诊断。不要把它误判为生产故障，也不要通过重新初始化库解决。
3. **备份脚本覆盖**：旧 `cloud/backup.sh` 停写名单不包括后来新增的前台互动写入和拍摄时间任务，且未单独导出全局数据库角色。它不能直接证明当前完整停写检查点；见[生产运维](production-operations.md)中的补充步骤。
4. **异机恢复保障**：已确认服务器有历史备份目录；没有在本次验证持续异机备份、目标可用性或新电脑恢复演练。用户仍需实际保存私有迁移包；文档不是备份。
5. **文档历史字段**：早期 MVP 设计、初期交付和 baseline JSON 含历史状态。入口已加区分；不要因为旧文档说“评论待实现”“地图暂缓”而重做已上线功能。
6. **主动延期的产品能力**：专项机器人防护由用户要求暂缓；不应重新引入复杂验证流程。头像不开放上传；文章点赞界面隐藏，底层能力保留。其他未来国家省州地图尚未因此自动获准实现。

## 回退证据位置

服务器已确认存在：

- `/srv/vision/backups/before-capture-reuse-667d972ae31e`：上次 Gallery 发布检查点，含数据库、角色、配置和旧版本等；不能当作完整媒体归档。
- `/srv/vision/backups/immich-333-20261017T101624Z`：Immich 升级时的完整配套恢复副本，历史验收含数据库、角色、约 19GB 媒体及配置。

本次只核对目录存在，没有重新验证全部归档内容。旧备份不能恢复其创建之后的新数据。普通应用回退可保留兼容新增列；Immich 版本回退必须使用配套数据库和媒体，不能只降级镜像。
