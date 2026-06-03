const http = require("node:http");
const path = require("node:path");
const { readFile } = require("node:fs/promises");
const { URL } = require("node:url");

const PORT = Number(process.env.PORT || 3100);
const PUBLIC_DIR = path.join(__dirname, "public");

const EASTMONEY_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36",
  Referer: "https://quote.eastmoney.com/",
};

const FUND_HEADERS = {
  ...EASTMONEY_HEADERS,
  Referer: "https://fund.eastmoney.com/",
};

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

const cache = new Map();
let marketInFlight = null;
let backtestInFlight = null;

const INDEX_SECIDS = [
  "1.000001", // 上证指数
  "0.399001", // 深证成指
  "0.399006", // 创业板指
  "1.000300", // 沪深300
  "1.000905", // 中证500
  "1.000852", // 中证1000
  "1.000688", // 科创50
].join(",");

const MACRO_CONTEXT = [
  {
    title: "景气状态",
    value: "2026年5月制造业PMI 50.0，综合PMI 50.5",
    detail: "总量仍在扩张边缘，生产强于订单，权益配置更适合分批而不是一次打满。",
  },
  {
    title: "结构方向",
    value: "高技术制造业PMI 52.9，装备制造业PMI 52.1",
    detail: "科技、装备、机器人、军工等新质生产力方向有基本面验证，但仍要看资金持续性。",
  },
  {
    title: "基金表达",
    value: "优先用宽基底仓 + 行业/主题卫星仓",
    detail: "先保证组合不被单一主题绑架，再用基金板块强度决定加仓顺序。",
  },
  {
    title: "费用纪律",
    value: "指数基金、ETF联接和低费率产品优先",
    detail: "同类主题差别不大时，优先选费率低、规模足、跟踪误差小、流动性好的产品。",
  },
];

const FUND_THEME_RULES = [
  {
    id: "ai",
    label: "AI算力/通信",
    role: "高弹性卫星",
    keywords: ["AI", "人工智能", "算力", "CPO", "光模块", "通信", "光通信", "服务器", "数据中心", "云计算", "液冷"],
  },
  {
    id: "semiconductor",
    label: "半导体/芯片",
    role: "高弹性卫星",
    keywords: ["半导体", "芯片", "集成电路", "存储", "封测", "光刻", "电子元件", "电子化学品", "PCB", "印制电路板", "消费电子", "MLCC", "被动元件", "电子元器件", "元件", "电容"],
  },
  {
    id: "tech",
    label: "科技成长",
    role: "成长卫星",
    keywords: ["科技", "科创", "双创", "计算机", "软件", "信息技术", "信息安全", "互联网服务", "数字经济", "信创", "大数据"],
  },
  {
    id: "robot",
    label: "机器人/智能制造",
    role: "主题卫星",
    keywords: ["机器人", "人形机器人", "工业母机", "自动化", "仪器仪表", "专用设备", "通用设备", "机械", "智能制造"],
  },
  {
    id: "defense",
    label: "军工/航天船舶",
    role: "高波动卫星",
    keywords: ["军工", "航天", "航空", "船舶", "北斗", "卫星", "商业航天", "国防"],
  },
  {
    id: "newEnergyVehicle",
    label: "新能源车/锂电",
    role: "周期成长",
    keywords: ["新能源车", "新能源汽车", "锂电", "电池", "动力电池", "固态电池", "储能电池", "充电桩", "汽车零部件"],
  },
  {
    id: "photovoltaic",
    label: "光伏储能/电力设备",
    role: "周期成长",
    keywords: ["光伏", "储能", "风电", "电力设备", "特高压", "电网", "逆变器", "太阳能"],
  },
  {
    id: "medical",
    label: "医药医疗/创新药",
    role: "中长期主题",
    keywords: ["医药", "医疗", "创新药", "生物", "CXO", "医疗器械", "中药", "疫苗", "化学制药", "医疗服务"],
  },
  {
    id: "consumer",
    label: "消费白酒/食品饮料",
    role: "消费核心",
    keywords: ["消费", "白酒", "食品", "饮料", "酿酒", "乳业", "家电", "美容护理", "零售", "商贸", "味蕾经济"],
  },
  {
    id: "travel",
    label: "旅游航空/酒店",
    role: "复苏弹性",
    keywords: ["旅游", "酒店", "航空", "机场", "免税", "餐饮", "景区", "出行"],
  },
  {
    id: "media",
    label: "传媒游戏/互联网",
    role: "主题卫星",
    keywords: ["传媒", "游戏", "影视", "短剧", "广告", "互联网", "文化传媒", "出版"],
  },
  {
    id: "finance",
    label: "银行证券保险",
    role: "顺周期/稳定器",
    keywords: ["银行", "证券", "券商", "保险", "金融", "多元金融", "互联金融", "金融科技"],
  },
  {
    id: "realEstate",
    label: "地产建筑链",
    role: "政策博弈",
    keywords: ["房地产", "地产", "建筑", "建材", "水泥", "家居", "装修", "物业", "保障房"],
  },
  {
    id: "dividend",
    label: "红利低波/央国企",
    role: "防守底仓",
    keywords: ["红利", "低波", "股息", "央企", "国企", "中特估", "价值", "公用事业", "电力", "运营商"],
  },
  {
    id: "cyclical",
    label: "周期资源/有色煤炭钢铁",
    role: "通胀/周期",
    keywords: ["有色", "煤炭", "钢铁", "石油", "化工", "能源", "稀土", "小金属", "工业金属", "资源", "磨具", "磨料", "玻纤", "防水材料"],
  },
  {
    id: "gold",
    label: "黄金贵金属",
    role: "避险资产",
    keywords: ["黄金", "白银", "贵金属", "金属新材料"],
  },
  {
    id: "agriculture",
    label: "农业养殖",
    role: "逆周期主题",
    keywords: ["农业", "养殖", "猪肉", "鸡肉", "种业", "粮食", "饲料", "农牧"],
  },
  {
    id: "utility",
    label: "电力公用/环保",
    role: "稳健现金流",
    keywords: ["电力", "水务", "燃气", "环保", "公用事业", "公共事业", "绿色电力"],
  },
  {
    id: "broad",
    label: "宽基指数/均衡",
    role: "组合底仓",
    keywords: ["宽基", "沪深300", "中证300", "中证500", "中证1000", "中证2000", "上证50", "A500", "创业板", "科创50", "MSCI", "全指", "增强", "均衡", "核心", "价值成长"],
  },
  {
    id: "overseas",
    label: "港美海外/QDII",
    role: "跨市场分散",
    keywords: ["港股", "恒生", "恒科", "中概", "纳斯达克", "标普", "美股", "日经", "海外", "QDII", "全球", "越南", "印度"],
  },
  {
    id: "bond",
    label: "债券货币/稳健",
    role: "低波动底仓",
    keywords: ["债", "纯债", "短债", "中短债", "信用债", "可转债", "货币", "现金", "同业存单", "稳健"],
  },
];

const THEME_BY_ID = new Map(FUND_THEME_RULES.map((theme) => [theme.id, theme]));
const DEFAULT_THEME = THEME_BY_ID.get("broad");
const OTHER_THEME = { id: "other", label: "其他/未映射", role: "观察" };

const REPRESENTATIVE_THEME_ETFS = {
  ai: ["159819", "515980", "512720"],
  semiconductor: ["512760", "159995", "512480"],
  tech: ["588000", "588080", "159915"],
  robot: ["562500", "159770", "159967"],
  defense: ["512660", "512670", "512710"],
  newEnergyVehicle: ["515030", "159806", "516160"],
  photovoltaic: ["515790", "159857", "516880"],
  medical: ["512170", "159929", "512010"],
  consumer: ["159928", "512690", "515170"],
  travel: ["159766", "562510", "516900"],
  media: ["512980", "159869", "516010"],
  finance: ["512880", "512800", "510230"],
  realEstate: ["512200", "159768", "515060"],
  dividend: ["510880", "515080", "159905"],
  cyclical: ["512400", "159876", "516780"],
  gold: ["518880", "159934", "518800"],
  agriculture: ["159825", "516670", "562900"],
  utility: ["159611", "562960", "560580"],
  broad: ["510300", "510500", "159915", "588000", "512100", "159845"],
  overseas: ["513050", "513100", "513500", "159941"],
  bond: ["511010", "511260", "511220", "511880"],
};

const BACKTEST_CONFIG = {
  themeCount: 12,
  fundsPerTheme: 3,
  selectedThemes: 3,
  rebalanceDays: 20,
  minLookbackDays: 126,
  maxHistoryDays: 520,
  costBps: 15,
  benchmarkCodes: ["510300", "159919"],
};

const PORTFOLIO_LIMITS = {
  maxSingleFundPct: 18,
  maxSatelliteThemePct: 16,
  maxCoreThemePct: 28,
  maxOverseasThemePct: 12,
  maxGoldThemePct: 10,
  maxBondThemePct: 65,
  minMeaningfulTradePct: 3,
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function num(value) {
  if (value === undefined || value === null || value === "-" || value === "") return null;
  const n = Number(String(value).replaceAll(",", "").replace("%", "").trim());
  return Number.isFinite(n) ? n : null;
}

function normalizePercent(value) {
  const n = num(value);
  return n === null ? null : n;
}

function nowStamp() {
  return new Date().toISOString();
}

function average(values) {
  const nums = values.filter((value) => Number.isFinite(value));
  if (!nums.length) return 0;
  return nums.reduce((sum, value) => sum + value, 0) / nums.length;
}

function sum(values) {
  return values.reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0);
}

function percentPositive(items, field = "changePct") {
  const valid = items.filter((item) => Number.isFinite(item[field]));
  if (!valid.length) return 0.5;
  return valid.filter((item) => item[field] > 0).length / valid.length;
}

