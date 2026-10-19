/** Stable Gallery region IDs, independent of display geometry and boundary providers. */
export type GalleryRegion = {
  code: string;
  country: string;
  name: string;
  fullName: string;
  english: string;
  placeId: string;
  geonamesId: string | null;
};
const definitions = [
  ['BJ', '北京', '北京市', 'Beijing', '2038349'],
  ['TJ', '天津', '天津市', 'Tianjin', '1792943'],
  ['HE', '河北', '河北省', 'Hebei', '1808773'],
  ['SX', '山西', '山西省', 'Shanxi', '1795912'],
  ['NM', '内蒙古', '内蒙古自治区', 'Inner Mongolia', '2035607'],
  ['LN', '辽宁', '辽宁省', 'Liaoning', '2036115'],
  ['JL', '吉林', '吉林省', 'Jilin', '2036500'],
  ['HL', '黑龙江', '黑龙江省', 'Heilongjiang', '2036965'],
  ['SH', '上海', '上海市', 'Shanghai', '1796231'],
  ['JS', '江苏', '江苏省', 'Jiangsu', '1806260'],
  ['ZJ', '浙江', '浙江省', 'Zhejiang', '1784764'],
  ['AH', '安徽', '安徽省', 'Anhui', '1818058'],
  ['FJ', '福建', '福建省', 'Fujian', '1811017'],
  ['JX', '江西', '江西省', 'Jiangxi', '1806222'],
  ['SD', '山东', '山东省', 'Shandong', '1796328'],
  ['HA', '河南', '河南省', 'Henan', '1808520'],
  ['HB', '湖北', '湖北省', 'Hubei', '1806949'],
  ['HN', '湖南', '湖南省', 'Hunan', '1806691'],
  ['GD', '广东', '广东省', 'Guangdong', '1809935'],
  ['GX', '广西', '广西壮族自治区', 'Guangxi', '1809867'],
  ['HI', '海南', '海南省', 'Hainan', '1809054'],
  ['CQ', '重庆', '重庆市', 'Chongqing', '1814905'],
  ['SC', '四川', '四川省', 'Sichuan', '1794299'],
  ['GZ', '贵州', '贵州省', 'Guizhou', '1809445'],
  ['YN', '云南', '云南省', 'Yunnan', '1785694'],
  ['XZ', '西藏', '西藏自治区', 'Tibet', '1279685'],
  ['SN', '陕西', '陕西省', 'Shaanxi', '1796480'],
  ['GS', '甘肃', '甘肃省', 'Gansu', '1810676'],
  ['QH', '青海', '青海省', 'Qinghai', '1280239'],
  ['NX', '宁夏', '宁夏回族自治区', 'Ningxia', '1799355'],
  ['XJ', '新疆', '新疆维吾尔自治区', 'Xinjiang', '1529047'],
  ['HK', '香港', '香港特别行政区', 'Hong Kong', ''],
  ['MO', '澳门', '澳门特别行政区', 'Macao', ''],
  ['TW', '台湾', '台湾省', 'Taiwan', ''],
] as const;
export const chinaRegions: readonly GalleryRegion[] = definitions.map(
  ([id, name, fullName, english, geonamesId]) => ({
    code: `CN-${id}`,
    country: 'CN',
    name,
    fullName,
    english,
    placeId: `region:CN-${id}`,
    geonamesId: geonamesId || null,
  }),
);
const catalog = new Map(chinaRegions.map((region) => [region.code, region]));
export const regionByCode = (code: string) => catalog.get(code);
export const regionalTopics = [
  { country: 'CN', name: '中国', level: '省级地区', regions: chinaRegions },
] as const;
