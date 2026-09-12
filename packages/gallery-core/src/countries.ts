/** Original hand-positioned cartogram. Coordinates are schematic, not borders.
 * Scope: 193 UN member states + Holy See + Palestine. Regions are exclusive
 * travel-statistics groups (Russia in Europe; Türkiye and Cyprus in Asia).
 */
export type Country = {
  id: string;
  zh: string;
  en: string;
  x: number;
  y: number;
  w: number;
  h: number;
  region: string;
};
export function parseCountries(region: string, data: string): Country[] {
  return data
    .trim()
    .split('\n')
    .map((line) => {
      const [id = '', zh = '', en = '', ...n] = line.split('|');
      const [x = 0, y = 0, w = 0, h = 0] = n.map(Number);
      return {
        id,
        zh,
        en,
        x: x * 20,
        y: y * 20,
        w: w * 20 - 4,
        h: h * 20 - 4,
        region,
      };
    });
}
export const countries: Country[] = [
  ...parseCountries(
    'EU',
    `IS|冰岛|Iceland|7|6|4|2
NO|挪威|Norway|16|6|3|7
SE|瑞典|Sweden|19|7|3|6
FI|芬兰|Finland|22|7|3|5
RU|俄罗斯|Russia|28|5|28|6
EE|爱沙尼亚|Estonia|23|12|3|1.5
LV|拉脱维亚|Latvia|23|13.5|3|1.5
LT|立陶宛|Lithuania|23|15|3|1.5
BY|白俄罗斯|Belarus|26|13|3|3
UA|乌克兰|Ukraine|26|16|5|2
MD|摩尔多瓦|Moldova|26|19|3|1.5
PL|波兰|Poland|22|16.5|4|2.5
DE|德国|Germany|18|15|4|4
DK|丹麦|Denmark|18|13|3|2
GB|英国|United Kingdom|10|12|3|5
IE|爱尔兰|Ireland|7|14|3|2
NL|荷兰|Netherlands|15|15|3|2
BE|比利时|Belgium|15|17|3|1
LU|卢森堡|Luxembourg|16.5|18.5|1.5|2
FR|法国|France|11|18|5.5|4.5
CH|瑞士|Switzerland|17|20.5|3|2
LI|列支敦士登|Liechtenstein|18|19|2|1.5
AT|奥地利|Austria|20|20.5|4|1.5
CZ|捷克|Czechia|20|19|3|1.5
SK|斯洛伐克|Slovakia|23|19|3|1.5
HU|匈牙利|Hungary|24|20.5|3|1.5
RO|罗马尼亚|Romania|27|20.5|2|2
PT|葡萄牙|Portugal|8|23|2|3
ES|西班牙|Spain|10|23|5|3
AD|安道尔|Andorra|15|23|2|1.5
MC|摩纳哥|Monaco|17|23|2|1.5
IT|意大利|Italy|19|23|2|5
SM|圣马力诺|San Marino|21|24|2|1.5
VA|梵蒂冈|Vatican City|21|26|2|1.5
MT|马耳他|Malta|21|29|2|1.5
SI|斯洛文尼亚|Slovenia|21|22|3|1.5
HR|克罗地亚|Croatia|24|22|3|1.5
BA|波黑|Bosnia and Herzegovina|24|23.5|3|1.5
RS|塞尔维亚|Serbia|27|22.5|2|3
ME|黑山|Montenegro|24|25|2|1.5
AL|阿尔巴尼亚|Albania|24|26.5|2|2
MK|北马其顿|North Macedonia|26|25.5|3|1.5
BG|保加利亚|Bulgaria|29|25|1|2
GR|希腊|Greece|26|27|3|3`,
  ),
  ...parseCountries(
    'AS',
    `CN|中国|China|38|14|11|7
MN|蒙古|Mongolia|39|11|10|3
KZ|哈萨克斯坦|Kazakhstan|29|11|9|4
UZ|乌兹别克斯坦|Uzbekistan|31|15|4|2
TM|土库曼斯坦|Turkmenistan|31|17|3|1
KG|吉尔吉斯斯坦|Kyrgyzstan|35|15|3|2
TJ|塔吉克斯坦|Tajikistan|35|17|3|2
AF|阿富汗|Afghanistan|34|19|4|2
PK|巴基斯坦|Pakistan|33|21|4|4
IN|印度|India|37|24|6|7
NP|尼泊尔|Nepal|38|21|3|1.5
BT|不丹|Bhutan|41|21|2|1.5
BD|孟加拉国|Bangladesh|41|22.5|2|1.5
LK|斯里兰卡|Sri Lanka|40|32|2|2
MV|马尔代夫|Maldives|37|36|2|2
IR|伊朗|Iran|29|19|4|3.5
TR|土耳其|Türkiye|29|22.5|4|2.5
GE|格鲁吉亚|Georgia|29|18|4|1
AM|亚美尼亚|Armenia|33|18|1|1
AZ|阿塞拜疆|Azerbaijan|34|17|1|2
CY|塞浦路斯|Cyprus|30|25|2|1.5
SY|叙利亚|Syria|32|25|3|2
IQ|伊拉克|Iraq|35|25|2|3
LB|黎巴嫩|Lebanon|30|27|2|1.5
IL|以色列|Israel|30|28.5|2|1.5
PS|巴勒斯坦|Palestine|30|30|2|1.5
JO|约旦|Jordan|32|27|3|2
SA|沙特阿拉伯|Saudi Arabia|32|29|5|4
KW|科威特|Kuwait|35|28|2|1
BH|巴林|Bahrain|37|31|2|1.5
QA|卡塔尔|Qatar|30|33|2|1
AE|阿联酋|United Arab Emirates|37|32.5|3|1.5
OM|阿曼|Oman|40|34|2|3
YE|也门|Yemen|33|33|3|2
MM|缅甸|Myanmar|43|22|2|5
TH|泰国|Thailand|45|25|2|5
LA|老挝|Laos|45|22|2|3
KH|柬埔寨|Cambodia|47|27|2|2
VN|越南|Vietnam|49|24|2|6
MY|马来西亚|Malaysia|45|30|6|2
SG|新加坡|Singapore|46|32.5|2|1.5
BN|文莱|Brunei|51|30|2|2
ID|印度尼西亚|Indonesia|44|35|13|2.5
TL|东帝汶|Timor-Leste|55|38|3|1.5
PH|菲律宾|Philippines|53|24|3|5
KP|朝鲜|North Korea|49|16|3|2
KR|韩国|South Korea|50|18|2|2
JP|日本|Japan|53|15|3|7`,
  ),
  ...parseCountries(
    'AF',
    `MA|摩洛哥|Morocco|9|29|5|3
DZ|阿尔及利亚|Algeria|14|28|5|6
TN|突尼斯|Tunisia|19|28|2|3
LY|利比亚|Libya|19|31|5|3
EG|埃及|Egypt|25|31|5|3
MR|毛里塔尼亚|Mauritania|9|32|5|3
ML|马里|Mali|14|34|4|3
NE|尼日尔|Niger|18|34|5|3
TD|乍得|Chad|23|34|3|4
SD|苏丹|Sudan|26|34|5|4
ER|厄立特里亚|Eritrea|31|35|2|2
DJ|吉布提|Djibouti|33|36.5|2|1.5
ET|埃塞俄比亚|Ethiopia|30|38|4|3
SO|索马里|Somalia|34|39|2|4
SS|南苏丹|South Sudan|27|38|3|2
CF|中非|Central African Republic|23|38|4|2
CM|喀麦隆|Cameroon|20|39|3|2
NG|尼日利亚|Nigeria|18|37|5|2
BJ|贝宁|Benin|16.5|37|1.5|3
TG|多哥|Togo|15|37|1.5|3
GH|加纳|Ghana|13|37|2|3
BF|布基纳法索|Burkina Faso|11|35|3|2
CI|科特迪瓦|Côte d’Ivoire|10|37|3|3
LR|利比里亚|Liberia|8|39|2|2
SL|塞拉利昂|Sierra Leone|6|38|2|2
GN|几内亚|Guinea|6|36.5|4|1.5
GW|几内亚比绍|Guinea-Bissau|4|36.5|2|1.5
SN|塞内加尔|Senegal|6|35|4|1.5
GM|冈比亚|Gambia|4|35|2|1.5
CV|佛得角|Cabo Verde|1|32|3|2
ST|圣多美和普林西比|São Tomé and Príncipe|14|42|3|2
GQ|赤道几内亚|Equatorial Guinea|18|40|2|2
GA|加蓬|Gabon|18|42|3|2
CG|刚果共和国|Congo|21|41|2|3
CD|刚果民主共和国|DR Congo|23|40|5|4
UG|乌干达|Uganda|28|40|2|2
KE|肯尼亚|Kenya|30|41|4|3
RW|卢旺达|Rwanda|28|42|2|1.5
BI|布隆迪|Burundi|28|43.5|2|1.5
TZ|坦桑尼亚|Tanzania|30|44|4|3
AO|安哥拉|Angola|20|44|5|3
ZM|赞比亚|Zambia|25|45|5|2
MW|马拉维|Malawi|30|47|1.5|3
MZ|莫桑比克|Mozambique|31.5|47|2.5|4
ZW|津巴布韦|Zimbabwe|27|47|3|2
NA|纳米比亚|Namibia|20|47|3|4
BW|博茨瓦纳|Botswana|23|47|4|3
ZA|南非|South Africa|21|51|8|3
LS|莱索托|Lesotho|27|49|2|2
SZ|斯威士兰|Eswatini|29|50|2|1
MG|马达加斯加|Madagascar|36|46|2|5
MU|毛里求斯|Mauritius|39|49|3|2
SC|塞舌尔|Seychelles|39|42|3|2
KM|科摩罗|Comoros|36|43|2|2`,
  ),
  ...parseCountries(
    'NA',
    `CA|加拿大|Canada|66|7|17|7
US|美国|United States|66|14|15|6
MX|墨西哥|Mexico|68|20|7|5
GT|危地马拉|Guatemala|72|25|3|2
BZ|伯利兹|Belize|75|24|2|2
SV|萨尔瓦多|El Salvador|72|27|3|1.5
HN|洪都拉斯|Honduras|75|26|3|2
NI|尼加拉瓜|Nicaragua|76|28|3|2
CR|哥斯达黎加|Costa Rica|77|30|3|1.5
PA|巴拿马|Panama|79|31.5|3|1.5
BS|巴哈马|Bahamas|81|20|3|2
CU|古巴|Cuba|78|23|4|1.5
JM|牙买加|Jamaica|79|25|3|1.5
HT|海地|Haiti|82.5|23|2|2
DO|多米尼加共和国|Dominican Republic|84.5|23|3|2
KN|圣基茨和尼维斯|Saint Kitts and Nevis|88|24|3|2
AG|安提瓜和巴布达|Antigua and Barbuda|92|24|3|2
DM|多米尼克|Dominica|89|27|3|2
LC|圣卢西亚|Saint Lucia|89|30|3|2
VC|圣文森特和格林纳丁斯|Saint Vincent and the Grenadines|87|33|3|2
BB|巴巴多斯|Barbados|91|33|3|2
GD|格林纳达|Grenada|87|36|3|2
TT|特立尼达和多巴哥|Trinidad and Tobago|86|39|3|2`,
  ),
  ...parseCountries(
    'SA',
    `CO|哥伦比亚|Colombia|79|33|4|4
VE|委内瑞拉|Venezuela|83|33|4|3
GY|圭亚那|Guyana|83|36|2|3
SR|苏里南|Suriname|85|36|2|3
EC|厄瓜多尔|Ecuador|76|37|3|2
PE|秘鲁|Peru|76|39|4|5
BR|巴西|Brazil|80|39|6|9
BO|玻利维亚|Bolivia|77|44|3|3
PY|巴拉圭|Paraguay|78|47|2|3
UY|乌拉圭|Uruguay|80|50|2|2
AR|阿根廷|Argentina|76|50|4|7
CL|智利|Chile|74|44|2|13`,
  ),
  ...parseCountries(
    'OC',
    `AU|澳大利亚|Australia|52|41|11|6
NZ|新西兰|New Zealand|66|48|3|5
PG|巴布亚新几内亚|Papua New Guinea|57|35|5|3
PW|帕劳|Palau|57|28|3|2
FM|密克罗尼西亚|Micronesia|61|27|4|2
MH|马绍尔群岛|Marshall Islands|65|26|3|2
NR|瑙鲁|Nauru|64|30|2|2
KI|基里巴斯|Kiribati|68|29|3|2
SB|所罗门群岛|Solomon Islands|63|36|4|2
VU|瓦努阿图|Vanuatu|64|40|3|2
FJ|斐济|Fiji|68|39|3|2
TV|图瓦卢|Tuvalu|68|34|3|2
WS|萨摩亚|Samoa|72|35|3|2
TO|汤加|Tonga|71|40|3|2`,
  ),
];
export const regions = [
  { id: 'AS', zh: '亚洲', en: 'Asia' },
  { id: 'EU', zh: '欧洲', en: 'Europe' },
  { id: 'AF', zh: '非洲', en: 'Africa' },
  { id: 'NA', zh: '北美洲', en: 'North America' },
  { id: 'SA', zh: '南美洲', en: 'South America' },
  { id: 'OC', zh: '大洋洲', en: 'Oceania' },
];
