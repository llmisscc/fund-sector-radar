const state = {
  market: null,
  backtest: null,
  portfolioPlan: null,
  boardView: "fundThemes",
  autoRefresh: true,
  isRefreshing: false,
  isBacktesting: false,
  isPlanningPortfolio: false,
  watchCodes: loadJson("fundRadar.watchCodes", ["161725", "110003", "005827", "001717"]),
  positions: loadJson("fundRadar.positions", [
    {
      id: crypto.randomUUID(),
      code: "",
      name: "",
      category: "",
      cost: "",
      current: "",
      weightPct: "",
      note: "",
    },
  ]),
};

const els = {
  statusText: document.querySelector("#statusText"),
  refreshBtn: document.querySelector("#refreshBtn"),
  autoRefreshToggle: document.querySelector("#autoRefreshToggle"),
  scoreRing: document.querySelector("#scoreRing"),
  scoreValue: document.querySelector("#scoreValue"),
  stanceText: document.querySelector("#stanceText"),
  allocationText: document.querySelector("#allocationText"),
  macroStrip: document.querySelector("#macroStrip"),
  indexTape: document.querySelector("#indexTape"),
  boardTable: document.querySelector("#boardTable"),
  strategyList: document.querySelector("#strategyList"),
  runBacktestBtn: document.querySelector("#runBacktestBtn"),
  backtestStatus: document.querySelector("#backtestStatus"),
  backtestSummary: document.querySelector("#backtestSummary"),
  backtestCurve: document.querySelector("#backtestCurve"),
  backtestThemes: document.querySelector("#backtestThemes"),
  backtestWarnings: document.querySelector("#backtestWarnings"),
  etfList: document.querySelector("#etfList"),
  watchForm: document.querySelector("#watchForm"),
  watchCodeInput: document.querySelector("#watchCodeInput"),
  watchList: document.querySelector("#watchList"),
  positionsBody: document.querySelector("#positionsBody"),
  addPositionBtn: document.querySelector("#addPositionBtn"),
  analyzePositionsBtn: document.querySelector("#analyzePositionsBtn"),
  positionAdvice: document.querySelector("#positionAdvice"),
  buildPortfolioBtn: document.querySelector("#buildPortfolioBtn"),
  portfolioStatus: document.querySelector("#portfolioStatus"),
  portfolioSummary: document.querySelector("#portfolioSummary"),
  portfolioTargets: document.querySelector("#portfolioTargets"),
  portfolioActions: document.querySelector("#portfolioActions"),
  portfolioWarnings: document.querySelector("#portfolioWarnings"),
  riskWarnings: document.querySelector("#riskWarnings"),
  copyStrategyBtn: document.querySelector("#copyStrategyBtn"),
};

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function formatNumber(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "--";
  return Number(value).toLocaleString("zh-CN", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

function formatMoney(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "--";
  const abs = Math.abs(Number(value));
  if (abs >= 100_000_000) return `${formatNumber(value / 100_000_000, 2)}亿`;
  if (abs >= 10_000) return `${formatNumber(value / 10_000, 2)}万`;
  return formatNumber(value, 0);
}

function formatPct(value, signed = true) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "--";
  const n = Number(value);
  const sign = signed && n > 0 ? "+" : "";
  return `${sign}${formatNumber(n, 2)}%`;
}

function changeClass(value) {
  if (value > 0) return "up";
  if (value < 0) return "down";
  return "flat";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setStatus(text, isError = false) {
  els.statusText.textContent = text;
  els.statusText.style.color = isError ? "#c93f32" : "";
}

async function fetchJson(url, options) {
  let response;
  try {
    response = await fetch(url, options);
  } catch (error) {
    if (window.location.protocol === "file:") {
      throw new Error("请从 http://localhost:3100 打开页面，不要直接双击 index.html。");
    }
    throw new Error("无法连接本地服务，请确认 node server.js 正在运行。");
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`接口返回异常（HTTP ${response.status}）。`);
  }
  if (!response.ok || payload.error) throw new Error(payload.error || "请求失败");
  return payload;
}

async function refreshMarket() {
  if (state.isRefreshing) return;
  state.isRefreshing = true;
  setStatus("正在刷新实时行情...");
  els.refreshBtn.classList.add("loading");
  try {
    const market = await fetchJson("/api/market");
    state.market = market;
    renderAll();
    await refreshWatchList();
    const time = new Date(market.timestamp).toLocaleString("zh-CN", { hour12: false });
    const failed = (market.sourceStatus || []).filter((item) => item.status === "failed");
    const suffix = failed.length ? `｜部分数据降级：${failed.map((item) => item.name).join("、")}` : "";
    setStatus(`已更新：${time}｜${market.dataDelay}${suffix}`);
  } catch (error) {
    setStatus(`刷新失败：${error.message}`, true);
  } finally {
    els.refreshBtn.classList.remove("loading");
    state.isRefreshing = false;
  }
}

function renderAll() {
  if (!state.market) return;
  renderSummary();
  renderIndices();
  renderBoardTable();
  renderStrategy();
  renderBacktest();
  renderEtfs();
  renderPositions();
  renderPortfolioPlan();
  renderWarnings();
  if (window.lucide) window.lucide.createIcons();
}

function renderSummary() {
  const { analysis } = state.market;
  els.scoreRing.style.setProperty("--score", analysis.score);
  els.scoreValue.textContent = analysis.score;
  els.stanceText.textContent = `${analysis.stance}｜板块广度 ${analysis.breadth.board}%｜强势基金板块 ${analysis.breadth.strongThemes}%｜置信度 ${analysis.breadth.confidence}%`;
  els.allocationText.textContent = `建议节奏：首笔 ${analysis.allocation.first}%｜回踩 ${analysis.allocation.pullback}%｜预留 ${analysis.allocation.reserve}%。${analysis.allocation.label}`;
  els.macroStrip.innerHTML = analysis.macroContext
    .map(
      (item) => `
        <div class="macro-item">
          <strong>${escapeHtml(item.title)}</strong>
          <span>${escapeHtml(item.value)}</span>
          <p>${escapeHtml(item.detail)}</p>
        </div>
      `,
    )
    .join("");
}

function renderIndices() {
  els.indexTape.innerHTML = state.market.indices
    .map(
      (item) => `
        <div class="index-item">
          <strong>${escapeHtml(item.name)}</strong>
          <div class="price">${formatNumber(item.price, 2)}</div>
          <div class="change ${changeClass(item.changePct)}">${formatPct(item.changePct)} ${formatNumber(item.change, 2)}</div>
        </div>
      `,
    )
    .join("");
}

function boardSignal(item) {
  if (item.kind === "fund-theme") {
    if (item.strength === "偏热") return { label: item.action, cls: "warn" };
    if (item.score >= 72) return { label: item.action, cls: "" };
    if (item.score >= 58) return { label: item.action, cls: "warn" };
    if (item.score < 44) return { label: item.action, cls: "danger" };
    return { label: item.action, cls: "" };
  }
  const change = item.changePct ?? 0;
  const flow = item.mainNet ?? 0;
  const amplitude = item.amplitude ?? 0;
  if (change > 6 || amplitude > 9) return { label: "过热等回踩", cls: "warn" };
  if (change > 1.5 && flow > 0) return { label: "强势可跟踪", cls: "" };
  if (change > 0 && flow < 0) return { label: "涨而流出", cls: "warn" };
  if (change < 0) return { label: "暂不加仓", cls: "danger" };
  return { label: "观察", cls: "" };
}

function renderBoardTable() {
  const list = state.market[state.boardView] || [];
  const isFundTheme = state.boardView === "fundThemes";
  els.boardTable.innerHTML = list
    .slice(0, isFundTheme ? list.length : 32)
    .map((item) => {
      const signal = boardSignal(item);
      if (isFundTheme) {
        return `
          <tr>
            <td>
              <strong>${escapeHtml(item.name)}</strong><br />
              <span class="muted">${escapeHtml(item.role)}｜评分 ${item.score}｜置信度 ${item.confidence}｜${escapeHtml(item.summary)}</span>
            </td>
            <td class="change ${changeClass(item.changePct)}">${formatPct(item.changePct)}<br /><span class="muted">5日 ${formatPct(item.returns?.five)}｜20日 ${formatPct(item.returns?.twenty)}｜60日 ${formatPct(item.returns?.sixty)}</span></td>
            <td>${formatMoney(item.amount)}<br /><span class="muted">覆盖 ${item.matchedBoards?.length || 0} 个强相关板块</span></td>
            <td class="change ${changeClass(item.mainNet)}">${formatMoney(item.mainNet)}<br /><span class="muted">资金正向 ${item.flowPositiveRatio}%｜风险动量 ${formatNumber(item.riskAdjustedMomentum, 2)}</span></td>
            <td>${item.positiveRatio}%</td>
            <td><span class="tag ${signal.cls}">${escapeHtml(signal.label)}</span></td>
          </tr>
        `;
      }
      return `
        <tr>
          <td><strong>${escapeHtml(item.name)}</strong><br /><span class="muted">${escapeHtml(item.code)}｜${escapeHtml(item.fundThemeLabel || "")}｜评分 ${item.signalScore ?? "--"}｜置信度 ${item.confidence ?? "--"}</span></td>
          <td class="change ${changeClass(item.changePct)}">${formatPct(item.changePct)}<br /><span class="muted">5日 ${formatPct(item.return5d)}｜20日 ${formatPct(item.return20d)}｜60日 ${formatPct(item.return60d)}</span></td>
          <td>${formatMoney(item.amount)}</td>
          <td class="change ${changeClass(item.mainNet)}">${formatMoney(item.mainNet)}</td>
          <td>${formatPct(item.turnover, false)}</td>
          <td><span class="tag ${signal.cls}">${signal.label}</span></td>
        </tr>
      `;
    })
    .join("");
}

function renderStrategy() {
  const { analysis } = state.market;
  const themes = analysis.fundThemes.slice(0, 6);
  const candidates = analysis.candidates.slice(0, 4);
  const rules = analysis.rules.slice(0, 4);
  els.strategyList.innerHTML = [
    ...themes.map((item) => {
      const signal = boardSignal(item);
      return `
        <article class="strategy-item">
          <div class="strategy-meta">
            <strong>${escapeHtml(item.name)}</strong>
            <span class="tag ${signal.cls}">${escapeHtml(item.strength)}｜${item.score}</span>
          </div>
          <p>${escapeHtml(item.role)}｜5日 ${formatPct(item.returns?.five)}，20日 ${formatPct(item.returns?.twenty)}，60日 ${formatPct(item.returns?.sixty)}｜风险动量 ${formatNumber(item.riskAdjustedMomentum, 2)}｜置信度 ${item.confidence}。</p>
          <p>资金正向 ${item.flowPositiveRatio}%，ETF验证 ${formatNumber(item.etfConfirm, 2)}。${escapeHtml(item.action)}。</p>
          <p>${escapeHtml(item.summary)}</p>
        </article>
      `;
    }),
    `<article class="strategy-item"><strong>细分强势线索</strong>${candidates
      .map(
        (item) =>
          `<p>${escapeHtml(item.name)}｜${escapeHtml(item.fundThemeLabel)}｜涨跌 ${formatPct(item.changePct)}｜成交 ${formatMoney(item.amount)}｜${item.overheated ? "偏热等回踩" : "可继续跟踪"}</p>`,
      )
      .join("")}</article>`,
    `<article class="strategy-item"><strong>仓位纪律</strong>${rules.map((rule) => `<p>${escapeHtml(rule)}</p>`).join("")}</article>`,
  ].join("");
}

function renderMetric(label, value, detail, cls = "") {
  return `
    <div class="metric-item">
      <span>${escapeHtml(label)}</span>
      <strong class="${cls}">${value}</strong>
      <small>${escapeHtml(detail || "")}</small>
    </div>
  `;
}

function curvePath(points, key, width, height, padding, minValue, maxValue) {
  if (!points.length) return "";
  const span = maxValue - minValue || 1;
  return points
    .map((point, index) => {
      const x = padding + (index / Math.max(points.length - 1, 1)) * (width - padding * 2);
      const y = height - padding - ((point[key] - minValue) / span) * (height - padding * 2);
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

function renderBacktestCurve(curve) {
  if (!curve?.length) {
    els.backtestCurve.innerHTML = '<div class="empty-state">暂无回测曲线。</div>';
    return;
  }
  const width = 920;
  const height = 240;
  const padding = 28;
  const values = curve.flatMap((point) => [point.strategy, point.benchmark]).filter(Number.isFinite);
  const minValue = Math.min(...values) * 0.98;
  const maxValue = Math.max(...values) * 1.02;
  const start = curve[0]?.date || "";
  const end = curve.at(-1)?.date || "";
  els.backtestCurve.innerHTML = `
    <div class="curve-head">
      <span>${escapeHtml(start)} - ${escapeHtml(end)}</span>
      <span><i class="legend-dot strategy"></i>策略净值 <i class="legend-dot benchmark"></i>沪深300基准</span>
    </div>
    <svg class="curve-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="历史回测净值曲线">
      <path class="curve-grid" d="M ${padding} ${height - padding} H ${width - padding} M ${padding} ${height / 2} H ${width - padding} M ${padding} ${padding} H ${width - padding}" />
      <path class="curve-line benchmark" d="${curvePath(curve, "benchmark", width, height, padding, minValue, maxValue)}" />
      <path class="curve-line strategy" d="${curvePath(curve, "strategy", width, height, padding, minValue, maxValue)}" />
    </svg>
  `;
}

function renderBacktest() {
  if (!els.backtestSummary) return;
  const payload = state.backtest;
  if (!payload) {
    els.backtestStatus.textContent = "等待运行";
    els.backtestSummary.innerHTML = '<div class="empty-state">点击“运行回测”，系统会用代表ETF历史净值验证当前基金板块轮动信号。</div>';
    els.backtestCurve.innerHTML = "";
    els.backtestThemes.innerHTML = "";
    els.backtestWarnings.innerHTML = "";
    return;
  }

  const { summary } = payload;
  els.backtestStatus.textContent = `置信度 ${payload.confidence}｜样本 ${summary.usableDays} 日｜${summary.startDate} 至 ${summary.endDate}`;
  els.backtestSummary.innerHTML = [
    renderMetric("策略收益", formatPct(summary.strategy.totalReturn), `年化 ${formatPct(summary.strategy.annualizedReturn)}`, changeClass(summary.strategy.totalReturn)),
    renderMetric("沪深300基准", formatPct(summary.benchmark.totalReturn), `超额 ${formatPct(summary.excessReturn)}`, changeClass(summary.excessReturn)),
    renderMetric("最大回撤", formatPct(summary.strategy.maxDrawdown), `波动 ${formatPct(summary.strategy.annualizedVolatility, false)}`, "down"),
    renderMetric("夏普", formatNumber(summary.strategy.sharpe, 2), `胜率 ${formatPct(summary.strategy.winRate, false)}`),
    renderMetric("换手", formatPct(summary.turnover, false), `年化 ${formatPct(summary.annualizedTurnover, false)}`),
    renderMetric("成本拖累", formatPct(summary.costDrag, false), `${summary.tradeCount} 次调仓`),
    renderMetric("样本外收益", formatPct(summary.outOfSample.strategy.totalReturn), `样本外超额 ${formatPct(summary.outOfSample.excessReturn)}`, changeClass(summary.outOfSample.excessReturn)),
    renderMetric("覆盖质量", `${payload.coverage.testedThemes}/${payload.coverage.requestedThemes}`, `${payload.coverage.successfulFunds}/${payload.coverage.requestedFunds} 只基金取数成功`),
  ].join("");
  renderBacktestCurve(payload.equityCurve);
  els.backtestThemes.innerHTML = payload.themes
    .slice()
    .sort((a, b) => (b.historicalScore ?? 0) - (a.historicalScore ?? 0))
    .map(
      (theme) => `
        <tr>
          <td>
            <strong>${escapeHtml(theme.name)}</strong><br />
            <span class="muted">${escapeHtml(theme.role)}｜实时评分 ${theme.liveScore}｜实时置信度 ${theme.liveConfidence}</span>
          </td>
          <td>${theme.historicalScore ?? "--"}<br /><span class="muted">动量 ${formatNumber(theme.historicalMomentum, 2)}｜风险调整 ${formatNumber(theme.historicalRiskAdjusted, 2)}</span></td>
          <td>${theme.historyDays}<br /><span class="muted">缺口 ${theme.missingDays}</span></td>
          <td>${theme.funds.map((fund) => `${escapeHtml(fund.code)} ${escapeHtml(fund.name)}`).join("<br />")}</td>
        </tr>
      `,
    )
    .join("");
  els.backtestWarnings.innerHTML = (payload.warnings || [])
    .map((warning) => `<div class="warning-item">${escapeHtml(warning)}</div>`)
    .join("");
  if (window.lucide) window.lucide.createIcons();
}

async function runBacktest() {
  if (state.isBacktesting) return;
  state.isBacktesting = true;
  els.runBacktestBtn.classList.add("loading");
  els.runBacktestBtn.disabled = true;
  els.backtestStatus.textContent = "正在拉取历史净值并回测...";
  els.backtestSummary.innerHTML = '<div class="empty-state">历史验证需要抓取多只代表ETF净值，通常需要十几秒。</div>';
  try {
    const payload = await fetchJson("/api/backtest");
    state.backtest = payload;
    renderBacktest();
    setStatus(`历史验证已完成：置信度 ${payload.confidence}，样本 ${payload.summary.usableDays} 个交易日。`);
  } catch (error) {
    els.backtestStatus.textContent = "回测失败";
    els.backtestSummary.innerHTML = `<div class="empty-state error">历史验证失败：${escapeHtml(error.message)}</div>`;
  } finally {
    els.runBacktestBtn.classList.remove("loading");
    els.runBacktestBtn.disabled = false;
    state.isBacktesting = false;
  }
}

function renderEtfs() {
  const list = state.market.analysis.candidateEtfs.slice(0, 12);
  els.etfList.innerHTML = list
    .map(
      (item) => `
        <div class="quote-row">
          <div>
              <strong>${escapeHtml(item.name)}</strong>
              <span>${escapeHtml(item.code)}｜${escapeHtml(item.fundThemeLabel || "未分类")}｜成交 ${formatMoney(item.amount)}</span>
          </div>
          <div class="change ${changeClass(item.changePct)}">${formatPct(item.changePct)}</div>
        </div>
      `,
    )
    .join("");
}

async function refreshWatchList() {
  const codes = state.watchCodes.filter(Boolean).slice(0, 20);
  if (!codes.length) {
    els.watchList.innerHTML = '<div class="quote-row"><span>还没有自选基金。</span></div>';
    return;
  }
  try {
    const payload = await fetchJson(`/api/funds?codes=${codes.join(",")}`);
    const byCode = new Map(payload.funds.map((fund) => [fund.code, fund]));
    els.watchList.innerHTML = codes
      .map((code) => {
        const fund = byCode.get(code);
        if (!fund) {
          return `
            <div class="quote-row">
              <div><strong>${escapeHtml(code)}</strong><span>暂无估值</span></div>
              <button class="remove-row" data-remove-watch="${escapeHtml(code)}" type="button" title="移除"><i data-lucide="trash-2"></i></button>
            </div>
          `;
        }
        return `
          <div class="quote-row">
            <div>
              <strong>${escapeHtml(fund.name || code)}</strong>
              <span>${escapeHtml(code)}｜${escapeHtml(fund.source)}｜${escapeHtml(fund.latestTime || "")}</span>
            </div>
            <div>
              <div class="change ${changeClass(fund.latestChangePct)}">${formatPct(fund.latestChangePct)}</div>
              <span>${formatNumber(fund.latestPrice, 4)}</span>
            </div>
            <button class="remove-row" data-remove-watch="${escapeHtml(code)}" type="button" title="移除"><i data-lucide="trash-2"></i></button>
          </div>
        `;
      })
      .join("");
    if (window.lucide) window.lucide.createIcons();
  } catch (error) {
    els.watchList.innerHTML = `<div class="quote-row"><span>自选基金刷新失败：${escapeHtml(error.message)}</span></div>`;
  }
}

function renderWarnings() {
  const warnings = state.market.analysis.warnings || [];
  els.riskWarnings.innerHTML = warnings
    .map((warning) => `<div class="warning-item">${escapeHtml(warning)}</div>`)
    .join("");
}

function renderPositions() {
  els.positionsBody.innerHTML = state.positions
    .map(
      (position) => `
        <tr data-position="${position.id}">
          <td><input data-field="code" maxlength="6" inputmode="numeric" value="${escapeHtml(position.code)}" placeholder="000000" /></td>
          <td><input data-field="name" value="${escapeHtml(position.name)}" placeholder="基金名称" /></td>
          <td><input data-field="category" value="${escapeHtml(position.category)}" placeholder="如 通信/红利/白酒" /></td>
          <td><input data-field="cost" inputmode="decimal" value="${escapeHtml(position.cost)}" placeholder="1.0000" /></td>
          <td><input data-field="current" inputmode="decimal" value="${escapeHtml(position.current)}" placeholder="可留空自动取估值" /></td>
          <td><input data-field="weightPct" inputmode="decimal" value="${escapeHtml(position.weightPct)}" placeholder="12" /></td>
          <td><button class="remove-row" data-remove-position="${position.id}" type="button" title="删除"><i data-lucide="trash-2"></i></button></td>
        </tr>
      `,
    )
    .join("");
}

function readPositionsFromTable() {
  const rows = [...els.positionsBody.querySelectorAll("tr[data-position]")];
  state.positions = rows.map((row) => {
    const current = state.positions.find((item) => item.id === row.dataset.position) || { id: row.dataset.position };
    const next = { ...current };
    row.querySelectorAll("input[data-field]").forEach((input) => {
      next[input.dataset.field] = input.value.trim();
    });
    return next;
  });
  saveJson("fundRadar.positions", state.positions);
}

async function analyzePositions() {
  readPositionsFromTable();
  const clean = state.positions.filter((position) =>
    [position.code, position.name, position.category, position.cost, position.current, position.weightPct].some(Boolean),
  );
  if (!clean.length) {
    els.positionAdvice.innerHTML = '<div class="advice-item"><p>先录入至少一条持仓。</p></div>';
    return;
  }
  els.positionAdvice.innerHTML = '<div class="advice-item"><p>正在分析持仓...</p></div>';
  try {
    const payload = await fetchJson("/api/positions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ positions: clean }),
    });
    els.positionAdvice.innerHTML = payload.advice
      .map(
        (item) => `
          <article class="advice-item">
            <div class="advice-head">
              <h3>${escapeHtml(item.name || item.code || "未命名持仓")}</h3>
              <span class="tag ${item.level.includes("止盈") || item.level.includes("减") || item.level.includes("停止") ? "warn" : ""}">${escapeHtml(item.level)}</span>
            </div>
            <p>盈亏：<span class="${changeClass(item.pnlPct)}">${item.pnlPct === null ? "--" : formatPct(item.pnlPct)}</span>｜仓位：${formatPct(item.weightPct, false)}｜主题：${escapeHtml(item.theme.label)}（${escapeHtml(item.theme.strength)} / ${item.theme.score}，识别置信度${escapeHtml(item.theme.confidence)}，信号置信度${item.theme.signalConfidence ?? "--"}）</p>
            <div class="advice-section">
              <strong>为什么</strong>
              <ul>${(item.reasons || []).map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}</ul>
            </div>
            <div class="advice-section">
              <strong>怎么做</strong>
              <ul>${item.actions.map((action) => `<li>${escapeHtml(action)}</li>`).join("")}</ul>
            </div>
            <div class="advice-section">
              <strong>观察点</strong>
              <ul>${(item.watchPoints || []).map((point) => `<li>${escapeHtml(point)}</li>`).join("")}</ul>
            </div>
          </article>
        `,
      )
      .join("");
  } catch (error) {
    els.positionAdvice.innerHTML = `<div class="advice-item"><p>分析失败：${escapeHtml(error.message)}</p></div>`;
  }
}

function planActionClass(value) {
  if (value === "降到目标" || value === "减仓" || value === "降单只" || value === "减仓止盈") return "warn";
  if (value === "观察降仓") return "danger";
  return "";
}

function renderTargetBar(currentPct, targetPct) {
  const current = Math.max(0, Math.min(Number(currentPct) || 0, 100));
  const targetValue = Math.max(0, Math.min(Number(targetPct) || 0, 100));
  return `
    <div class="target-bar" aria-label="当前与目标权重">
      <span class="target-current" style="width:${current}%"></span>
      <span class="target-marker" style="left:${targetValue}%"></span>
    </div>
  `;
}

function renderPortfolioPlan() {
  if (!els.portfolioSummary) return;
  const plan = state.portfolioPlan;
  if (!plan) {
    els.portfolioStatus.textContent = "等待生成";
    els.portfolioSummary.innerHTML = '<div class="empty-state">点击“生成组合方案”，系统会把当前持仓映射到基金板块，并给出目标仓位和调仓动作。</div>';
    els.portfolioTargets.innerHTML = "";
    els.portfolioActions.innerHTML = "";
    els.portfolioWarnings.innerHTML = "";
    return;
  }
  const { summary } = plan;
  els.portfolioStatus.textContent = `${summary.riskLevel}｜健康分 ${summary.healthScore}｜目标权益 ${summary.targetEquityBudget}%`;
  els.portfolioSummary.innerHTML = [
    renderMetric("组合健康分", summary.healthScore, summary.riskLevel),
    renderMetric("当前权益暴露", formatPct(summary.currentEquityExposure, false), `目标权益 ${formatPct(summary.targetEquityBudget, false)}`),
    renderMetric("防守/现金预算", formatPct(summary.reserveTarget, false), `市场 ${summary.marketScore}｜${summary.marketStance}`),
    renderMetric("集中度", formatPct(summary.maxThemeWeight, false), `单只最高 ${formatPct(summary.maxSingleWeight, false)}`),
    renderMetric("已录入仓位", formatPct(summary.currentWeight, false), `${summary.themeCount} 个主题`),
    renderMetric("历史验证", summary.validationConfidence ?? "--", "来自第二阶段回测"),
  ].join("");

  els.portfolioTargets.innerHTML = plan.themeTargets
    .map(
      (theme) => `
        <tr>
          <td>
            <strong>${escapeHtml(theme.name)}</strong><br />
            <span class="muted">${escapeHtml(theme.role || "")}｜综合分 ${theme.score ?? "--"}｜历史 ${theme.historicalScore ?? "--"}｜置信度 ${theme.confidence ?? "--"}</span>
          </td>
          <td>${formatPct(theme.currentPct, false)}</td>
          <td>${formatPct(theme.targetPct, false)}${renderTargetBar(theme.currentPct, theme.targetPct)}</td>
          <td class="${changeClass(theme.diff)}">${formatPct(theme.diff)}</td>
          <td><span class="tag ${planActionClass(theme.action)}">${escapeHtml(theme.action)}</span><br /><span class="muted">${escapeHtml(theme.reason)}</span></td>
        </tr>
      `,
    )
    .join("");

  els.portfolioActions.innerHTML = plan.positionActions
    .map(
      (item) => `
        <article class="advice-item">
          <div class="advice-head">
            <h3>${escapeHtml(item.name || item.code)}</h3>
            <span class="tag ${planActionClass(item.level)}">${escapeHtml(item.level)}</span>
          </div>
          <p>${escapeHtml(item.code || "")}｜${escapeHtml(item.themeName)}｜仓位 ${formatPct(item.weightPct, false)}｜目标主题 ${formatPct(item.targetThemePct, false)}｜主题偏离 ${formatPct(item.themeDiff)}｜盈亏 ${item.pnlPct === null ? "--" : formatPct(item.pnlPct)}</p>
          <div class="advice-section">
            <strong>动作</strong>
            <p>${escapeHtml(item.action)}</p>
          </div>
          <div class="advice-section">
            <strong>观察点</strong>
            <ul>${(item.watchPoints || []).map((point) => `<li>${escapeHtml(point)}</li>`).join("")}</ul>
          </div>
        </article>
      `,
    )
    .join("");

  els.portfolioWarnings.innerHTML = [
    ...(plan.nextBuys || []).map(
      (item) =>
        `<div class="warning-item"><strong>${escapeHtml(item.name)}</strong><br />目标仍缺 ${formatPct(item.addPct, false)} 左右。${escapeHtml(item.reason)}${item.etfs?.length ? `<br /><span class="muted">可观察：${item.etfs.map((etf) => `${escapeHtml(etf.code)} ${escapeHtml(etf.name)}`).join("、")}</span>` : ""}</div>`,
    ),
    ...(plan.warnings || []).map((warning) => `<div class="warning-item">${escapeHtml(warning)}</div>`),
    ...(plan.rules || []).map((rule) => `<div class="warning-item">${escapeHtml(rule)}</div>`),
  ].join("");
  if (window.lucide) window.lucide.createIcons();
}

async function buildPortfolioPlan() {
  readPositionsFromTable();
  const clean = state.positions.filter((position) =>
    [position.code, position.name, position.category, position.cost, position.current, position.weightPct].some(Boolean),
  );
  if (!clean.length) {
    state.portfolioPlan = null;
    renderPortfolioPlan();
    els.portfolioSummary.innerHTML = '<div class="empty-state error">先录入至少一条持仓，再生成组合方案。</div>';
    return;
  }
  if (state.isPlanningPortfolio) return;
  state.isPlanningPortfolio = true;
  els.buildPortfolioBtn.disabled = true;
  els.buildPortfolioBtn.classList.add("loading");
  els.portfolioStatus.textContent = "正在穿透持仓并计算目标权重...";
  els.portfolioSummary.innerHTML = '<div class="empty-state">第三阶段会同时调用实时信号、历史验证和持仓穿透，可能需要十几秒。</div>';
  try {
    const payload = await fetchJson("/api/portfolio-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ positions: clean }),
    });
    state.portfolioPlan = payload;
    renderPortfolioPlan();
    setStatus(`组合方案已生成：健康分 ${payload.summary.healthScore}，目标权益 ${payload.summary.targetEquityBudget}%。`);
  } catch (error) {
    els.portfolioStatus.textContent = "生成失败";
    els.portfolioSummary.innerHTML = `<div class="empty-state error">组合方案生成失败：${escapeHtml(error.message)}</div>`;
  } finally {
    els.buildPortfolioBtn.disabled = false;
    els.buildPortfolioBtn.classList.remove("loading");
    state.isPlanningPortfolio = false;
  }
}

function copyStrategy() {
  if (!state.market) return;
  const { analysis } = state.market;
  const lines = [
    `市场评分：${analysis.score}（${analysis.stance}）`,
    `分批节奏：首笔${analysis.allocation.first}%、回踩${analysis.allocation.pullback}%、预留${analysis.allocation.reserve}%`,
    "基金板块：",
    ...analysis.fundThemes.slice(0, 8).map((item) => `- ${item.name}：评分${item.score}，置信度${item.confidence}，${item.strength}，${item.action}，5日${formatPct(item.returns?.five)}，20日${formatPct(item.returns?.twenty)}，60日${formatPct(item.returns?.sixty)}`),
    "细分线索：",
    ...analysis.candidates.slice(0, 6).map((item) => `- ${item.name}：${item.fundThemeLabel}，${formatPct(item.changePct)}，${item.overheated ? "等回踩" : "可跟踪"}`),
    "规则：",
    ...analysis.rules.map((rule) => `- ${rule}`),
  ];
  navigator.clipboard.writeText(lines.join("\n"));
  setStatus("策略摘要已复制到剪贴板。");
}

document.querySelectorAll(".segment").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".segment").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    state.boardView = button.dataset.board;
    renderBoardTable();
  });
});