function weightedAverage(items, valueFn, weightFn = () => 1) {
  let weighted = 0;
  let weights = 0;
  for (const item of items) {
    const value = valueFn(item);
    const weight = weightFn(item);
    if (!Number.isFinite(value) || !Number.isFinite(weight) || weight <= 0) continue;
    weighted += value * weight;
    weights += weight;
  }
  return weights ? weighted / weights : 0;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function stddev(values) {
  const nums = values.filter(Number.isFinite);
  if (nums.length < 2) return 0;
  const avg = average(nums);
  return Math.sqrt(nums.reduce((total, value) => total + (value - avg) ** 2, 0) / (nums.length - 1));
}

function winsor(value, limit = 3) {
  if (!Number.isFinite(value)) return 0;
  return clamp(value, -limit, limit);
}

function zscore(value, mean, sd) {
  if (!Number.isFinite(value) || !Number.isFinite(sd) || sd <= 0) return 0;
  return winsor((value - mean) / sd);
}

function signalStats(items, field) {
  const values = items.map((item) => item[field]).filter(Number.isFinite);
  return { mean: average(values), sd: stddev(values) || 1 };
}

function normalizeSearchText(...parts) {
  return parts
    .flat()
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function matchTheme(...parts) {
  const text = normalizeSearchText(parts);
  if (!text) return null;
  return FUND_THEME_RULES.find((theme) => theme.keywords.some((keyword) => text.includes(String(keyword).toUpperCase()))) || null;
}

function classifyTheme(...parts) {
  return matchTheme(parts) || DEFAULT_THEME;
}

function classifyMarketTheme(...parts) {
  return matchTheme(parts) || OTHER_THEME;
}

function isExplicitBroadIndex(text) {
  return [
    "宽基",
    "沪深300",
    "中证300",
    "中证500",
    "中证1000",
    "中证2000",
    "上证50",
    "A500",
    "创业板",
    "科创50",
    "MSCI",
    "指数增强",
  ].some((keyword) => text.includes(keyword.toUpperCase()));
}

function themeStrength(score, overheatRate = 0) {
  if (score >= 72 && overheatRate > 0.35) return "偏热";
  if (score >= 72) return "强";
  if (score >= 58) return "偏强";
  if (score >= 44) return "中性";
  return "偏弱";
}

function actionableLabel(score, overheatRate = 0) {
  if (score >= 72 && overheatRate <= 0.3) return "回踩不破可小仓跟踪";
  if (score >= 72) return "偏热，不追第一笔";
  if (score >= 58) return "可观察，等资金确认";
  if (score >= 44) return "只适合定投或底仓";
  return "暂不加仓";
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function eastmoneyUrlCandidates(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "push2.eastmoney.com") return [url];
    const suffix = `${parsed.pathname}${parsed.search}`;
    const alternates = [
      `http://push2delay.eastmoney.com${suffix}`,
      `http://33.push2.eastmoney.com${suffix}`,
      `http://73.push2.eastmoney.com${suffix}`,
    ];
    return [...alternates, url];
  } catch {
    return [url];
  }
}

async function cachedText(key, url, ttlMs = 12000, headers = EASTMONEY_HEADERS) {
  const hit = cache.get(key);
  const now = Date.now();
  if (hit && now - hit.createdAt < ttlMs) return hit.value;

  let lastError;
  const urls = eastmoneyUrlCandidates(url);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    for (const candidateUrl of urls) {
      try {
        const timeoutMs = candidateUrl.includes("push2") ? 7000 : 12000;
        const response = await fetchWithTimeout(candidateUrl, { headers }, timeoutMs);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const buffer = await response.arrayBuffer();
        const text = new TextDecoder("utf-8").decode(buffer);
        cache.set(key, { createdAt: now, value: text });
        return text;
      } catch (error) {
        lastError = error;
      }
    }
  }

  if (hit) return hit.value;
  throw new Error(`数据源暂时不可用：${lastError?.message || "fetch failed"}`);
}

function parseJsonPayload(text) {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return JSON.parse(trimmed);
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
  throw new Error("无法解析上游返回数据");
}

function mapQuote(item) {
  return {
    code: String(item.f12 || ""),
    market: item.f13 ?? null,
    name: item.f14 || "",
    price: num(item.f2),
    changePct: normalizePercent(item.f3),
    change: num(item.f4),
    volume: num(item.f5),
    amount: num(item.f6),
    amplitude: normalizePercent(item.f7),
    high: num(item.f15),
    low: num(item.f16),
    open: num(item.f17),
    previousClose: num(item.f18),
    turnover: normalizePercent(item.f8),
    pe: num(item.f9),
    pb: num(item.f10),
    totalCap: num(item.f20),
    flowCap: num(item.f21),
    mainNet: num(item.f62),
    return5d: normalizePercent(item.f109),
    return10d: normalizePercent(item.f110),
    return20d: normalizePercent(item.f160),
    return60d: normalizePercent(item.f24),
    returnYtd: normalizePercent(item.f25),
  };
}

function decorateBoard(item) {
  const theme = classifyMarketTheme(item.name);
  return {
    ...item,
    fundTheme: theme.id,
    fundThemeLabel: theme.label,
    themeRole: theme.role,
    themeScore: 0,
    signalScore: 0,
    confidence: 35,
    riskAdjustedMomentum: 0,
    overheated: (item.changePct ?? 0) > 6 || (item.amplitude ?? 0) > 9,
    flowOk: (item.mainNet ?? 0) > 0,
  };
}

function decorateEtf(item) {
  const theme = classifyMarketTheme(item.name);
  return {
    ...item,
    fundTheme: theme.id,
    fundThemeLabel: theme.label,
    themeRole: theme.role,
    signalScore: 0,
    confidence: 35,
    riskAdjustedMomentum: 0,
    overheated: (item.changePct ?? 0) > 5.5 || (item.amplitude ?? 0) > 8,
  };
}

async function eastmoneyJson(key, url, ttlMs = 12000) {
  const text = await cachedText(key, url, ttlMs, EASTMONEY_HEADERS);
  return parseJsonPayload(text);
}

async function fetchIndices() {
  const fields = "f12,f13,f14,f2,f3,f4,f5,f6,f7,f15,f16,f17,f18,f24,f25,f109,f110,f160";
  const url = `https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&fields=${fields}&secids=${INDEX_SECIDS}`;
  const json = await eastmoneyJson("indices", url);
  return (json.data?.diff || []).map(mapQuote);
}

async function fetchClistPage(key, fs, fields, page = 1, pageSize = 100) {
  const url = `https://push2.eastmoney.com/api/qt/clist/get?pn=${page}&pz=${pageSize}&po=1&np=1&fltt=2&invt=2&fid=f3&fs=${encodeURIComponent(fs)}&fields=${fields}`;
  return eastmoneyJson(`${key}:p${page}`, url);
}

async function fetchBoard(kind, fs, maxPages = 8) {
  const fields = "f12,f14,f2,f3,f4,f5,f6,f7,f8,f9,f10,f20,f21,f24,f25,f62,f109,f110,f160";
  const pageSize = 100;
  const first = await fetchClistPage(`board:${kind}`, fs, fields, 1, pageSize);
  const total = Number(first.data?.total || 0);
  const pages = clamp(Math.ceil(total / pageSize), 1, maxPages);
  const rest =
    pages > 1
      ? await Promise.all(
          Array.from({ length: pages - 1 }, (_, index) =>
            fetchClistPage(`board:${kind}`, fs, fields, index + 2, pageSize),
          ),
        )
      : [];
  return [first, ...rest].flatMap((json) =>
    (json.data?.diff || []).map((item) => decorateBoard({ ...mapQuote(item), kind })),
  );
}

async function fetchEtfs(pageSize = 220) {
  const fields = "f12,f14,f2,f3,f4,f5,f6,f7,f8,f15,f16,f17,f18,f20,f24,f25,f109,f110,f160";
  const fs = "b:MK0021,b:MK0022,b:MK0023,b:MK0024";
  const url = `https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=${pageSize}&po=1&np=1&fltt=2&invt=2&fid=f3&fs=${encodeURIComponent(fs)}&fields=${fields}`;
  const json = await eastmoneyJson("etfs", url);
  return (json.data?.diff || []).map((item) => decorateEtf({ ...mapQuote(item), kind: "etf" }));
}

async function fetchQuoteByCode(code) {
  const clean = String(code || "").trim();
  if (!/^\d{6}$/.test(clean)) return null;
  const market = clean.startsWith("5") || clean.startsWith("6") ? "1" : "0";
  const fields = "f12,f13,f14,f2,f3,f4,f5,f6,f7,f15,f16,f17,f18,f20";
  const url = `https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&fields=${fields}&secids=${market}.${clean}`;
  const json = await eastmoneyJson(`quote:${clean}`, url, 10000);
  return (json.data?.diff || []).map(mapQuote)[0] || null;
}

async function fetchFundEstimate(code) {
  const clean = String(code || "").trim();
  if (!/^\d{6}$/.test(clean)) return null;
  const url = `https://fundgz.1234567.com.cn/js/${clean}.js?rt=${Date.now()}`;
  const text = await cachedText(`fund:${clean}`, url, 10000, FUND_HEADERS);
  const payload = parseJsonPayload(text);
  if (!payload || !payload.fundcode) return null;
  return {
    code: payload.fundcode,
    name: payload.name,
    navDate: payload.jzrq,
    nav: num(payload.dwjz),
    estimateNav: num(payload.gsz),
    estimateChangePct: normalizePercent(payload.gszzl),
    estimateTime: payload.gztime,
  };
}

async function fetchFundOrQuote(code) {
  const [fund, quote] = await Promise.allSettled([fetchFundEstimate(code), fetchQuoteByCode(code)]);
  const fundValue = fund.status === "fulfilled" ? fund.value : null;
  const quoteValue = quote.status === "fulfilled" ? quote.value : null;
  if (fundValue) {
    return {
      ...fundValue,
      quote: quoteValue,
      source: "天天基金估值",
      latestPrice: fundValue.estimateNav ?? fundValue.nav,
      latestChangePct: fundValue.estimateChangePct,
      latestTime: fundValue.estimateTime || fundValue.navDate,
    };
  }
  if (quoteValue) {
    return {
      code: quoteValue.code,
      name: quoteValue.name,
      quote: quoteValue,
      source: "东方财富场内行情",
      latestPrice: quoteValue.price,
      latestChangePct: quoteValue.changePct,
      latestTime: nowStamp(),
    };
  }
  return null;
}

function scoreBoard(item) {
  return item.signalScore || 0;
}

function returnFields(item) {
  return [item.changePct, item.return5d, item.return10d, item.return20d, item.return60d, item.returnYtd].filter(Number.isFinite);
}

function estimateVolatility(item) {
  const normalized = [
    item.changePct,
    Number.isFinite(item.return5d) ? item.return5d / Math.sqrt(5) : null,
    Number.isFinite(item.return10d) ? item.return10d / Math.sqrt(10) : null,
    Number.isFinite(item.return20d) ? item.return20d / Math.sqrt(20) : null,
    Number.isFinite(item.return60d) ? item.return60d / Math.sqrt(60) : null,
  ].filter(Number.isFinite);
  return Math.max(stddev(normalized) * Math.sqrt(20), Math.abs(item.amplitude || 0), 1);
}

function trendConsistency(item) {
  const values = [item.return5d, item.return10d, item.return20d, item.return60d, item.returnYtd].filter(Number.isFinite);
  if (!values.length) return 0.5;
  return values.filter((value) => value > 0).length / values.length;
}

function overheatPenalty(item) {
  const penalties = [
    Math.max((item.changePct || 0) - 5.5, 0) * 2.2,
    Math.max((item.amplitude || 0) - 8.5, 0) * 1.5,
    Math.max((item.return5d || 0) - 14, 0) * 0.8,
    Math.max((item.return20d || 0) - 35, 0) * 0.45,
  ];
  return sum(penalties);
}

