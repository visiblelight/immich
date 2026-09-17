# 独立 Edge 与自动发布

需求已确认：本地修改 JVS 后经其 Git 维护线发布；在同级 projects/edge 建立独立入口仓库；服务器代码统一到 /root/work；后续业务各自发布、共同使用 Edge。Git 项目邮箱改为 visiblelight@gmail.com，保留历史提交。

实施中：JVS 增加 edge profile、内部 jvs-web，原 standalone 模式保留；Edge 独立接管证书和 80/443，按 jvs-edge／vision-edge 隔离网络；Gallery CI 构建 GHCR 镜像并经专用受限 SSH 发布。

验证与服务器实际切换结果在完成后追加；本段不能视为已上线声明。备份、图片和数据库不随代码目录移动，原 mise.lock 修改保留。