els.refreshBtn.addEventListener("click", refreshMarket);
els.autoRefreshToggle.addEventListener("change", (event) => {
  state.autoRefresh = event.target.checked;
});

els.watchForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const code = els.watchCodeInput.value.trim();
  if (!/^\d{6}$/.test(code)) {
    setStatus("请输入6位基金代码。", true);
    return;
  }
  if (!state.watchCodes.includes(code)) state.watchCodes.unshift(code);
  saveJson("fundRadar.watchCodes", state.watchCodes);
  els.watchCodeInput.value = "";
  await refreshWatchList();
});

els.watchList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-remove-watch]");
  if (!button) return;
  state.watchCodes = state.watchCodes.filter((code) => code !== button.dataset.removeWatch);
  saveJson("fundRadar.watchCodes", state.watchCodes);
  await refreshWatchList();
});

els.addPositionBtn.addEventListener("click", () => {
  readPositionsFromTable();
  state.positions.push({
    id: crypto.randomUUID(),
    code: "",
    name: "",
    category: "",
    cost: "",
    current: "",
    weightPct: "",
    note: "",
  });
  saveJson("fundRadar.positions", state.positions);
  renderPositions();
  if (window.lucide) window.lucide.createIcons();
});

els.positionsBody.addEventListener("input", readPositionsFromTable);
els.positionsBody.addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-position]");
  if (!button) return;
  state.positions = state.positions.filter((position) => position.id !== button.dataset.removePosition);
  if (!state.positions.length) {
    state.positions.push({ id: crypto.randomUUID(), code: "", name: "", category: "", cost: "", current: "", weightPct: "" });
  }
  saveJson("fundRadar.positions", state.positions);
  renderPositions();
  if (window.lucide) window.lucide.createIcons();
});

els.analyzePositionsBtn.addEventListener("click", analyzePositions);
els.buildPortfolioBtn.addEventListener("click", buildPortfolioPlan);
els.copyStrategyBtn.addEventListener("click", copyStrategy);
els.runBacktestBtn.addEventListener("click", runBacktest);

setInterval(() => {
  if (state.autoRefresh) refreshMarket();
}, 30000);

renderPositions();
renderBacktest();
renderPortfolioPlan();
refreshMarket();
