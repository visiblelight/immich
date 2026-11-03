# Gallery 项目接手

请先完整读取根目录 [AGENTS.md](AGENTS.md)，该文件是本项目开发规则的唯一维护来源，本文件不另建一套规则。

继续读取：

1. [接手入口](docs/gallery/handoff/README.md)
2. [当前状态与未提交修改](docs/gallery/handoff/current-state.md)
3. [架构与产品约定](docs/gallery/handoff/architecture-and-product.md)
4. 本次功能的最新 ADR、数据字典和交付记录。

这是已有生产数据的 Immich fork / Gallery 项目，不是空白网站。默认保留既有数据和修改；仅克隆 Git 不能恢复数据库、媒体和私有配置。换机按 [迁移指南](docs/gallery/handoff/local-and-transfer.md)处理，发布按 [生产运维](docs/gallery/handoff/production-operations.md)处理。历史对话中使用的 Codex 专属工具不是项目依赖，可以使用当前 agent 可用的终端、Git、Docker 和浏览器工具完成同等验证；不得因此放宽权限或跳过验收。