function enrichSignalUniverse(items) {
  if (!items.length) return items;
  const prepared = items.map((item) => {
    const mediumMomentum =
      weightedAverage(
        [
          { value: item.return5d, weight: 0.18 },
          { value: item.return10d, weight: 0.18 },
          { value: item.return20d, weight: 0.26 },
          { value: item.return60d, weight: 0.25 },
          { value: item.returnYtd, weight: 0.13 },
        ],
        (entry) => entry.value,
        (entry) => entry.weight,
      ) || 0;
    const shortMomentum =
      weightedAverage(
        [
          { value: item.changePct, weight: 0.35 },
          { value: item.return5d, weight: 0.4 },
          { value: item.return10d, weight: 0.25 },
        ],
        (entry) => entry.value,
        (entry) => entry.weight,
      ) || 0;
    const volatility = estimateVolatility(item);
    const riskAdjustedMomentum = mediumMomentum / volatility;
    const logAmount = item.amount ? Math.log10(Math.max(item.amount, 1)) : null;
    const flowRatio = item.amount ? (item.mainNet || 0) / item.amount : null;
    const dataCompleteness = returnFields(item).length / 6;
    return {
      ...item,
      mediumMomentum,
      shortMomentum,
      riskAdjustedMomentum,
      logAmount,
      flowRatio,
      dataCompleteness,
      trendConsistency: trendConsistency(item),
      estimatedVolatility: Number(volatility.toFixed(2)),
    };
  });

  const stats = {
    shortMomentum: signalStats(prepared, "shortMomentum"),
    mediumMomentum: signalStats(prepared, "mediumMomentum"),
    riskAdjustedMomentum: signalStats(prepared, "riskAdjustedMomentum"),
    logAmount: signalStats(prepared, "logAmount"),
    flowRatio: signalStats(prepared, "flowRatio"),
  };

  return prepared.map((item) => {
    const shortZ = zscore(item.shortMomentum, stats.shortMomentum.mean, stats.shortMomentum.sd);
    const mediumZ = zscore(item.mediumMomentum, stats.mediumMomentum.mean, stats.mediumMomentum.sd);
    const riskZ = zscore(item.riskAdjustedMomentum, stats.riskAdjustedMomentum.mean, stats.riskAdjustedMomentum.sd);
    const liquidityZ = zscore(item.logAmount, stats.logAmount.mean, stats.logAmount.sd);
    const flowZ = zscore(item.flowRatio, stats.flowRatio.mean, stats.flowRatio.sd);
    const consistencyBoost = (item.trendConsistency - 0.5) * 12;
    const penalty = overheatPenalty(item);
    const rawSignal =
      50 +
      mediumZ * 8 +
      riskZ * 8 +
      shortZ * 3 +
      flowZ * 4 +
      liquidityZ * 2 +
      consistencyBoost * 0.75 -
      penalty;
    const score = Math.round(clamp(50 + Math.tanh((rawSignal - 50) / 28) * 45, 0, 100));
    const confidence = Math.round(
      clamp(
        35 +
          item.dataCompleteness * 35 +
          clamp(liquidityZ + 1.5, 0, 3) * 5 +
          (Number.isFinite(item.flowRatio) ? 8 : 0) -
          (penalty > 12 ? 8 : 0),
        0,
        100,
      ),
    );
    return {
      ...item,
      signalScore: score,
      themeScore: score,
      confidence,
      signalParts: {
        shortZ: Number(shortZ.toFixed(2)),
        mediumZ: Number(mediumZ.toFixed(2)),
        riskZ: Number(riskZ.toFixed(2)),
        flowZ: Number(flowZ.toFixed(2)),
        liquidityZ: Number(liquidityZ.toFixed(2)),
        overheatPenalty: Number(penalty.toFixed(2)),
      },
      overheated: penalty >= 8 || (item.changePct ?? 0) > 6 || (item.amplitude ?? 0) > 9,
    };
  });
}

function buildFundThemes(boards, etfs) {
  return FUND_THEME_RULES.map((theme) => {
    const themeBoards = boards.filter((board) => board.fundTheme === theme.id);
    const themeEtfs = etfs.filter((etf) => etf.fundTheme === theme.id);
    const boardWeight = (item) => Math.max(Math.log10(Math.max(item.amount || 1, 1)) - 8, 0.5);
    const avgChange = weightedAverage(themeBoards, (item) => item.changePct ?? 0, boardWeight);
    const boardPositive = percentPositive(themeBoards);
    const flowPositive = percentPositive(themeBoards, "mainNet");
    const etfConfirm = weightedAverage(themeEtfs.slice(0, 12), (item) => item.riskAdjustedMomentum || item.changePct || 0, boardWeight);
    const totalAmount = sum(themeBoards.map((item) => item.amount ?? 0));
    const netFlow = sum(themeBoards.map((item) => item.mainNet ?? 0));
    const overheatRate = themeBoards.length
      ? themeBoards.filter((item) => item.overheated).length / themeBoards.length
      : 0;
    const avgSignalScore = weightedAverage(themeBoards, (item) => item.signalScore, boardWeight);
    const etfSignalScore = weightedAverage(themeEtfs.slice(0, 12), (item) => item.signalScore, boardWeight);
    const riskAdjustedMomentum = weightedAverage(themeBoards, (item) => item.riskAdjustedMomentum, boardWeight);
    const primaryScore = themeBoards.length ? avgSignalScore : etfSignalScore;
    const confidenceBase = themeBoards.length
      ? weightedAverage(themeBoards, (item) => item.confidence, boardWeight)
      : weightedAverage(themeEtfs, (item) => item.confidence, boardWeight);
    const coverageBoost = clamp(themeBoards.length / 8, 0, 1) * 12;
    const etfBoost = clamp(themeEtfs.length / 4, 0, 1) * 8;
    const confidence = Math.round(clamp(confidenceBase + coverageBoost + etfBoost - overheatRate * 10, 0, 100));
    const rawScore =
      primaryScore * 0.68 +
      (etfSignalScore || primaryScore) * 0.14 +
      50 * 0.08 +
      (boardPositive - 0.5) * 18 +
      (flowPositive - 0.5) * 10 -
      overheatRate * 8;
    const score = Math.round(clamp(rawScore, 0, 100));
    const matchedBoards = themeBoards
      .slice()
      .sort((a, b) => b.themeScore - a.themeScore)
      .slice(0, 6);
    const relatedEtfs = themeEtfs
      .slice()
      .sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0))
      .slice(0, 5);
    return {
      id: theme.id,
      name: theme.label,
      role: theme.role,
      code: theme.id,
      kind: "fund-theme",
      changePct: Number(avgChange.toFixed(2)),
      amount: totalAmount,
      mainNet: netFlow,
      turnover: Math.round(boardPositive * 100),
      positiveRatio: Math.round(boardPositive * 100),
      flowPositiveRatio: Math.round(flowPositive * 100),
      etfConfirm: Number(etfConfirm.toFixed(2)),
      overheatRate: Math.round(overheatRate * 100),
      confidence,
      riskAdjustedMomentum: Number(riskAdjustedMomentum.toFixed(2)),
      returns: {
        day: Number(avgChange.toFixed(2)),
        five: Number(weightedAverage(themeBoards, (item) => item.return5d, boardWeight).toFixed(2)),
        ten: Number(weightedAverage(themeBoards, (item) => item.return10d, boardWeight).toFixed(2)),
        twenty: Number(weightedAverage(themeBoards, (item) => item.return20d, boardWeight).toFixed(2)),
        sixty: Number(weightedAverage(themeBoards, (item) => item.return60d, boardWeight).toFixed(2)),
        ytd: Number(weightedAverage(themeBoards, (item) => item.returnYtd, boardWeight).toFixed(2)),
      },
      score,
      strength: themeStrength(score, overheatRate),
      action: actionableLabel(score, overheatRate),
      matchedBoards,
      relatedEtfs,
      summary:
        matchedBoards.length > 0
          ? `覆盖 ${matchedBoards.map((item) => item.name).join("、")} 等板块，风险调整动量 ${riskAdjustedMomentum.toFixed(2)}，置信度 ${confidence}。`
          : "暂无足够实时板块映射，先按观察处理。",
    };
  }).sort((a, b) => b.score - a.score);
}

function buildMarketAnalysis(indices, sectors, concepts, etfs, sourceStatus = []) {
  const indexMap = new Map(indices.map((item) => [item.name, item]));
  const coreIndexChanges = [
    indexMap.get("沪深300")?.changePct,
    indexMap.get("中证500")?.changePct,
    indexMap.get("中证1000")?.changePct,
    indexMap.get("创业板指")?.changePct,
    indexMap.get("科创50")?.changePct,
    indexMap.get("上证指数")?.changePct,
  ].filter((value) => value !== null && value !== undefined);

  const allBoards = [...sectors, ...concepts];
  const boardBreadth = percentPositive(allBoards);
  const sectorBreadth = percentPositive(sectors);
  const conceptBreadth = percentPositive(concepts);
  const positiveFlowRate = percentPositive(allBoards, "mainNet");
  const avgIndexChange = average(coreIndexChanges);
  const topHotAverage = average(allBoards.slice(0, 12).map((item) => item.changePct ?? 0));
  const hotRisk = allBoards.slice(0, 12).filter((item) => (item.changePct ?? 0) > 5.5 || (item.amplitude ?? 0) > 9).length;
  const fundThemes = buildFundThemes(allBoards, etfs);
  const strongThemeRate = fundThemes.filter((theme) => theme.score >= 58).length / Math.max(fundThemes.length, 1);
  const themeConfidence = average(fundThemes.map((theme) => theme.confidence));
  const avgThemeScore = average(fundThemes.map((theme) => theme.score));

  const score = Math.round(
    clamp(
      50 +
        clamp(avgIndexChange * 9, -18, 24) +
        (boardBreadth - 0.5) * 24 +
        (positiveFlowRate - 0.5) * 14 +
        (strongThemeRate - 0.35) * 18 +
        clamp((avgThemeScore - 50) * 0.25, -10, 12) +
        clamp((topHotAverage - 2) * 2, -6, 8) -
        hotRisk * 1.5,
      0,
      100,
    ),
  );

  const stance =
    score >= 72
      ? "偏积极"
      : score >= 58
        ? "中性偏强"
        : score >= 44
          ? "震荡观察"
          : "防守优先";

  const allocation =
    score >= 72
      ? { first: 30, pullback: 35, reserve: 35, label: "可以提高权益暴露，但主题仓仍要拆分买入。" }
      : score >= 58
        ? { first: 20, pullback: 30, reserve: 50, label: "先试仓，等指数和板块资金继续确认后加第二笔。" }
        : score >= 44
          ? { first: 10, pullback: 20, reserve: 70, label: "以宽基定投和观察为主，主题基金不追单日大涨。" }
          : { first: 0, pullback: 15, reserve: 85, label: "先保护本金，等宽基、板块广度和资金共振再动。" };

  const candidates = allBoards
    .filter((item) => item.fundTheme !== "other" && (item.changePct ?? 0) > 0 && (item.amount ?? 0) > 1_000_000_000)
    .slice()
    .sort((a, b) => b.themeScore - a.themeScore)
    .slice(0, 16);

  const candidateEtfs = etfs
    .filter((item) => (item.amount ?? 0) > 50_000_000)
    .slice()
    .sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0))
    .slice(0, 24);

  const warnings = [];
  const failedSources = sourceStatus.filter((item) => item.status === "failed");
  if (failedSources.length) warnings.push(`部分数据源暂时不可用：${failedSources.map((item) => item.name).join("、")}，本次分析会降低置信度。`);
  if (themeConfidence < 55) warnings.push("多周期字段或ETF验证覆盖不足，本次板块排序更适合观察，不宜作为加仓唯一依据。");
  if (hotRisk >= 5) warnings.push("热门板块涨幅或振幅偏高，未来几天容易分化，入场要拆成多笔。");
  if (positiveFlowRate < 0.45) warnings.push("板块资金净流入占比不足，说明上涨的持续性还需要验证。");
  if ((indexMap.get("创业板指")?.changePct ?? 0) - (indexMap.get("沪深300")?.changePct ?? 0) > 2) {
    warnings.push("成长风格明显强于大盘蓝筹，已有科技仓位不宜继续集中加码。");
  }
  if (!warnings.length) warnings.push("当前无极端风险信号，但仍建议用仓位纪律替代主观追涨。");

  return {
    score,
    stance,
    allocation,
    breadth: {
      board: Math.round(boardBreadth * 100),
      sector: Math.round(sectorBreadth * 100),
      concept: Math.round(conceptBreadth * 100),
      positiveFlow: Math.round(positiveFlowRate * 100),
      strongThemes: Math.round(strongThemeRate * 100),
      confidence: Math.round(themeConfidence),
    },
    avgIndexChange: Number(avgIndexChange.toFixed(2)),
    fundThemes,
    candidates,
    candidateEtfs,
    warnings,
    macroContext: MACRO_CONTEXT,
    rules: [
      "未来2-3个月采用分批法：宽基或红利低波做底仓，强势基金板块做卫星仓。",
      "同一基金板块合计不超过权益仓的25%-30%，单只主动基金不超过15%-20%。",
      "单日涨幅超过5%、振幅超过8%的主题，不在当天追第一笔，等1-3个交易日回踩。",
      "亏损补仓只在市场评分、基金板块强度和重仓股信号同时改善时做。",
      "若基金板块强但你的单只基金跑输同主题ETF，优先排查基金风格漂移、规模和费用。",
    ],
  };
}

