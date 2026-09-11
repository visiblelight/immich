# Immich 开发环境依赖挂载异常

记录日期：2026-09-11。

## 症状与已确认原因

Immich Web 的 3000 端口仍返回 HTML，但代理请求 API 报 ECONNREFUSED；2283 的 ping 无法响应。server 日志显示 ExifTool ENOENT，微服务退出后 API 被一起终止。容器内的开发监视进程还在，所以 `docker ps` 的 Up 状态不能证明应用健康。

实际检查发现：运行容器的 `/usr/src/app/node_modules/.pnpm` 暴露了宿主机的 macOS Gallery 依赖，缺失 ExifTool 和 Immich UI；独立只读挂载 `immich-dev_app_node_modules` 卷时，原 Linux 依赖和 ExifTool 文件完整。重启 API／Web 容器后重新读取到了 Linux 卷。

现有 Compose 将整个仓库绑定到容器，再把多处 node_modules 覆盖为命名卷。结合宿主机安装时间、两端目录内容及重启恢复结果，判断这次 Gallery 宿主机依赖安装使本机 macOS／Colima 环境中的嵌套依赖挂载失效。未为了复现故障再次破坏目录；不能只凭 Compose 配置断言两端运行目录始终隔离。

## 恢复与避免复发

1. 检查 API 与 Web 实际响应、容器日志，以及原依赖卷内容；不要因为 ENOENT 就删除卷或重新初始化数据库。
2. 原 Linux 依赖卷完整时，重新挂载仅需重启现有 API 和 Web 容器：

   ```sh
   docker restart immich_server immich_web
   ```

3. 启动命令中的 pnpm 可能触发依赖安装及锁文件供应链校验；等待成功后验证 API ping、Web 代理和页面资源。保留既有校验，不用更换依赖版本或关闭审核来加速。
4. 后续在宿主机执行会重建依赖目录的 Gallery 安装／更新前，先停止正在运行的 Immich API、Web 和 init 容器；安装结束后启动此前运行的容器，让它们重新挂载依赖卷。只编辑源码不需要这样做。数据库、Redis、媒体和无关服务不参与此操作。
5. Gallery 与 Immich 必须在各自运行环境使用对应的依赖；不要复制 macOS node_modules 到 Linux 卷，也不要让 Linux 安装使用 macOS store。

若未来频繁更新两端依赖，应进一步拆分开发 checkout 或依赖安装工作区，避免宿主机重建目录影响容器挂载；这属于后续开发工具改进，不在本次恢复中变更部署架构。

## 恢复结果

重启现有 server/web 后，API ping 返回 `200 {"res":"pong"}`；3000 网页、经 Web 代理的 server/config 和 server/media-types、此前 404 的 Immich logo 资源均返回 200。3100 Gallery 预览仍返回 200。数据库、Redis、机器学习容器未重启，未重建卷或手工应用数据库迁移，Git 中原有 mise.lock 修改保持不变。
