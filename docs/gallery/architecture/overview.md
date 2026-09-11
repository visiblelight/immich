# 应用与部署架构

> 2026-09-11 范围修订：见 [ADR 0002](../decisions/0002-albums-first.md)。首页／地图暂缓，详细介绍不再插图，关于未来由文章选篇。本文保留已验证结构和扩展边界，不代表相应 UI 仍在 MVP；本轮未修改迁移或新增文章表。

状态：已确认。版本：0.1，2026-09-10。

## 1. 应用边界

```text
管理员／家人 → immich.example.com → Immich Web / Server
                                             ↓ 资源管理
                              同一 PostgreSQL 数据库与媒体盘
                                             ↑ 受控只读
管理员 → gallery-admin.example.com → Gallery Admin
公众   → gallery.example.com       → Gallery Public（PC / Mobile）
```

Gallery Admin 和 Public 是独立进程、独立运行账号、独立数据库凭据。PC 与移动共用内容及 URL，但维护专门设计的页面组合和交互。Immich 登录、密码、共享链接密钥不进入 Gallery 账号体系。

## 2. 拟创建的代码目录

| 目录 | 职责 |
|---|---|
| `packages/gallery-public/` | SvelteKit 公共页面、服务端查询入口、公开媒体与地图接口 |
| `packages/gallery-admin/` | SvelteKit 后台、登录会话、编辑与发布操作、认证预览 |
| `packages/gallery-core/` | 纯领域类型、内容校验、公开策略和发布规则，明确服务端导出边界 |
| `packages/gallery-db/` | Kysely 查询、Immich 适配、迁移、视图和权限初始化 |
| `packages/gallery-ui/` | Gallery 视觉组件、故事块和两端共享基础组件 |
| `deployment/gallery/` | Docker 构建入口、Compose 扩展、反向代理配置、环境示例 |
| `docs/gallery/` | 独立产品与开发文档 |

媒体变体和缓存先作为 gallery-public 内的服务端模块；认证预览按共享接口复用必要逻辑，不额外拆出独立微服务。SvelteKit 使用 Node 服务部署方式；沿用仓库已有 TypeScript/Svelte/Kysely 方向，具体新增依赖在技术阶段锁定版本。公开 bundle 不导入数据库、密码或服务器配置模块。

不复制 Immich Web UI 来当 Gallery 前台，不修改上游核心相册／Asset 表实现 Gallery 业务。尽量把根目录变更限制在必需的依赖锁文件与集成配置。

## 3. 三个域名

| 配置 | 示例 | 用途 |
|---|---|---|
| `IMMICH_ORIGIN` | `https://immich.example.com` | 管理与家庭浏览 |
| `GALLERY_PUBLIC_ORIGIN` | `https://gallery.example.com` | 公开 PC／移动站点 |
| `GALLERY_ADMIN_ORIGIN` | `https://gallery-admin.example.com` | 内容管理与认证预览 |

域名由环境变量提供；链接、canonical、分享与 Cookie 策略以各自 origin 为准。后台预览在后台域名运行，避免跨域共享管理员会话。

本地开发保留现有 Immich 端口，Gallery 选择经检查未占用的端口；完整联调用反向代理验证按域名路由。开发配置和公网部署配置区分，不把 PostgreSQL、Redis、ML、后台应用原始端口意外暴露给公网。

## 4. Compose 交付

最终一条受版本管理的启动命令合并：指定基线的 Immich Compose + Gallery 扩展配置。具体命令写成脚本，固定 project name、env-file、project-directory 和配置路径，避免相对卷路径受当前目录影响。

运行服务：

- Immich Server、Machine Learning、PostgreSQL、Valkey，保留 Immich 完整体验。
- Gallery Public、Gallery Admin。
- 一次性 Gallery 初始化／迁移任务。
- 反向代理和本地媒体变体缓存卷。

不增加独立 Gallery Redis；MVP 会话在 PostgreSQL，媒体缓存使用文件卷。启动不涉及 CVAT 或其他无关项目。

就绪顺序：数据库健康 → Immich 完成迁移并可服务 → Gallery 结构契约检查与迁移 → Admin/Public 健康 → 反向代理开放对应路由。

Compose depends_on 不能替代运行时容错：Gallery 仍需数据库短暂断开重试与健康状态处理。兼容失败不启动 Gallery 公开入口。覆盖后的有效 Compose 必须用 config 展开检查，包含上游 ports 合并结果、卷路径及镜像固定版本。

## 5. 账号和权限

独立 Gallery 数据角色见 [数据库设计](database.md)。Gallery 管理员用户与 PostgreSQL gallery_admin 角色是不同概念：前者是产品登录身份，后者是服务连接账号。

管理员密码、会话令牌和连接串不出现在日志和客户端；服务端限制登录尝试，校验 Origin／CSRF，富文本只允许受限结构。管理员初始化不默认发公网请求或开通注册。

## 6. 可用性和备份边界

当前方案共享数据库与媒体盘，因此 Gallery 公开服务仍依赖数据库和 Immich 资源状态；不承诺 Immich 底层存储完全不可用时继续提供所有照片。公开请求无法授权时返回不可用。

公开文字版本由 release 保持稳定，GPS 与资源可用性读取当前数据。图库备份包含两个 schema 的一致数据库备份、媒体文件及必要配置；角色授权通过受控脚本恢复，密钥通过部署安全配置恢复。

第一版交付本地 Compose 验证与可复现部署配置，不自动购买云服务、配置真实 DNS 或部署到阿里云。生产上线前选定稳定 Immich 基线并完成独立恢复演练。