async function runSource(name, fn) {
  try {
    const data = await fn();
    return { name, status: "ok", count: Array.isArray(data) ? data.length : 0, data };
  } catch (error) {
    return { name, status: "failed", count: 0, error: error.message || "fetch failed", data: [] };
  }
}

async function buildMarketPayload() {
  const cached = cache.get("market:payload");
  const now = Date.now();
  if (cached && now - cached.createdAt < 8000) return cached.value;
  if (marketInFlight) return marketInFlight;

  marketInFlight = buildMarketPayloadFresh();
  try {
    return await marketInFlight;
  } finally {
    marketInFlight = null;
  }
}

async function buildMarketPayloadFresh() {
  const now = Date.now();
  const [indicesResult, sectorsResult, conceptsResult, etfsResult] = await Promise.all([
    runSource("主要指数", fetchIndices),
    runSource("行业板块", () => fetchBoard("industry", "m:90+t:2")),
    runSource("概念板块", () => fetchBoard("concept", "m:90+t:3")),
    runSource("场内ETF", fetchEtfs),
  ]);

  const sourceStatus = [indicesResult, sectorsResult, conceptsResult, etfsResult].map(({ name, status, count, error }) => ({
    name,
    status,
    count,
    error,
  }));
  const indices = enrichSignalUniverse(indicesResult.data);
  const allBoards = enrichSignalUniverse([...sectorsResult.data, ...conceptsResult.data]);
  const sectors = allBoards.filter((item) => item.kind === "industry");
  const concepts = allBoards.filter((item) => item.kind === "concept");
  const etfs = enrichSignalUniverse(etfsResult.data);

  if (!indices.length && !sectors.length && !concepts.length && !etfs.length) {
    if (cached?.value) {
      return {
        ...cached.value,
        stale: true,
        dataDelay: "实时数据源暂时不可用，当前展示上次成功缓存",
        sourceStatus,
      };
    }
    throw new Error("所有行情数据源暂时不可用，请确认本地服务能访问互联网后重试");
  }

  const analysis = buildMarketAnalysis(indices, sectors, concepts, etfs, sourceStatus);
  const payload = {
    timestamp: nowStamp(),
    dataDelay: "行情接口按上游刷新频率更新，基金估值和持仓穿透仅供辅助判断",
    sourceStatus,
    indices,
    sectors,
    concepts,
    fundThemes: analysis.fundThemes,
    etfs,
    analysis,
  };
  cache.set("market:payload", { createdAt: now, value: payload });
  return payload;
}

function extractJsLiteral(text, varName) {
  const marker = new RegExp(`var\\s+${varName}\\s*=\\s*`);
  const match = marker.exec(text);
  if (!match) return null;
  let start = match.index + match[0].length;
  while (/\s/.test(text[start])) start += 1;
  const first = text[start];
  if (first === '"' || first === "'") {
    let escaped = false;
    for (let i = start + 1; i < text.length; i += 1) {
      const char = text[i];
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === first) {
        return text.slice(start, i + 1);
      }
    }
  }
  if (first === "{" || first === "[") {
    const closer = first === "{" ? "}" : "]";
    let depth = 0;
    let quote = null;
    let escaped = false;
    for (let i = start; i < text.length; i += 1) {
      const char = text[i];
      if (quote) {
        if (escaped) {
          escaped = false;
        } else if (char === "\\") {
          escaped = true;
        } else if (char === quote) {
          quote = null;
        }
      } else if (char === '"' || char === "'") {
        quote = char;
      } else if (char === first) {
        depth += 1;
      } else if (char === closer) {
        depth -= 1;
        if (depth === 0) return text.slice(start, i + 1);
      }
    }
  }
  const end = text.indexOf(";", start);
  return end >= 0 ? text.slice(start, end).trim() : null;
}

