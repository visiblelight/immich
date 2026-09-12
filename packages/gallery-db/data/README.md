# 国家判定基础数据

Natural Earth v5.1.2，10m Admin 0 countries，公共领域。精确来源与 SHA256 见 countries-source.json；生成器拒绝不匹配的输入。不是 Gallery 照片位置缓存。

下载声明的固定源文件后，通过根命令 `gallery:map:boundaries <path>` 重建压缩文件。193个联合国成员国＋梵蒂冈＋巴勒斯坦，共195项；附属区域按主权分组，特殊分组写入来源声明。数据集的争议边界表达存在制图概括，不能作为法律边界证明。无明确落点及跨边界的近似位置保持未知，不用最近国家猜测。不会利用 EXIF 国家字符串覆盖几何判定。

原创抽象世界轮廓来自本人的 tickoff 原型布局，在 Gallery 生成器内独立维护；不以抽象轮廓进行 GPS 判定，不包含 world-ex 的代码或几何数据。

许可：https://www.naturalearthdata.com/about/terms-of-use/
