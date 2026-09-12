# MapLibre GL JS 6.9.0

为避免 Gallery 新功能安装依赖影响开发机中共用的 Immich node_modules，固定存放官方发布的浏览器 ESM、CSS、worker 和 LICENSE.txt。没有二次打包或修改官方文件。

来源：https://registry.npmjs.org/maplibre-gl/-/maplibre-gl-6.9.0.tgz
完整包 SHA512（base64）：vFMwMK0Zs+NM/rOMSdtu8bO30DIexhBEVi5KC6f70/XtI+L/K2wC3LsDCAXFZ4s8ik5gAuDugfCNbpllpdJ9bA==

升级时核对 npm 官方 metadata 的 dist.integrity，验证 tar 包，提取 dist/maplibre-gl.mjs、dist/maplibre-gl-shared.mjs、dist/maplibre-gl-worker.mjs、dist/maplibre-gl.css、LICENSE.txt，更新目录版本及 providers.ts 中的固定入口；重新测试 OSM、worker、移动端和 CSP。不要混用版本。