function parseVar(text, varName) {
  const raw = extractJsLiteral(text, varName);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw.replace(/^['"]|['"]$/g, "");
  }
}

function decodeHtml(value) {
  return String(value || "")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#039;", "'")
    .replace(/\s+/g, " ")
    .trim();
}

function stripTags(html) {
  return decodeHtml(String(html || "").replace(/<[^>]*>/g, ""));
}

function parseFundHoldingRows(text) {
  const contentMatch = text.match(/content:"([\s\S]*?)",arryear:/);
  const content = contentMatch ? contentMatch[1].replace(/\\"/g, '"') : text;
  const rows = content.match(/<tr>[\s\S]*?<\/tr>/g) || [];
  return rows
    .map((row) => {
      const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((match) => stripTags(match[1]));
      if (cells.length < 7 || !/^\d{6}$/.test(cells[1])) return null;
      const weightCell = cells.find((cell) => /%$/.test(cell)) || "";
      return {
        rank: num(cells[0]),
        code: cells[1],
        name: cells[2],
        weightPct: num(weightCell),
        marketValue: num(cells.at(-1)),
      };
    })
    .filter(Boolean);
}

async function fetchFundHoldings(code) {
  const clean = String(code || "").trim();
  if (!/^\d{6}$/.test(clean)) return [];
  const url = `https://fundf10.eastmoney.com/FundArchivesDatas.aspx?type=jjcc&code=${clean}&topline=10&year=&month=&rt=${Date.now()}`;
  const text = await cachedText(`fundHoldings:${clean}`, url, 6 * 60 * 60 * 1000, {
    ...FUND_HEADERS,
    Referer: `https://fundf10.eastmoney.com/ccmx_${clean}.html`,
  });
  return parseFundHoldingRows(text).slice(0, 10);
}

function secidFromStockCode(code) {
  const clean = String(code || "").trim();
  if (!/^\d{6}$/.test(clean)) return null;
  const market = clean.startsWith("6") || clean.startsWith("5") || clean.startsWith("9") ? "1" : "0";
  return `${market}.${clean}`;
}

async function fetchStockSnapshot(code) {
  const secid = secidFromStockCode(code);
  if (!secid) return null;
  const fields = "f57,f58,f127,f128,f129,f170,f198";
  const url = `https://push2.eastmoney.com/api/qt/stock/get?secid=${secid}&fields=${fields}`;
  const json = await eastmoneyJson(`stock:${code}`, url, 30 * 60 * 1000);
  const data = json.data;
  if (!data) return null;
  return {
    code: data.f57 || code,
    name: data.f58 || "",
    industry: data.f127 || "",
    area: data.f128 || "",
    concepts: String(data.f129 || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
    changePct: Number.isFinite(data.f170) ? data.f170 / 100 : null,
    boardCode: data.f198 || "",
  };
}

function latestAllocation(assetAllocation) {
  const series = assetAllocation?.series || [];
  const result = {};
  for (const item of series) {
    const value = Array.isArray(item.data) ? item.data.at(-1) : null;
    if (item.name?.includes("股票")) result.stockPct = num(value);
    if (item.name?.includes("债券")) result.bondPct = num(value);
    if (item.name?.includes("现金")) result.cashPct = num(value);
    if (item.name?.includes("净资产")) result.assetSize = num(value);
  }
  result.date = assetAllocation?.categories?.at(-1) || "";
  return result;
}

async function fetchFundProfile(code) {
  const clean = String(code || "").trim();
  if (!/^\d{6}$/.test(clean)) return null;
  const text = await cachedText(
    `fundProfile:${clean}`,
    `https://fund.eastmoney.com/pingzhongdata/${clean}.js?v=${Date.now()}`,
    6 * 60 * 60 * 1000,
    {
      ...FUND_HEADERS,
      Referer: `https://fund.eastmoney.com/${clean}.html`,
    },
  );
  const holdings = await fetchFundHoldings(clean).catch(() => []);
  const snapshots = await Promise.all(holdings.map((holding) => fetchStockSnapshot(holding.code).catch(() => null)));
  const enrichedHoldings = holdings.map((holding, index) => ({ ...holding, stock: snapshots[index] })).filter(Boolean);
  return {
    code: clean,
    name: parseVar(text, "fS_name") || "",
    returns: {
      oneMonth: num(parseVar(text, "syl_1y")),
      threeMonth: num(parseVar(text, "syl_3y")),
      sixMonth: num(parseVar(text, "syl_6y")),
      oneYear: num(parseVar(text, "syl_1n")),
    },
    assetAllocation: latestAllocation(parseVar(text, "Data_assetAllocation")),
    performanceScore: num(parseVar(text, "Data_performanceEvaluation")?.avr),
    holdings: enrichedHoldings,
  };
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

function trendDate(value) {
  const n = Number(value);
  const date = Number.isFinite(n) ? new Date(n > 10_000_000_000 ? n : n * 1000) : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

async function fetchFundTrend(code) {
  const clean = String(code || "").trim();
  if (!/^\d{6}$/.test(clean)) throw new Error("基金代码格式无效");
  const cacheKey = `fundTrend:${clean}`;
  const hit = cache.get(cacheKey);
  const now = Date.now();
  if (hit && now - hit.createdAt < 12 * 60 * 60 * 1000) return hit.value;

  const url = `https://fund.eastmoney.com/pingzhongdata/${clean}.js?v=${Date.now()}`;
  const response = await fetchWithTimeout(
    url,
    {
      headers: {
        ...FUND_HEADERS,
        Referer: `https://fund.eastmoney.com/${clean}.html`,
      },
    },
    6500,
  );
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const buffer = await response.arrayBuffer();
  const text = new TextDecoder("utf-8").decode(buffer);
  const trend = parseVar(text, "Data_netWorthTrend");
  if (!Array.isArray(trend) || trend.length < 60) throw new Error("历史净值不足");

  const byDate = new Map();
  for (const point of trend) {
    const date = trendDate(point.x);
    const value = num(point.y);
    if (!date || !Number.isFinite(value) || value <= 0) continue;
    byDate.set(date, { date, value });
  }
  const points = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  if (points.length < 60) throw new Error("可用历史净值不足");

  const payload = {
    code: clean,
    name: parseVar(text, "fS_name") || clean,
    points,
  };
  cache.set(cacheKey, { createdAt: now, value: payload });
  return payload;
}

function dailyReturnsFromTrend(fund) {
  const returns = [];
  for (let index = 1; index < fund.points.length; index += 1) {
    const previous = fund.points[index - 1];
    const current = fund.points[index];
    const dailyReturn = current.value / previous.value - 1;
    if (!Number.isFinite(dailyReturn) || Math.abs(dailyReturn) > 0.25) continue;
    returns.push({ date: current.date, return: dailyReturn });
  }
  return {
    code: fund.code,
    name: fund.name,
    days: returns.length,
    returns,
  };
}

function buildBasketReturns(theme, funds) {
  const fundReturns = funds.map(dailyReturnsFromTrend).filter((fund) => fund.returns.length >= 60);
  const maps = fundReturns.map((fund) => new Map(fund.returns.map((item) => [item.date, item.return])));
  const dates = unique(fundReturns.flatMap((fund) => fund.returns.map((item) => item.date))).sort();
  const minContributors = Math.max(1, Math.ceil(fundReturns.length * 0.5));
  const returns = dates
    .map((date) => {
      const values = maps.map((map) => map.get(date)).filter(Number.isFinite);
      if (values.length < minContributors) return null;
      return {
        date,
        return: average(values),
        contributors: values.length,
      };
    })
    .filter(Boolean);

  return {
    id: theme.id,
    name: theme.name,
    role: theme.role,
    liveScore: theme.score,
    liveConfidence: theme.confidence,
    funds: fundReturns.map((fund) => ({
      code: fund.code,
      name: fund.name,
      days: fund.days,
    })),
    returns,
  };
}

function chooseBacktestDates(themeBaskets, benchmarkBasket) {
  const benchmarkDates = benchmarkBasket?.returns?.map((item) => item.date) || [];
  if (benchmarkDates.length >= BACKTEST_CONFIG.minLookbackDays + 60) {
    return benchmarkDates.slice(-BACKTEST_CONFIG.maxHistoryDays);
  }
  const counts = new Map();
  for (const basket of themeBaskets) {
    for (const item of basket.returns) counts.set(item.date, (counts.get(item.date) || 0) + 1);
  }
  const minCoverage = Math.max(2, Math.ceil(themeBaskets.length * 0.35));
  return [...counts.entries()]
    .filter(([, count]) => count >= minCoverage)
    .map(([date]) => date)
    .sort()
    .slice(-BACKTEST_CONFIG.maxHistoryDays);
}

function alignBasket(basket, dates) {
  const returnMap = new Map(basket.returns.map((item) => [item.date, item.return]));
  let value = 1;
  let started = false;
  const alignedReturns = [];
  const values = [];
  for (const date of dates) {
    const dailyReturn = returnMap.get(date);
    if (Number.isFinite(dailyReturn)) {
      value *= 1 + dailyReturn;
      started = true;
      alignedReturns.push(dailyReturn);
    } else {
      alignedReturns.push(null);
    }
    values.push(started ? value : null);
  }
  return {
    ...basket,
    alignedReturns,
    values,
    availableDays: alignedReturns.filter(Number.isFinite).length,
    missingDays: alignedReturns.filter((value) => !Number.isFinite(value)).length,
  };
}

function trailingReturn(values, index, days) {
  const current = values[index];
  const previous = values[index - days];
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) return null;
  return current / previous - 1;
}

function historicalThemeSignal(series, index) {
  const r20 = trailingReturn(series.values, index, 20);
  const r60 = trailingReturn(series.values, index, 60);
  const r120 = trailingReturn(series.values, index, 120);
  const validReturns = [r20, r60, r120].filter(Number.isFinite);
  if (validReturns.length < 2) return null;

  const volatility = Math.max(stddev(series.alignedReturns.slice(Math.max(0, index - 60), index).filter(Number.isFinite)) * Math.sqrt(252), 0.02);
  const momentum =
    (Number.isFinite(r20) ? r20 * 0.2 : 0) +
    (Number.isFinite(r60) ? r60 * 0.42 : 0) +
    (Number.isFinite(r120) ? r120 * 0.28 : 0);
  const riskAdjusted = momentum / volatility;
  const consistency = validReturns.filter((value) => value > 0).length / validReturns.length;
  const overheat = Math.max((r20 || 0) - 0.18, 0) + Math.max((r60 || 0) - 0.36, 0) * 0.5;
  const raw = momentum * 95 + riskAdjusted * 9 + (consistency - 0.5) * 12 - overheat * 45;
  return {
    score: Math.round(clamp(50 + Math.tanh(raw / 22) * 42, 0, 100)),
    raw,
    momentum: Number((momentum * 100).toFixed(2)),
    riskAdjusted: Number(riskAdjusted.toFixed(2)),
    returns: {
      twenty: Number(((r20 || 0) * 100).toFixed(2)),
      sixty: Number(((r60 || 0) * 100).toFixed(2)),
      oneTwenty: Number(((r120 || 0) * 100).toFixed(2)),
    },
  };
}

function computeTurnover(currentWeights, nextWeights) {
  const keys = unique([...currentWeights.keys(), ...nextWeights.keys()]);
  return sum(keys.map((key) => Math.abs((nextWeights.get(key) || 0) - (currentWeights.get(key) || 0))));
}

function maxDrawdownFromEquity(values) {
  let peak = values[0] || 1;
  let maxDrawdown = 0;
  for (const value of values) {
    if (!Number.isFinite(value)) continue;
    peak = Math.max(peak, value);
    maxDrawdown = Math.min(maxDrawdown, value / peak - 1);
  }
  return maxDrawdown;
}

function equityFromReturns(returns) {
  let equity = 1;
  return returns.map((dailyReturn) => {
    equity *= 1 + dailyReturn;
    return equity;
  });
}

function performanceMetrics(returns) {
  const cleanReturns = returns.filter(Number.isFinite);
  if (!cleanReturns.length) {
    return {
      totalReturn: 0,
      annualizedReturn: 0,
      annualizedVolatility: 0,
      sharpe: 0,
      maxDrawdown: 0,
      winRate: 0,
    };
  }
  const equity = equityFromReturns(cleanReturns);
  const totalReturn = equity.at(-1) - 1;
  const annualizedReturn = Math.pow(Math.max(equity.at(-1), 0.0001), 252 / cleanReturns.length) - 1;
  const annualizedVolatility = stddev(cleanReturns) * Math.sqrt(252);
  const sharpe = annualizedVolatility ? (average(cleanReturns) * 252) / annualizedVolatility : 0;
  return {
    totalReturn: Number((totalReturn * 100).toFixed(2)),
    annualizedReturn: Number((annualizedReturn * 100).toFixed(2)),
    annualizedVolatility: Number((annualizedVolatility * 100).toFixed(2)),
    sharpe: Number(sharpe.toFixed(2)),
    maxDrawdown: Number((maxDrawdownFromEquity(equity) * 100).toFixed(2)),
    winRate: Number(((cleanReturns.filter((value) => value > 0).length / cleanReturns.length) * 100).toFixed(1)),
  };
}

function sampleCurve(curve, maxPoints = 90) {
  if (curve.length <= maxPoints) return curve;
  const step = Math.ceil(curve.length / maxPoints);
  return curve.filter((_, index) => index % step === 0 || index === curve.length - 1);
}

function runThemeRotationBacktest(themeBaskets, benchmarkBasket, dates) {
  const alignedThemes = themeBaskets.map((basket) => alignBasket(basket, dates));
  const alignedBenchmark = benchmarkBasket ? alignBasket(benchmarkBasket, dates) : null;
  let startIndex = BACKTEST_CONFIG.minLookbackDays;
  while (
    startIndex < dates.length - 40 &&
    alignedThemes.filter((theme) => historicalThemeSignal(theme, startIndex - 1)).length < BACKTEST_CONFIG.selectedThemes
  ) {
    startIndex += 1;
  }
  const costRate = BACKTEST_CONFIG.costBps / 10000;
  let weights = new Map();
  let strategyEquity = 1;
  let benchmarkEquity = 1;
  let turnoverTotal = 0;
  let costDrag = 0;
  let tradeCount = 0;
  let selected = [];
  const strategyReturns = [];
  const benchmarkReturns = [];
  const equityCurve = [];
  const rebalanceLog = [];

  for (let index = startIndex; index < dates.length; index += 1) {
    let cost = 0;
    if (index === startIndex || (index - startIndex) % BACKTEST_CONFIG.rebalanceDays === 0) {
      const signalIndex = index - 1;
      const ranked = alignedThemes
        .map((theme) => {
          const signal = historicalThemeSignal(theme, signalIndex);
          return signal ? { theme, signal } : null;
        })
        .filter(Boolean)
        .sort((a, b) => b.signal.score - a.signal.score)
        .slice(0, BACKTEST_CONFIG.selectedThemes);

      const nextWeights = new Map(
        ranked.map((item) => [item.theme.id, ranked.length ? 1 / ranked.length : 0]),
      );
      const turnover = computeTurnover(weights, nextWeights);
      if (turnover > 0.001) {
        tradeCount += 1;
        turnoverTotal += turnover;
        cost = turnover * costRate;
        costDrag += cost;
      }
      weights = nextWeights;
      selected = ranked;
      rebalanceLog.push({
        date: dates[index],
        turnover: Number((turnover * 100).toFixed(2)),
        cost: Number((cost * 100).toFixed(3)),
        selected: ranked.map((item) => ({
          id: item.theme.id,
          name: item.theme.name,
          score: item.signal.score,
          momentum: item.signal.momentum,
          riskAdjusted: item.signal.riskAdjusted,
        })),
      });
    }

    const grossReturn = sum(
      [...weights.entries()].map(([themeId, weight]) => {
        const theme = alignedThemes.find((item) => item.id === themeId);
        return weight * (theme?.alignedReturns[index] ?? 0);
      }),
    );
    const strategyReturn = grossReturn - cost;
    const benchmarkReturn = alignedBenchmark?.alignedReturns[index] ?? 0;
    strategyEquity *= Math.max(0.0001, 1 + strategyReturn);
    benchmarkEquity *= Math.max(0.0001, 1 + benchmarkReturn);
    strategyReturns.push(strategyReturn);
    benchmarkReturns.push(benchmarkReturn);
    equityCurve.push({
      date: dates[index],
      strategy: Number(strategyEquity.toFixed(4)),
      benchmark: Number(benchmarkEquity.toFixed(4)),
      selected: selected.map((item) => item.theme.name),
    });
  }

  const splitIndex = Math.floor(strategyReturns.length * 0.6);
  const strategy = performanceMetrics(strategyReturns);
  const benchmark = performanceMetrics(benchmarkReturns);
  const outOfSample = performanceMetrics(strategyReturns.slice(splitIndex));
  const benchmarkOutOfSample = performanceMetrics(benchmarkReturns.slice(splitIndex));
  const latestSignals = alignedThemes
    .map((theme) => {
      const signal = historicalThemeSignal(theme, dates.length - 1);
      return signal
        ? {
            id: theme.id,
            name: theme.name,
            score: signal.score,
            momentum: signal.momentum,
            riskAdjusted: signal.riskAdjusted,
            returns: signal.returns,
          }
        : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);

  return {
    summary: {
      startDate: dates[startIndex],
      endDate: dates.at(-1),
      usableDays: strategyReturns.length,
      rebalanceDays: BACKTEST_CONFIG.rebalanceDays,
      selectedThemes: BACKTEST_CONFIG.selectedThemes,
      costBps: BACKTEST_CONFIG.costBps,
      turnover: Number((turnoverTotal * 100).toFixed(2)),
      annualizedTurnover: Number(((turnoverTotal / Math.max(strategyReturns.length / 252, 0.01)) * 100).toFixed(2)),
      costDrag: Number((costDrag * 100).toFixed(2)),
      tradeCount,
      strategy,
      benchmark,
      excessReturn: Number((strategy.totalReturn - benchmark.totalReturn).toFixed(2)),
      outOfSample: {
        days: strategyReturns.length - splitIndex,
        strategy: outOfSample,
        benchmark: benchmarkOutOfSample,
        excessReturn: Number((outOfSample.totalReturn - benchmarkOutOfSample.totalReturn).toFixed(2)),
      },
    },
    latestSignals,
    themes: alignedThemes.map((theme) => {
      const signal = historicalThemeSignal(theme, dates.length - 1);
      return {
        id: theme.id,
        name: theme.name,
        role: theme.role,
        liveScore: theme.liveScore,
        liveConfidence: theme.liveConfidence,
        historyDays: theme.availableDays,
        missingDays: theme.missingDays,
        funds: theme.funds,
        historicalScore: signal?.score ?? null,
        historicalMomentum: signal?.momentum ?? null,
        historicalRiskAdjusted: signal?.riskAdjusted ?? null,
      };
    }),
    benchmark: alignedBenchmark
      ? {
          name: alignedBenchmark.name,
          funds: alignedBenchmark.funds,
          historyDays: alignedBenchmark.availableDays,
        }
      : null,
    equityCurve: sampleCurve(equityCurve),
    rebalanceLog: rebalanceLog.slice(-8),
  };
}

function themeBacktestCodes(theme) {
  const liveCodes = (theme.relatedEtfs || []).map((item) => item.code).filter(Boolean).slice(0, 2);
  const fallbackCodes = REPRESENTATIVE_THEME_ETFS[theme.id] || [];
  return unique([...liveCodes, ...fallbackCodes]).slice(0, 4);
}

async function buildBacktestPayload() {
  const cached = cache.get("backtest:payload");
  const now = Date.now();
  if (cached && now - cached.createdAt < 15 * 60 * 1000) return cached.value;
  if (backtestInFlight) return backtestInFlight;

  backtestInFlight = buildBacktestPayloadFresh();
  try {
    return await backtestInFlight;
  } finally {
    backtestInFlight = null;
  }
}

async function buildBacktestPayloadFresh() {
  const market = await buildMarketPayload();
  const themes = market.analysis.fundThemes
    .filter((theme) => theme.id !== "other")
    .slice(0, BACKTEST_CONFIG.themeCount);
  const themeCodeMap = new Map(themes.map((theme) => [theme.id, themeBacktestCodes(theme)]));
  const allCodes = unique([
    ...themes.flatMap((theme) => themeCodeMap.get(theme.id)),
    ...BACKTEST_CONFIG.benchmarkCodes,
  ]);

  const trendResults = await mapWithConcurrency(allCodes, 6, async (code) => {
    try {
      return { code, status: "ok", data: await fetchFundTrend(code) };
    } catch (error) {
      return { code, status: "failed", error: error.message || "fetch failed", data: null };
    }
  });
  const trendByCode = new Map(trendResults.filter((item) => item.status === "ok").map((item) => [item.code, item.data]));

  const themeBaskets = themes
    .map((theme) => {
      const funds = (themeCodeMap.get(theme.id) || [])
        .map((code) => trendByCode.get(code))
        .filter(Boolean)
        .slice(0, BACKTEST_CONFIG.fundsPerTheme);
      return buildBasketReturns(theme, funds);
    })
    .filter((basket) => basket.funds.length > 0 && basket.returns.length >= BACKTEST_CONFIG.minLookbackDays + 30);

  const benchmarkFunds = BACKTEST_CONFIG.benchmarkCodes.map((code) => trendByCode.get(code)).filter(Boolean);
  const benchmarkBasket = benchmarkFunds.length
    ? buildBasketReturns(
        {
          id: "benchmark",
          name: "沪深300基准",
          role: "宽基基准",
          score: 50,
          confidence: 70,
        },
        benchmarkFunds,
      )
    : null;
  const dates = chooseBacktestDates(themeBaskets, benchmarkBasket);

  if (themeBaskets.length < 3 || dates.length < BACKTEST_CONFIG.minLookbackDays + 50) {
    throw new Error("历史验证样本不足：可用主题ETF历史数据少于回测最低要求");
  }

  const result = runThemeRotationBacktest(themeBaskets, benchmarkBasket, dates);
  const coverageRatio = themeBaskets.length / Math.max(themes.length, 1);
  const successRatio = trendResults.filter((item) => item.status === "ok").length / Math.max(trendResults.length, 1);
  const confidencePenalty =
    (result.summary.strategy.maxDrawdown < -18 ? 6 : 0) +
    (result.summary.outOfSample.excessReturn < 0 ? 8 : 0) +
    (result.summary.usableDays < 220 ? 8 : 0);
  const confidence = Math.round(
    clamp(
      35 +
        coverageRatio * 28 +
        successRatio * 12 +
        clamp((result.summary.usableDays - 120) / 260, 0, 1) * 15 +
        clamp(result.summary.outOfSample.days / 100, 0, 1) * 10 -
        confidencePenalty,
      0,
      92,
    ),
  );

  const warnings = [
    "回测只验证当前板块信号框架的历史适配度，不保证未来收益。",
    "天天基金历史净值按日频处理，盘中冲击、申赎费、折溢价和真实滑点无法完全模拟。",
  ];
  if (coverageRatio < 0.7) warnings.push("部分基金板块缺少足够长的代表ETF历史，已降低历史验证置信度。");
  if (result.summary.usableDays < 220) warnings.push("有效回测交易日偏少，建议把结果当作方向验证，不宜直接放大仓位。");
  if (result.summary.outOfSample.excessReturn < 0) warnings.push("样本外阶段跑输沪深300基准，当前轮动参数需要更谨慎使用。");
  if (result.summary.strategy.maxDrawdown < -18) warnings.push("历史最大回撤较深，实盘应降低单次买入比例并设置止损/降仓纪律。");

  const payload = {
    timestamp: nowStamp(),
    method:
      "用当前基金板块候选池的代表ETF历史净值做月度轮动验证：20/60/120日动量、60日波动惩罚、等权买入前三名，并扣除单边15bp交易成本。",
    config: BACKTEST_CONFIG,
    confidence,
    coverage: {
      requestedThemes: themes.length,
      testedThemes: themeBaskets.length,
      successfulFunds: trendResults.filter((item) => item.status === "ok").length,
      requestedFunds: trendResults.length,
      startDate: result.summary.startDate,
      endDate: result.summary.endDate,
    },
    failedFunds: trendResults
      .filter((item) => item.status === "failed")
      .map((item) => ({ code: item.code, error: item.error }))
      .slice(0, 20),
    warnings,
    ...result,
  };
  cache.set("backtest:payload", { createdAt: Date.now(), value: payload });
  return payload;
}

function inferFundTheme(position, live, profile) {
  const votes = new Map();
  const evidence = [];
  const addVote = (theme, weight, reason) => {
    const current = votes.get(theme.id) || { theme, score: 0, reasons: [] };
    current.score += weight;
    current.reasons.push(reason);
    votes.set(theme.id, current);
  };

  const manualText = normalizeSearchText(position.category, position.note);
  if (manualText) {
    const theme = classifyTheme(manualText);
    addVote(theme, 12, `你填写的主题/板块指向「${theme.label}」`);
  }

  const nameText = normalizeSearchText(position.name, live?.name, profile?.name);
  if (nameText) {
    const theme = classifyTheme(nameText);
    const nameWeight = theme.id === "broad" ? (isExplicitBroadIndex(nameText) ? 18 : 6) : 10;
    addVote(theme, nameWeight, `基金名称指向「${theme.label}」`);
  }

  for (const holding of profile?.holdings || []) {
    const stockText = normalizeSearchText(
      holding.name,
      holding.stock?.industry,
      holding.stock?.concepts,
      holding.stock?.area,
    );
    const theme = classifyTheme(stockText);
    const weight = clamp((holding.weightPct || 1) / 2, 1, 8);
    addVote(theme, weight, `${holding.name}${holding.stock?.industry ? `/${holding.stock.industry}` : ""}`);
  }

  if (!votes.size) addVote(DEFAULT_THEME, 1, "缺少可识别主题，暂按宽基/均衡处理");

  const ranked = [...votes.values()].sort((a, b) => b.score - a.score);
  const top = ranked[0];
  const totalScore = sum(ranked.map((item) => item.score));
  const confidence =
    profile?.holdings?.length >= 5 && top.score / Math.max(totalScore, 1) >= 0.42
      ? "高"
      : manualText || profile?.holdings?.length
        ? "中"
        : "低";

  evidence.push(...unique(top.reasons).slice(0, 5));
  return {
    id: top.theme.id,
    label: top.theme.label,
    role: top.theme.role,
    confidence,
    evidence,
    candidates: ranked.slice(0, 3).map((item) => ({
      id: item.theme.id,
      label: item.theme.label,
      score: Number(item.score.toFixed(2)),
    })),
  };
}

function findThemeAnalysis(themeId, analysis) {
  return analysis.fundThemes.find((theme) => theme.id === themeId) || analysis.fundThemes.find((theme) => theme.id === "broad");
}

function buildPositionAdvice(position, live, profile, analysis) {
  const weight = num(position.weightPct) ?? 0;
  const cost = num(position.cost);
  const suppliedCurrent = num(position.current);
  const current = suppliedCurrent ?? live?.latestPrice ?? null;
  const todayChange = live?.latestChangePct ?? num(position.todayChangePct) ?? null;
  const pnlPct = cost && current ? ((current - cost) / cost) * 100 : null;
  const inferred = inferFundTheme(position, live, profile);
  const themeAnalysis = findThemeAnalysis(inferred.id, analysis);
  const themeScore = themeAnalysis?.score ?? Math.round(analysis.score / 2);
  const themeStrong = themeScore >= 58;
  const themeHot = themeAnalysis?.strength === "偏热" || (themeAnalysis?.overheatRate ?? 0) >= 35;
  const marketGood = analysis.score >= 58;

  const reasons = [
    `识别为「${inferred.label}」，主题识别置信度${inferred.confidence}；当前基金板块强度${themeAnalysis?.strength || "未知"}，评分${themeScore}，多周期置信度${themeAnalysis?.confidence ?? "--"}。`,
    `市场总评分${analysis.score}（${analysis.stance}），板块广度${analysis.breadth.board}%，强势基金板块占比${analysis.breadth.strongThemes}%，整体置信度${analysis.breadth.confidence ?? "--"}。`,
  ];
  if (pnlPct !== null) reasons.push(`你的持仓浮动盈亏约${pnlPct.toFixed(2)}%，仓位占比${weight || 0}%。`);
  if (profile?.assetAllocation?.stockPct !== undefined) {
    reasons.push(`基金最近披露股票仓位约${profile.assetAllocation.stockPct}%（${profile.assetAllocation.date || "最近报告期"}），属于高波动权益暴露。`);
  }
  if (profile?.returns?.oneYear !== null && profile?.returns?.oneYear !== undefined) {
    reasons.push(`基金近一年收益${profile.returns.oneYear}%，用来辅助判断中期趋势是否仍顺。`);
  }

  const actions = [];
  const watchPoints = [];
  let level = "观察";

  if (!cost || !current) {
    level = "先补数据";
    actions.push("先补充成本净值和当前净值；没有成本就只能判断板块强弱，不能判断你这笔是否该补仓或止盈。");
  }

  if (weight >= 30) {
    level = "降集中度";
    actions.push("单只基金或单一主题占比过高，优先把它压回组合的20%-25%以内，避免一次风格回撤伤到整个账户。");
  } else if (weight >= 22 && !marketGood) {
    level = "减仓观察";
    actions.push("市场还没进入积极区，已有较高仓位不建议继续补，反弹到成本附近可先降一部分集中度。");
  }

  if (pnlPct !== null && pnlPct >= 18) {
    level = themeHot || todayChange > 2.5 ? "分批止盈" : "保护利润";
    actions.push("浮盈较大，建议先落袋20%-30%；剩余仓位用移动止盈保护，例如回撤5%-8%或跌破主题强度再减。");
  } else if (pnlPct !== null && pnlPct >= 8 && !themeStrong) {
    level = "调仓";
    actions.push("已有盈利但主题强度一般，优先把盈利仓换到宽基、红利低波，或当前评分更高且未过热的基金板块。");
  }

  if (pnlPct !== null && pnlPct <= -12) {
    if (themeStrong && marketGood && weight < 15 && !themeHot) {
      level = "小额补仓";
      actions.push("亏损较深但市场和主题仍有信号，可以只补计划资金的20%-25%，补完后这只基金不超过组合15%。");
    } else {
      level = "停止补仓";
      actions.push("亏损较深且信号不够好，先停止补仓；等反弹时降低仓位，或换到更分散的宽基/红利底仓。");
    }
  } else if (pnlPct !== null && pnlPct < 0 && themeStrong && marketGood && weight < 12 && !themeHot) {
    level = level === "观察" ? "持有观察" : level;
    actions.push("小幅浮亏但主题仍强，可以先持有；若回踩不破同主题强势板块，再补一小笔。");
  }

  if (themeHot || todayChange > 4) {
    actions.push("今天不追涨。若要买，等1-3个交易日回踩，且同主题ETF没有明显放量下跌后再动。");
  }
  if (themeStrong && marketGood && weight < 10 && (pnlPct === null || pnlPct < 8) && !themeHot) {
    level = level === "观察" ? "可分批" : level;
    actions.push("若它符合你的计划仓位，可按20%-30%-50%分三笔，第一笔只做试仓，不一次买满。");
  }
  if (!actions.length) {
    actions.push("维持持有，下一次操作等市场评分、基金板块强度、你的仓位偏离三者至少一个发生变化。");
  }

  watchPoints.push(`观察「${inferred.label}」能否继续排在基金板块前半区，若跌到偏弱且资金流出，停止加仓。`);
  watchPoints.push("同主题不要只看单日涨幅，优先看回踩后是否仍强、ETF成交是否放大、板块内部是否扩散。");
  if (profile?.holdings?.length) {
    watchPoints.push(`重仓股线索：${profile.holdings.slice(0, 4).map((item) => item.name).join("、")}，它们的行业/概念会影响基金短期弹性。`);
  }

  return {
    id: position.id,
    code: position.code,
    name: position.name || live?.name || profile?.name || "",
    live,
    profile,
    cost,
    current,
    weightPct: weight,
    pnlPct: pnlPct === null ? null : Number(pnlPct.toFixed(2)),
    todayChangePct: todayChange,
    theme: {
      ...inferred,
      score: themeScore,
      strength: themeAnalysis?.strength || "未知",
      signalConfidence: themeAnalysis?.confidence ?? null,
      matched: themeAnalysis?.name || inferred.label,
      changePct: themeAnalysis?.changePct ?? null,
      positiveRatio: themeAnalysis?.positiveRatio ?? null,
      action: themeAnalysis?.action || "观察",
    },
    level,
    reasons,
    actions,
    watchPoints,
  };
}

function themeBucket(themeId) {
  if (themeId === "bond") return "reserve";
  if (themeId === "gold") return "hedge";
  if (["broad", "dividend", "utility", "finance", "consumer"].includes(themeId)) return "core";
  if (themeId === "overseas") return "overseas";
  return "satellite";
}

function estimatedEquityExposure(themeId, profile) {
  const stockPct = profile?.assetAllocation?.stockPct;
  if (Number.isFinite(stockPct)) return clamp(stockPct, 0, 100);
  if (themeId === "bond") return 10;
  if (themeId === "gold") return 35;
  return 92;
}

function historicalThemeMap(backtest) {
  return new Map((backtest?.themes || []).map((theme) => [theme.id, theme]));
}

function compositeThemeScore(theme, backtestTheme, globalBacktest) {
  const historicalScore = backtestTheme?.historicalScore;
  const validationBoost = globalBacktest?.confidence ? (globalBacktest.confidence - 65) * 0.08 : 0;
  const drawdownPenalty = globalBacktest?.summary?.strategy?.maxDrawdown < -20 ? 3 : 0;
  const score =
    (theme.score ?? 50) * 0.55 +
    (Number.isFinite(historicalScore) ? historicalScore : theme.score ?? 50) * 0.3 +
    (theme.confidence ?? 50) * 0.15 +
    validationBoost -
    drawdownPenalty -
    (theme.overheatRate ?? 0) * 0.06;
  return Math.round(clamp(score, 0, 100));
}

function targetEquityBudget(analysis, backtest) {
  const base =
    analysis.score >= 72
      ? 70
      : analysis.score >= 58
        ? 58
        : analysis.score >= 44
          ? 42
          : 26;
  const confidenceAdjust = ((analysis.breadth?.confidence ?? 60) - 60) * 0.12;
  const validationAdjust = backtest
    ? ((backtest.confidence ?? 65) - 65) * 0.12 +
      (backtest.summary?.outOfSample?.excessReturn > 0 ? 4 : -4) +
      (backtest.summary?.strategy?.maxDrawdown < -20 ? -5 : 0)
    : -3;
  return Math.round(clamp(base + confidenceAdjust + validationAdjust, 22, 78));
}

function cappedAllocation(candidates, totalPct, capFn) {
  const result = new Map();
  let remaining = Math.max(totalPct, 0);
  let active = candidates
    .map((candidate) => ({
      ...candidate,
      weight: Math.max(candidate.weight, 0.01),
    }))
    .filter((candidate) => candidate.weight > 0);

  for (let loop = 0; loop < 8 && active.length && remaining > 0.01; loop += 1) {
    const weightSum = sum(active.map((candidate) => candidate.weight));
    const next = [];
    let capped = false;
    for (const candidate of active) {
      const share = weightSum ? (remaining * candidate.weight) / weightSum : remaining / active.length;
      const cap = capFn(candidate);
      if (share >= cap) {
        result.set(candidate.id, (result.get(candidate.id) || 0) + cap);
        remaining -= cap;
        capped = true;
      } else {
        next.push(candidate);
      }
    }
    if (!capped) {
      for (const candidate of next) {
        const share = weightSum ? (remaining * candidate.weight) / weightSum : remaining / next.length;
        result.set(candidate.id, (result.get(candidate.id) || 0) + share);
      }
      remaining = 0;
      break;
    }
    active = next;
  }

  return { allocations: result, leftover: remaining };
}

function normalizeTargets(targets) {
  const cleaned = targets
    .filter((target) => target.targetPct > 0.05)
    .map((target) => ({ ...target, targetPct: Number(target.targetPct.toFixed(1)) }));
  const diff = Number((100 - sum(cleaned.map((target) => target.targetPct))).toFixed(1));
  if (Math.abs(diff) >= 0.1 && cleaned.length) {
    const reserve =
      cleaned.find((target) => target.id === "bond") ||
      cleaned.find((target) => target.id === "broad") ||
      cleaned[0];
    reserve.targetPct = Number((reserve.targetPct + diff).toFixed(1));
  }
  return cleaned.sort((a, b) => b.targetPct - a.targetPct);
}

function buildTargetThemeWeights(analysis, backtest) {
  const history = historicalThemeMap(backtest);
  const equityBudget = targetEquityBudget(analysis, backtest);
  const rankedThemes = analysis.fundThemes
    .filter((theme) => theme.id !== "other")
    .map((theme) => {
      const backtestTheme = history.get(theme.id);
      const score = compositeThemeScore(theme, backtestTheme, backtest);
      return {
        id: theme.id,
        name: theme.name,
        role: theme.role,
        bucket: themeBucket(theme.id),
        score,
        liveScore: theme.score,
        historicalScore: backtestTheme?.historicalScore ?? null,
        confidence: theme.confidence,
        strength: theme.strength,
        action: theme.action,
        relatedEtfs: theme.relatedEtfs || [],
        weight: Math.max(score - 42, 2) * clamp((theme.confidence || 55) / 70, 0.55, 1.25),
      };
    })
    .sort((a, b) => b.score - a.score);

  const gold = rankedThemes.find((theme) => theme.id === "gold");
  const goldTarget = gold?.score >= 66 ? 8 : analysis.score < 50 ? 5 : 3;
  const reserveTarget = clamp(100 - equityBudget, 12, 70);
  const bondTarget = clamp(reserveTarget - goldTarget, 8, PORTFOLIO_LIMITS.maxBondThemePct);
  const riskCapital = 100 - bondTarget - goldTarget;
  const coreTotal = Math.round(riskCapital * (analysis.score >= 58 ? 0.42 : 0.58));
  const satelliteTotal = Math.max(0, riskCapital - coreTotal);

  const coreCandidates = rankedThemes.filter((theme) => theme.bucket === "core").slice(0, 5);
  const satelliteCandidates = rankedThemes
    .filter((theme) => ["satellite", "overseas"].includes(theme.bucket))
    .slice(0, 6);
  const coreAllocation = cappedAllocation(coreCandidates, coreTotal, (theme) => PORTFOLIO_LIMITS.maxCoreThemePct);
  const satelliteAllocation = cappedAllocation(satelliteCandidates, satelliteTotal, (theme) =>
    theme.bucket === "overseas" ? PORTFOLIO_LIMITS.maxOverseasThemePct : PORTFOLIO_LIMITS.maxSatelliteThemePct,
  );

  const targets = [];
  const addTarget = (theme, targetPct) => {
    if (!theme || targetPct <= 0) return;
    targets.push({
      id: theme.id,
      name: theme.name || theme.label,
      role: theme.role,
      bucket: theme.bucket || themeBucket(theme.id),
      targetPct,
      score: theme.score,
      liveScore: theme.liveScore ?? theme.score,
      historicalScore: theme.historicalScore,
      confidence: theme.confidence,
      strength: theme.strength,
      signalAction: theme.action,
      relatedEtfs: theme.relatedEtfs,
    });
  };

  addTarget(rankedThemes.find((theme) => theme.id === "bond") || THEME_BY_ID.get("bond"), bondTarget + coreAllocation.leftover + satelliteAllocation.leftover);
  addTarget(gold, goldTarget);
  for (const [themeId, targetPct] of coreAllocation.allocations) addTarget(rankedThemes.find((theme) => theme.id === themeId), targetPct);
  for (const [themeId, targetPct] of satelliteAllocation.allocations) addTarget(rankedThemes.find((theme) => theme.id === themeId), targetPct);

  return {
    equityBudget,
    reserveTarget: bondTarget,
    targets: normalizeTargets(targets),
  };
}

function portfolioHealthScore({ analysis, backtest, maxThemeWeight, maxSingleWeight, themeCount, currentEquityExposure }) {
  const validation = backtest?.confidence ?? 55;
  const concentrationPenalty = Math.max(maxThemeWeight - 28, 0) * 1.1 + Math.max(maxSingleWeight - 18, 0) * 1.4;
  const diversificationBoost = clamp(themeCount - 2, 0, 6) * 3;
  const equityPenalty = currentEquityExposure > 85 && analysis.score < 58 ? 10 : 0;
  return Math.round(
    clamp(
      35 + analysis.score * 0.28 + validation * 0.18 + diversificationBoost - concentrationPenalty - equityPenalty,
      0,
      100,
    ),
  );
}

function buildPortfolioPlan(positions, liveResults, profiles, analysis, backtest) {
  const target = buildTargetThemeWeights(analysis, backtest);
  const targetMap = new Map(target.targets.map((theme) => [theme.id, theme]));
  const exposures = new Map();
  const enrichedPositions = positions.map((position, index) => {
    const live = liveResults[index];
    const profile = profiles[index];
    const inferred = inferFundTheme(position, live, profile);
    const themeAnalysis = findThemeAnalysis(inferred.id, analysis);
    const current = num(position.current) ?? live?.latestPrice ?? null;
    const cost = num(position.cost);
    const weightPct = num(position.weightPct) ?? 0;
    const pnlPct = cost && current ? ((current - cost) / cost) * 100 : null;
    const equityExposure = (weightPct * estimatedEquityExposure(inferred.id, profile)) / 100;
    const currentExposure = exposures.get(inferred.id) || {
      id: inferred.id,
      name: inferred.label,
      role: inferred.role,
      currentPct: 0,
      equityExposure: 0,
      positions: [],
    };
    currentExposure.currentPct += weightPct;
    currentExposure.equityExposure += equityExposure;
    currentExposure.positions.push(position.code || position.name || "未命名");
    exposures.set(inferred.id, currentExposure);
    return {
      id: position.id,
      code: position.code,
      name: position.name || live?.name || profile?.name || position.code || "未命名持仓",
      themeId: inferred.id,
      themeName: inferred.label,
      themeConfidence: inferred.confidence,
      themeScore: themeAnalysis?.score ?? 50,
      weightPct,
      equityExposure: Number(equityExposure.toFixed(2)),
      pnlPct: pnlPct === null ? null : Number(pnlPct.toFixed(2)),
      stockPct: profile?.assetAllocation?.stockPct ?? null,
      liveChangePct: live?.latestChangePct ?? null,
      inferred,
    };
  });

  const allThemeIds = unique([...target.targets.map((theme) => theme.id), ...exposures.keys()]);
  const themeTargets = allThemeIds
    .map((themeId) => {
      const targetTheme = targetMap.get(themeId);
      const exposure = exposures.get(themeId);
      const theme = findThemeAnalysis(themeId, analysis) || targetTheme || exposure;
      const currentPct = exposure?.currentPct || 0;
      const targetPct = targetTheme?.targetPct || 0;
      const diff = Number((targetPct - currentPct).toFixed(1));
      const action =
        diff >= PORTFOLIO_LIMITS.minMeaningfulTradePct
          ? "补到目标"
          : diff <= -PORTFOLIO_LIMITS.minMeaningfulTradePct
            ? "降到目标"
            : "维持";
      return {
        id: themeId,
        name: targetTheme?.name || exposure?.name || theme?.name || themeId,
        role: targetTheme?.role || exposure?.role || theme?.role || "",
        bucket: targetTheme?.bucket || themeBucket(themeId),
        currentPct: Number(currentPct.toFixed(1)),
        targetPct,
        diff,
        score: targetTheme?.score ?? theme?.score ?? null,
        liveScore: targetTheme?.liveScore ?? theme?.score ?? null,
        historicalScore: targetTheme?.historicalScore ?? null,
        confidence: targetTheme?.confidence ?? theme?.confidence ?? null,
        action,
        reason:
          action === "补到目标"
            ? "目标权重高于当前暴露，适合等回踩或分批补齐。"
            : action === "降到目标"
              ? "当前暴露高于目标，优先降低集中度或兑现高波动仓。"
              : "当前权重接近目标，先按观察纪律持有。",
        relatedEtfs: targetTheme?.relatedEtfs || [],
        positions: exposure?.positions || [],
      };
    })
    .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff) || b.targetPct - a.targetPct);

  const positionActions = enrichedPositions.map((position) => {
    const themeTarget = themeTargets.find((theme) => theme.id === position.themeId);
    const overSingle = position.weightPct - PORTFOLIO_LIMITS.maxSingleFundPct;
    let level = "持有";
    let actionPct = 0;
    let action = "维持仓位，等待目标权重或板块信号发生变化。";
    if (position.weightPct <= 0) {
      level = "补权重";
      action = "先补充仓位占比，否则只能识别主题，不能纳入组合优化。";
    } else if (overSingle > 0) {
      level = "降单只";
      actionPct = Number(overSingle.toFixed(1));
      action = `单只基金超过${PORTFOLIO_LIMITS.maxSingleFundPct}%，先至少降低约${actionPct}%组合权重。`;
    } else if (themeTarget?.diff <= -PORTFOLIO_LIMITS.minMeaningfulTradePct) {
      level = position.pnlPct !== null && position.pnlPct > 8 ? "减仓止盈" : "减仓";
      actionPct = Number(Math.min(Math.abs(themeTarget.diff), Math.max(position.weightPct * 0.45, 2)).toFixed(1));
      action = `所属板块高于目标，建议先降约${actionPct}%组合权重，优先把主题暴露拉回目标区。`;
    } else if (
      themeTarget?.diff >= PORTFOLIO_LIMITS.minMeaningfulTradePct &&
      position.themeScore >= 58 &&
      position.weightPct < PORTFOLIO_LIMITS.maxSingleFundPct - 2
    ) {
      level = "可分批加";
      actionPct = Number(Math.min(themeTarget.diff, PORTFOLIO_LIMITS.maxSingleFundPct - position.weightPct, 5).toFixed(1));
      action = `所属板块低于目标且信号仍强，可等回踩分批补${actionPct}%以内。`;
    } else if (position.themeScore < 44) {
      level = "观察降仓";
      action = "板块信号偏弱，不新增；若反弹仍跑输同主题ETF，考虑调出。";
    }
    return {
      ...position,
      level,
      actionPct,
      action,
      targetThemePct: themeTarget?.targetPct ?? 0,
      themeDiff: themeTarget?.diff ?? 0,
      watchPoints: [
        `主题目标 ${themeTarget?.targetPct ?? 0}%，当前主题暴露 ${themeTarget?.currentPct ?? 0}%，偏离 ${themeTarget?.diff ?? 0}%。`,
        position.pnlPct === null ? "补齐成本/当前净值后，才能判断止盈或补仓优先级。" : `当前浮动盈亏 ${position.pnlPct}%。`,
      ],
    };
  });

  const currentWeight = sum(enrichedPositions.map((position) => position.weightPct));
  const currentEquityExposure = sum(enrichedPositions.map((position) => position.equityExposure));
  const maxThemeWeight = Math.max(0, ...[...exposures.values()].map((theme) => theme.currentPct));
  const maxSingleWeight = Math.max(0, ...enrichedPositions.map((position) => position.weightPct));
  const healthScore = portfolioHealthScore({
    analysis,
    backtest,
    maxThemeWeight,
    maxSingleWeight,
    themeCount: exposures.size,
    currentEquityExposure,
  });
  const warnings = [];
  if (currentWeight < 60) warnings.push("录入的仓位占比合计偏低，目标权重会按完整组合给出；请确认是否漏填现金或其他基金。");
  if (maxSingleWeight > PORTFOLIO_LIMITS.maxSingleFundPct) warnings.push("存在单只基金占比过高，第三阶段优先建议先降单只集中度。");
  if (maxThemeWeight > 30) warnings.push("存在单一基金板块过度集中，后续加仓要优先补低相关底仓或防守仓。");
  if (currentEquityExposure > target.equityBudget + 12) warnings.push("当前权益暴露高于模型风险预算，若市场评分回落，应先减高波动主题。");
  if (backtest?.summary?.strategy?.maxDrawdown < -20) warnings.push("历史验证显示策略最大回撤较深，目标权重已做保守处理，但仍需分批调仓。");
  if (!warnings.length) warnings.push("当前组合没有触发极端集中度风险，按目标偏离分批调整即可。");

  const nextBuys = themeTargets
    .filter((theme) => theme.diff >= PORTFOLIO_LIMITS.minMeaningfulTradePct)
    .slice(0, 5)
    .map((theme) => ({
      id: theme.id,
      name: theme.name,
      addPct: Math.min(theme.diff, 6),
      etfs: (theme.relatedEtfs || []).slice(0, 3).map((item) => ({ code: item.code, name: item.name })),
      reason: theme.reason,
    }));

  return {
    timestamp: nowStamp(),
    method:
      "第三阶段组合优化：用实时板块评分、历史验证分数、信号置信度和持仓集中度生成风险预算，再按核心/卫星/防守桶分配目标权重。",
    summary: {
      healthScore,
      riskLevel: healthScore >= 72 ? "结构较健康" : healthScore >= 55 ? "可优化" : "需要降风险",
      marketScore: analysis.score,
      marketStance: analysis.stance,
      validationConfidence: backtest?.confidence ?? null,
      currentWeight: Number(currentWeight.toFixed(1)),
      currentEquityExposure: Number(currentEquityExposure.toFixed(1)),
      targetEquityBudget: target.equityBudget,
      reserveTarget: target.reserveTarget,
      themeCount: exposures.size,
      maxThemeWeight: Number(maxThemeWeight.toFixed(1)),
      maxSingleWeight: Number(maxSingleWeight.toFixed(1)),
    },
    themeTargets,
    positionActions,
    nextBuys,
    warnings,
    rules: [
      `单只基金目标上限 ${PORTFOLIO_LIMITS.maxSingleFundPct}%，高波动卫星主题目标上限 ${PORTFOLIO_LIMITS.maxSatelliteThemePct}%。`,
      "主题差距小于3%时不强行交易，减少来回调仓和交易成本。",
      "补仓只补目标权重不足且实时/历史信号仍在中上区的板块；减仓优先处理超目标和单只过重。",
      "目标权重是组合方向，不要求一天内完成，优先用1-3笔分批执行。",
    ],
  };
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf-8");
  return text ? JSON.parse(text) : {};
}

async function serveStatic(req, res, pathname) {
  const safePath = pathname === "/" ? "/index.html" : pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, safePath));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  try {
    const content = await readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    res.end(content);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

async function handleRequest(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = decodeURIComponent(url.pathname);

    if (pathname === "/api/health") {
      sendJson(res, 200, {
        ok: true,
        name: "fund-sector-radar",
        timestamp: nowStamp(),
      });
      return;
    }

    if (pathname === "/api/market") {
      const payload = await buildMarketPayload();
      sendJson(res, 200, payload);
      return;
    }

    if (pathname === "/api/funds") {
      const codes = (url.searchParams.get("codes") || "")
        .split(",")
        .map((code) => code.trim())
        .filter(Boolean)
        .slice(0, 20);
      const results = await Promise.all(codes.map(fetchFundOrQuote));
      sendJson(res, 200, { timestamp: nowStamp(), funds: results.filter(Boolean) });
      return;
    }

    if (pathname === "/api/backtest") {
      const payload = await buildBacktestPayload();
      sendJson(res, 200, payload);
      return;
    }

    if (pathname === "/api/portfolio-plan" && req.method === "POST") {
      const body = await readBody(req);
      const positions = Array.isArray(body.positions) ? body.positions.slice(0, 50) : [];
      const market = await buildMarketPayload();
      const [backtestResult, liveResults, profiles] = await Promise.all([
        buildBacktestPayload().then((value) => value).catch(() => null),
        Promise.all(positions.map((position) => fetchFundOrQuote(position.code).catch(() => null))),
        Promise.all(positions.map((position) => fetchFundProfile(position.code).catch(() => null))),
      ]);
      const plan = buildPortfolioPlan(positions, liveResults, profiles, market.analysis, backtestResult);
      sendJson(res, 200, plan);
      return;
    }

    if (pathname === "/api/positions" && req.method === "POST") {
      const body = await readBody(req);
      const positions = Array.isArray(body.positions) ? body.positions.slice(0, 50) : [];
      const market = await buildMarketPayload();
      const liveResults = await Promise.all(positions.map((position) => fetchFundOrQuote(position.code)));
      const profiles = await Promise.all(positions.map((position) => fetchFundProfile(position.code).catch(() => null)));
      const advice = positions.map((position, index) =>
        buildPositionAdvice(position, liveResults[index], profiles[index], market.analysis),
      );
      sendJson(res, 200, { timestamp: nowStamp(), marketScore: market.analysis.score, advice });
      return;
    }

    await serveStatic(req, res, pathname);
  } catch (error) {
    sendJson(res, 500, {
      error: error.message || "服务内部错误",
      timestamp: nowStamp(),
    });
  }
}

const server = http.createServer(handleRequest);

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Fund sector radar running at http://localhost:${PORT}`);
  });
}

module.exports = { handleRequest };
