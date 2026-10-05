import { Chart, registerables } from "chart.js";
import { formatValue, formatAxisValue, formatShortDate, formatCurrency } from "./utils";

Chart.register(...registerables);

const REDUCED_MOTION =
  typeof window !== "undefined" &&
  window.matchMedia &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;
Chart.defaults.animation.duration = REDUCED_MOTION ? 0 : 500;
Chart.defaults.animation.easing = "easeOutQuart";
Chart.defaults.transitions.active.animation.duration = REDUCED_MOTION ? 0 : 180;
Chart.defaults.transitions.resize.animation.duration = 0;
Chart.defaults.resizeDelay = 120;

export function isDarkTheme() {
  return document.documentElement.classList.contains("dark");
}

export function chartPalette() {
  const dark = isDarkTheme();
  return {
    grid: dark ? "#232329" : "#f1f2f5",
    tick: dark ? "#9a9aa2" : "#6e6e73",
    text: dark ? "#f4f4f5" : "#111113",
    surface: dark ? "#18181b" : "#ffffff",
    tooltip: dark ? "#0f0f11" : "#111113"
  };
}

export const ACCENT = "#E8AF3E";
export const ACCENT_HOVER = "#B7791F";
export const PIE_SECONDARY = "#94a3b8";
const PIE_COLORS = [ACCENT, PIE_SECONDARY, "#b45309", "#64748b", "#f2c766", "#0f766e", "#7c3aed", "#0284c7", "#65a30d", "#db2777"];

function scaleTransform(v) {
  const n = Number(v) || 0;
  return Math.sign(n) * Math.sqrt(Math.abs(n));
}

const PIE_OUTSIDE_MIN_HEIGHT = 200;
const PIE_LEGEND_ESTIMATE = 44;
const PIE_LAYOUT_PADDING = 18;

function isPieChart(chart) {
  return chart.config.type === "doughnut" || chart.config.type === "pie";
}

function pieValueLabelsOn(chart) {
  const local = chart.__valueLabels || {};
  const opts = (chart.options.plugins && chart.options.plugins.valueLabels) || {};
  return local.display !== undefined ? local.display : !!opts.display;
}

function pieLabelsOutside(chart) {
  return isPieChart(chart) && (chart.height || 0) >= PIE_OUTSIDE_MIN_HEIGHT;
}

function pieLabelFontSize(chart) {
  const size = Math.min(chart.width || 0, chart.height || 0);
  return Math.max(14, Math.min(20, Math.round(size / 18)));
}

function reservePieLabelSpace(chart) {
  if (!isPieChart(chart)) return;
  const raw = chart.config.options;
  if (!pieValueLabelsOn(chart) || !pieLabelsOutside(chart)) {
    raw.radius = "100%";
    return;
  }
  const fs = pieLabelFontSize(chart);
  const w = chart.width || 0;
  const h = Math.max(0, (chart.height || 0) - PIE_LEGEND_ESTIMATE);
  const half = Math.min(w, h) / 2 - PIE_LAYOUT_PADDING;
  if (half <= 0) return;
  const r = Math.min(h / 2 - fs * 1.8, w / 2 - fs * 4.4);
  const pct = Math.max(0.3, Math.min(1, r / half));
  raw.radius = `${Math.round(pct * 100)}%`;
}

const valueLabelsPlugin = {
  id: "valueLabels",
  beforeUpdate(chart) {
    try {
      reservePieLabelSpace(chart);
    } catch (err) {
    }
  },
  afterDatasetsDraw(chart) {
    try {
      drawValueLabels(chart);
    } catch (err) {
    }
  }
};

Chart.register(valueLabelsPlugin);

function drawValueLabels(chart) {
  const local = chart.__valueLabels || {};
  const opts = (chart.options.plugins && chart.options.plugins.valueLabels) || {};
  const display = local.display !== undefined ? local.display : opts.display;
  if (!display) return;

  const { ctx } = chart;
  const p = chartPalette();
  const compact = local.compact !== undefined ? local.compact : opts.compact;
  const isPie = chart.config.type === "doughnut" || chart.config.type === "pie";
  if (isPie && (!chart.getDatasetMeta(0) || !chart.data.datasets[0])) return;
  const pieTotal = isPie ? (chart.data.datasets[0].data || []).reduce((a, b) => a + (Number(b) || 0), 0) : 0;
  const pieSub = (val) =>
    chart.__pieShowPercent && pieTotal > 0 ? formatPiePercent((Number(val) / pieTotal) * 100) : "";
  const rawFormatter = local.formatter !== undefined ? local.formatter : opts.formatter;
  const formatter = typeof rawFormatter === "function" ? rawFormatter : null;
  const label = (val) => (formatter ? formatter(val) : String(val));
  ctx.save();
  ctx.font = compact ? "700 9px Inter, sans-serif" : "700 12px Inter, sans-serif";
  ctx.textAlign = "center";

  if (isPie) {
    const meta = chart.getDatasetMeta(0);
    const ds = chart.data.datasets[0];
    const outside = pieLabelsOutside(chart);
    const fs = pieLabelFontSize(chart);
    if (outside) ctx.font = `700 ${fs}px Inter, sans-serif`;
    const labelY = {};
    if (outside) {
      const gap = fs * (chart.__pieShowPercent ? 2.4 : 1.5);
      const bySide = { right: [], left: [] };
      meta.data.forEach((el, i) => {
        if (ds.data[i] == null) return;
        const q = el.getProps(["y", "startAngle", "endAngle", "outerRadius"], true);
        if (q.endAngle - q.startAngle < 0.01) return;
        const m = (q.startAngle + q.endAngle) / 2;
        bySide[Math.cos(m) >= 0 ? "right" : "left"].push({ i, y: q.y + Math.sin(m) * (q.outerRadius + fs * 0.9) });
      });
      Object.values(bySide).forEach((list) => {
        list.sort((x, y) => x.y - y.y);
        for (let k = 1; k < list.length; k++) {
          if (list[k].y - list[k - 1].y < gap) list[k].y = list[k - 1].y + gap;
        }
        const over = list.length ? list[list.length - 1].y - (chart.height - fs) : 0;
        if (over > 0) list.forEach((it) => (it.y -= over));
        for (let k = list.length - 2; k >= 0; k--) {
          if (list[k + 1].y - list[k].y < gap) list[k].y = list[k + 1].y - gap;
        }
        const under = list.length ? fs - list[0].y : 0;
        if (under > 0) list.forEach((it) => (it.y += under));
        list.forEach((it) => (labelY[it.i] = it.y));
      });
    }
    meta.data.forEach((el, i) => {
      const val = ds.data[i];
      if (val == null) return;
      const prop = el.getProps(["x", "y", "startAngle", "endAngle", "innerRadius", "outerRadius"], true);
      const mid = (prop.startAngle + prop.endAngle) / 2;
      const cos = Math.cos(mid);
      const sin = Math.sin(mid);

      if (!outside) {
        const r = (prop.outerRadius + prop.innerRadius) / 2;
        ctx.fillStyle = ds.backgroundColor[i] === PIE_SECONDARY ? "#1f2937" : "#ffffff";
        ctx.textBaseline = "middle";
        const sub = pieSub(val);
        if (sub) {
          ctx.fillText(label(val), prop.x + cos * r, prop.y + sin * r - 7);
          ctx.font = "600 10px Inter, sans-serif";
          ctx.fillText(sub, prop.x + cos * r, prop.y + sin * r + 7);
          ctx.font = compact ? "700 9px Inter, sans-serif" : "700 12px Inter, sans-serif";
        } else {
          ctx.fillText(label(val), prop.x + cos * r, prop.y + sin * r);
        }
        return;
      }

      if (prop.endAngle - prop.startAngle < 0.01) return;

      const right = cos >= 0;
      const sx = prop.x + cos * (prop.outerRadius - 2);
      const sy = prop.y + sin * (prop.outerRadius - 2);
      const ex = prop.x + cos * (prop.outerRadius + fs * 0.9);
      const ey = labelY[i] !== undefined ? labelY[i] : prop.y + sin * (prop.outerRadius + fs * 0.9);
      const tx = ex + (right ? fs * 0.9 : -fs * 0.9);

      ctx.save();
      ctx.strokeStyle = p.tick;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
      ctx.lineTo(tx, ey);
      ctx.stroke();
      ctx.fillStyle = p.tick;
      ctx.beginPath();
      ctx.arc(sx, sy, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.fillStyle = p.text;
      ctx.textAlign = right ? "left" : "right";
      ctx.textBaseline = "middle";
      const subOut = pieSub(val);
      if (subOut) {
        ctx.fillText(label(val), tx + (right ? 6 : -6), ey - fs * 0.6);
        ctx.font = `600 ${Math.max(10, fs - 2)}px Inter, sans-serif`;
        ctx.fillStyle = p.tick;
        ctx.fillText(subOut, tx + (right ? 6 : -6), ey + fs * 0.6);
        ctx.font = `700 ${fs}px Inter, sans-serif`;
      } else {
        ctx.fillText(label(val), tx + (right ? 6 : -6), ey);
      }
    });
  } else {
    ctx.fillStyle = p.text;
    const isBar = chart.config.type === "bar";
    const perIndex = chart.__valueFormats || [];
    const realBarValues = chart.__realBarValues;
    chart.data.datasets.forEach((ds, di) => {
      const meta = chart.getDatasetMeta(di);
      if (!meta) return;
      const total = meta.data.length;
      let lastX = -Infinity;
      meta.data.forEach((el, i) => {
        const val = isBar && di === 0 && realBarValues ? realBarValues[i] : ds.data[i];
        if (val == null) return;
        if (compact && i !== total - 1 && el.x - lastX < 24) return;
        const offset = isBar ? 5 : compact ? 4 : 9;
        if (isBar && chart.options.indexAxis === "y") {
          let tipX = el.x;
          const trend = chart.__trendLine;
          if (trend && Array.isArray(trend.data) && chart.scales.x && trend.data[i] != null) {
            tipX = Math.max(tipX, chart.scales.x.getPixelForValue(Number(trend.data[i])) + 3);
          }
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          const fmt = perIndex[i];
          ctx.fillText(fmt === "currency" ? formatCurrency(val) : label(val), tipX + offset, el.y);
          return;
        }
        let y = el.y - offset;
        ctx.textBaseline = "bottom";
        if (y - (compact ? 10 : 13) < 0) {
          ctx.textBaseline = "top";
          y = el.y + offset;
        }
        const idxFormat = perIndex[i];
        const text = idxFormat === "currency" ? formatCurrency(val) : label(val);
        ctx.fillText(text, el.x, y);
        lastX = el.x;
      });
    });
  }
  ctx.restore();
}

const meanLinePlugin = {
  id: "meanLine",
  afterDatasetsDraw(chart) {
    try {
      drawMeanLine(chart);
    } catch (err) {
    }
  }
};

function drawMeanLine(chart) {
  const m = chart.__meanLine;
  if (!m || m.value === null || m.value === undefined) return;
  const area = chart.chartArea;
  const yScale = chart.scales && chart.scales.y;
  if (!area || !yScale) return;
  const y = yScale.getPixelForValue(m.value);
  if (y < area.top || y > area.bottom) return;
  const p = chartPalette();
  const { ctx } = chart;
  ctx.save();
  ctx.strokeStyle = p.tick;
  ctx.globalAlpha = 0.55;
  ctx.setLineDash([6, 5]);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(area.left, y);
  ctx.lineTo(area.right, y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  ctx.font = "600 11px Inter, sans-serif";
  ctx.textAlign = "right";
  ctx.fillStyle = p.tick;
  ctx.fillText(m.label, area.right - 4, y - 6);
  ctx.restore();
}

Chart.register(meanLinePlugin);

export const TREND_COLOR = "#3b82f6";
const trendLinePlugin = {
  id: "trendLine",
  afterDatasetsDraw(chart) {
    try {
      drawTrendLine(chart);
    } catch (err) {
    }
  }
};

function drawTrendLine(chart) {
  const t = chart.__trendLine;
  if (!t || !Array.isArray(t.data) || !t.data.length) return;
  const meta = chart.getDatasetMeta(0);
  const horizontal = chart.options.indexAxis === "y";
  const valueScale = chart.scales && (horizontal ? chart.scales.x : chart.scales.y);
  if (!meta || !valueScale) return;

  const progress = chart.__trendProgress === undefined ? 1 : chart.__trendProgress;
  if (progress <= 0) return;

  const { ctx } = chart;
  ctx.save();
  ctx.strokeStyle = TREND_COLOR;
  ctx.lineWidth = 2;
  ctx.setLineDash([]);
  const points = [];
  t.data.forEach((val, i) => {
    const el = meta.data[i];
    if (!el || val === null || val === undefined || isNaN(Number(val))) return;
    const pos = valueScale.getPixelForValue(Number(val));
    points.push({ x: horizontal ? pos : el.x, y: horizontal ? el.y : pos });
  });

  const reach = progress * (points.length - 1);
  const visible = [];
  points.forEach((pt, i) => {
    if (i <= reach) {
      visible.push(pt);
    } else if (i - 1 <= reach && visible.length) {
      const prev = points[i - 1];
      const f = reach - (i - 1);
      visible.push({ x: prev.x + (pt.x - prev.x) * f, y: prev.y + (pt.y - prev.y) * f, partial: true });
    }
  });

  ctx.beginPath();
  visible.forEach((pt, i) => (i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
  if (visible.length > 1) ctx.stroke();

  ctx.fillStyle = TREND_COLOR;
  visible.forEach((pt) => {
    if (pt.partial) return;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

export function animateTrendLine(chart, { delay = 700, duration = 1500 } = {}) {
  cancelTrendAnimation(chart);
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    chart.__trendProgress = undefined;
    return;
  }
  chart.__trendProgress = 0;
  let start = null;
  const step = (now) => {
    if (!chart.ctx) return;
    if (start === null) start = now;
    const raw = Math.min(1, Math.max(0, (now - start) / duration));
    chart.__trendProgress = 1 - Math.pow(1 - raw, 3);
    chart.draw();
    if (raw < 1) chart.__trendRaf = requestAnimationFrame(step);
    else chart.__trendProgress = undefined;
  };
  chart.__trendTimer = setTimeout(() => {
    chart.__trendRaf = requestAnimationFrame(step);
  }, delay);
}

export function cancelTrendAnimation(chart) {
  clearTimeout(chart.__trendTimer);
  cancelAnimationFrame(chart.__trendRaf);
}

Chart.register(trendLinePlugin);

export function createMiniLineChart(canvas) {
  return new Chart(canvas, {
    type: "line",
    data: { labels: [], datasets: [{ data: [], borderColor: ACCENT, borderWidth: 2, tension: 0.4, pointRadius: 0, fill: false }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 10, bottom: 2 } },
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: {
        x: { display: false },
        y: { display: false }
      }
    }
  });
}

export function updateMiniLineChart(chart, entries) {
  if (!chart) return;
  chart.data.labels = entries.map((e) => e.date);
  chart.data.datasets[0].data = entries.map((e) => e.value);
  chart.update();
}

export function createPieChart(canvas) {
  const p = chartPalette();
  return new Chart(canvas, {
    type: "doughnut",
    data: {
      labels: ["Entradas", "Saídas"],
      datasets: [
        {
          data: [0, 0],
          backgroundColor: [ACCENT, PIE_SECONDARY],
          borderWidth: 0,
          borderRadius: 6,
          spacing: 1,
          hoverOffset: 16
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "58%",
      layout: { padding: PIE_LAYOUT_PADDING },
      animations: {
        x: { duration: 0 },
        y: { duration: 0 },
        innerRadius: { duration: 0 },
        outerRadius: { duration: 0 },
        offset: { duration: 150 }
      },
      plugins: {
        valueLabels: { display: false },
        legend: {
          position: "bottom",
          labels: { color: p.tick, font: { size: 12 }, usePointStyle: true, pointStyle: "circle", padding: 16 }
        },
        tooltip: {
          backgroundColor: p.tooltip,
          titleColor: "#ffffff",
          bodyColor: "#ffffff",
          padding: 12,
          cornerRadius: 8,
          callbacks: {
            label: (context) => {
              const base = ` ${context.label}: ${(context.chart.__pieFormatter || formatPiePercent)(context.raw)}`;
              if (!context.chart.__pieShowPercent) return base;
              const total = context.dataset.data.reduce((a, b) => a + (Number(b) || 0), 0);
              return total > 0 ? `${base} (${formatPiePercent((Number(context.raw) / total) * 100)})` : base;
            }
          }
        }
      }
    }
  });
}

export function formatPiePercent(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "—";
  return num.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
}

export function formatPieCount(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num.toLocaleString("pt-BR", { maximumFractionDigits: 0 }) : "—";
}

export function formatPieCurrency(value) {
  const num = Number(value);
  return Number.isFinite(num) ? formatCurrency(num) : "—";
}

export function pieFormatter(format) {
  if (format === "count") return formatPieCount;
  return format === "currency" ? formatPieCurrency : formatPiePercent;
}

export function setPieFormat(chart, format) {
  if (!chart) return;
  chart.__pieFormatter = pieFormatter(format);
  chart.__pieShowPercent = format === "count";
}

export function updatePieChart(chart, data) {
  if (!chart || !data) return;
  chart.data.labels = data.map((d) => d.label);
  const ds = chart.data.datasets[0];
  ds.data = data.map((d) => d.value);
  ds.backgroundColor = data.map((d, i) => d.color || PIE_COLORS[i % PIE_COLORS.length]);
  chart.update();
}

export function setShowValues(chart, display, extra = {}) {
  if (!chart) return;
  chart.__valueLabels = { ...(chart.__valueLabels || {}), display, ...extra };
  if (chart.options.plugins.valueLabels) {
    chart.options.plugins.valueLabels.display = display;
    Object.assign(chart.options.plugins.valueLabels, extra);
  }
  chart.update();
}

function buildLineScales(indicator) {
  const p = chartPalette();
  const tickFormatter = indicator ? (value) => formatAxisValue(indicator, value) : (value) => value;
  return {
    x: {
      grid: { display: false },
      ticks: { color: p.tick, maxRotation: 45, font: { size: 11 } }
    },
    y: {
      grid: { color: p.grid },
      border: { display: false },
      ticks: { color: p.tick, callback: tickFormatter },
      grace: "12%"
    }
  };
}

export function createLineChart(canvas) {
  const p = chartPalette();
  return new Chart(canvas, {
    type: "line",
    data: { labels: [], datasets: [] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 24 } },
      interaction: { mode: "index", intersect: false },
      plugins: {
        valueLabels: { display: false },
        legend: { display: false },
        tooltip: {
          backgroundColor: p.tooltip,
          titleColor: "#ffffff",
          bodyColor: "#ffffff",
          padding: 12,
          cornerRadius: 8,
          displayColors: false
        }
      },
      scales: buildLineScales(null)
    }
  });
}

export function updateLineChart(chart, indicator, entries) {
  if (!chart) return;
  chart.options.scales = buildLineScales(indicator);
  if (chart.options.plugins && chart.options.plugins.tooltip) {
    chart.options.plugins.tooltip.callbacks = {
      label: (ctx) => ` ${formatValue(indicator, ctx.parsed.y)}`
    };
  }

  if (!entries || !entries.length) {
    chart.data = { labels: [], datasets: [] };
    chart.__meanLine = null;
    chart.update();
    return;
  }

  const labels = entries.map((e) => formatShortDate(e.date));
  const values = entries.map((e) => e.value);

  if (indicator && indicator.id === "tempo_contratacao") {
    const valid = values.filter((v) => !isNaN(Number(v)));
    const mean = valid.length
      ? valid.reduce((s, v) => s + Number(v), 0) / valid.length
      : null;
    chart.__meanLine =
      mean !== null
        ? { value: Number(mean.toFixed(2)), label: `Média: ${formatValue(indicator, mean)}` }
        : null;
  } else {
    chart.__meanLine = null;
  }

  const ctx = chart.ctx;
  const area = chart.chartArea || {};
  const top = area.top !== undefined ? area.top : 0;
  const bottom = area.bottom !== undefined ? area.bottom : chart.height || 100;
  const gradient = ctx.createLinearGradient(0, top, 0, bottom);
  gradient.addColorStop(0, "rgba(232, 175, 62, 0.38)");
  gradient.addColorStop(0.55, "rgba(232, 175, 62, 0.14)");
  gradient.addColorStop(1, "rgba(232, 175, 62, 0.02)");

  chart.data = {
    labels,
    datasets: [
      {
        label: indicator.name,
        data: values,
        borderColor: ACCENT,
        backgroundColor: gradient,
        fill: true,
        tension: 0.35,
        borderWidth: 2.5,
        pointBackgroundColor: ACCENT,
        pointBorderWidth: 0,
        pointRadius: 4,
        pointHoverRadius: 6
      }
    ]
  };
  chart.update();
}

export function createSeriesLineChart(canvas) {
  const chart = createLineChart(canvas);
  chart.options.interaction = { mode: "nearest", intersect: true };
  return chart;
}

export function updateSeriesLineChart(chart, rows, options = {}) {
  if (!chart || !rows) return;
  const p = chartPalette();
  const formatter = typeof options.formatter === "function" ? options.formatter : (v) => v;
  const labels = rows.map((r) => r.label);
  const values = rows.map((r) => (r.value === null ? 0 : r.value));
  const tooltips = rows.map((r) => (r.tooltipValue != null ? r.tooltipValue : r.tooltip));

  chart.options.scales = {
    x: {
      grid: { display: false },
      ticks: options.xTicks ? { display: true, color: p.tick, autoSkip: false, maxRotation: 90, font: { size: 11 } } : { display: false }
    },
    y: {
      grid: { color: p.grid },
      border: { display: false },
      ticks: { color: p.tick, callback: (v) => formatter(v) },
      beginAtZero: true,
      grace: "12%"
    }
  };
  chart.options.plugins.tooltip.callbacks = {
    label: (context) => String(tooltips[context.dataIndex] ?? formatter(values[context.dataIndex]))
  };

  chart.__meanLine = null;
  chart.__trendLine = null;

  const area = chart.chartArea || {};
  const gradient = chart.ctx.createLinearGradient(0, area.top || 0, 0, area.bottom || chart.height || 100);
  gradient.addColorStop(0, "rgba(232, 175, 62, 0.30)");
  gradient.addColorStop(1, "rgba(232, 175, 62, 0.02)");

  chart.data = {
    labels,
    datasets: [
      {
        label: "Valor",
        data: values,
        borderColor: ACCENT,
        backgroundColor: gradient,
        fill: true,
        tension: 0.3,
        borderWidth: 2.5,
        pointBackgroundColor: ACCENT,
        pointBorderWidth: 0,
        pointRadius: 4,
        pointHoverRadius: 6,
        pointHitRadius: 14
      }
    ]
  };
  chart.update();
}

const BAR_ANIMATION_MS = REDUCED_MOTION ? 0 : 550;
const BAR_STAGGER_MAX_MS = 70;
const BAR_HOVER_GROW_PX = REDUCED_MOTION ? 0 : 8;
const BAR_HOVER_MS = 160;
const barHoverGrow = {
  id: "barHoverGrow",
  beforeDatasetsDraw(chart) {
    if (!BAR_HOVER_GROW_PX) return;
    const state = chart.__barGrow || (chart.__barGrow = { p: new Map(), t: performance.now(), saved: [] });
    const now = performance.now();
    const step = Math.min(1, (now - state.t) / BAR_HOVER_MS);
    state.t = now;
    const active = new Set(chart.getActiveElements().map((a) => `${a.datasetIndex}:${a.index}`));
    let animating = false;
    chart.data.datasets.forEach((_, di) => {
      const meta = chart.getDatasetMeta(di);
      if (meta.type !== "bar" || !meta.visible) return;
      meta.data.forEach((el, i) => {
        const key = `${di}:${i}`;
        const target = active.has(key) ? 1 : 0;
        let cur = state.p.get(key) || 0;
        if (cur !== target) {
          cur = target > cur ? Math.min(target, cur + step) : Math.max(target, cur - step);
          animating = true;
          if (cur === 0) state.p.delete(key);
          else state.p.set(key, cur);
        }
        if (!cur) return;
        const e = 1 - Math.pow(1 - cur, 3);
        const g = BAR_HOVER_GROW_PX * e;
        const saved = { el, x: el.x, y: el.y, width: el.width, height: el.height };
        state.saved.push(saved);
        if (el.horizontal) {
          el.x += g;
          el.height += g * 2;
        } else {
          el.y -= g;
          el.width += g * 2;
        }
      });
    });
    if (animating) requestAnimationFrame(() => chart.draw());
  },
  afterDatasetsDraw(chart) {
    const state = chart.__barGrow;
    if (!state) return;
    state.saved.forEach((s) => Object.assign(s.el, { x: s.x, y: s.y, width: s.width, height: s.height }));
    state.saved.length = 0;
  }
};
const BAR_STAGGER_TOTAL_MS = 900;

function barStaggerDelay(context) {
  if (context.type !== "data" || context.mode !== "default") return 0;
  const count = (context.chart.data.labels || []).length || 1;
  const step = Math.min(BAR_STAGGER_MAX_MS, BAR_STAGGER_TOTAL_MS / count);
  return context.dataIndex * step;
}

export function createBarChart(canvas, options = {}) {
  const p = chartPalette();
  const horizontal = !!options.horizontal;
  const scales = horizontal
    ? {
        y: {
          grid: { display: false },
          ticks: { color: p.tick, font: { size: 11 }, autoSkip: false }
        },
        x: {
          grid: { color: p.grid },
          border: { display: false },
          ticks: { display: false },
          beginAtZero: true,
          grace: "12%"
        }
      }
    : {
        x: {
          grid: { display: false },
          ticks: {
            color: p.tick,
            font: { size: 10 },
            autoSkip: false,
            maxRotation: 90,
            minRotation: 90
          }
        },
        y: {
          grid: { color: p.grid },
          border: { display: false },
          ticks: { display: false },
          beginAtZero: true,
          grace: "12%"
        }
      };
  return new Chart(canvas, {
    type: "bar",
    plugins: [barHoverGrow],
    data: { labels: [], datasets: [] },
    options: {
      indexAxis: horizontal ? "y" : "x",
      animation: { duration: BAR_ANIMATION_MS, easing: "easeOutQuart", delay: barStaggerDelay },
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: horizontal ? { right: 80 } : { top: 24 } },
      plugins: {
        valueLabels: { display: false },
        legend: { display: false },
        tooltip: {
          backgroundColor: p.tooltip,
          titleColor: "#ffffff",
          bodyColor: "#ffffff",
          padding: 12,
          cornerRadius: 8,
          displayColors: false
        }
      },
      scales
    }
  });
}

const BAR_SERIES_COLORS = ["#0284c7", "#db2777", ACCENT];

function updateGroupedBarChart(chart, panorama) {
  const p = chartPalette();
  const names = panorama[0].series.map((s) => s.label);
  chart.__valueFormats = [];
  chart.__realBarValues = null;
  chart.__trendLine = null;
  chart.__meanLine = null;
  chart.data = {
    labels: panorama.map((row) => row.label),
    datasets: names.map((name, si) => ({
      label: name,
      data: panorama.map((row) => (row.series[si] && row.series[si].value) || 0),
      backgroundColor: panorama[0].series[si].color || BAR_SERIES_COLORS[si % BAR_SERIES_COLORS.length],
      borderRadius: 4,
      barPercentage: 0.9,
      categoryPercentage: 0.8
    }))
  };
  chart.options.plugins.legend = {
    display: true,
    position: "bottom",
    labels: { color: p.tick, boxWidth: 12, boxHeight: 12, font: { size: 11 } }
  };
  chart.options.plugins.tooltip.displayColors = true;
  chart.options.plugins.tooltip.callbacks = {
    label: (context) => {
      const value = context.parsed.y ?? context.parsed.x;
      const fmt = chart.__valueLabels && chart.__valueLabels.formatter;
      return `${context.dataset.label}: ${typeof fmt === "function" ? fmt(value) : value}`;
    }
  };
  chart.update();
}

export function updateBarChart(chart, panorama, options = {}) {
  if (!chart || !panorama) return;
  const grouped = panorama.length > 0 && Array.isArray(panorama[0].series);
  chart.options.plugins.legend = { display: false };
  chart.options.plugins.tooltip.displayColors = false;
  if (grouped) return updateGroupedBarChart(chart, panorama);
  const labels = panorama.map((p) => p.label);
  const values = panorama.map((p) => (p.value === null ? 0 : p.value));
  const tooltips = panorama.map((p) =>
    p.tooltipValue != null ? p.tooltipValue : p.tooltip
  );
  chart.__valueFormats = panorama.map((p) => p.format || null);
  chart.__realBarValues = values;

  chart.data = {
    labels,
    datasets: [
      {
        label: "Último valor",
        data: values.map(scaleTransform),
        backgroundColor: ACCENT,
        hoverBackgroundColor: ACCENT_HOVER,
        borderRadius: 6,
          barPercentage: 0.65
      }
    ]
  };

  chart.options.plugins.tooltip.callbacks = {
    label: (context) => String(tooltips[context.dataIndex] ?? values[context.dataIndex])
  };

  const ma2 = values.map((v, i) => {
    const cur = Number(v) || 0;
    if (i === 0) return cur;
    return (Number(values[i - 1]) + cur) / 2;
  });
  chart.__trendLine =
    options.trend !== false && values.length
      ? { data: ma2.map(scaleTransform), label: "Tendência (MM2)" }
      : null;

  chart.__meanLine = null;

  chart.update();
}

const centerTextPlugin = {
  id: "centerText",
  afterDraw(chart) {
    try {
      const info = chart.__centerText;
      if (!info || !info.value) return;
      const arc = chart.getDatasetMeta(0).data[0];
      if (!arc) return;
      const inner = arc.innerRadius || 0;
      if (inner < 20) return;
      const p = chartPalette();
      const { ctx } = chart;
      let valueSize = Math.max(14, Math.min(40, Math.round(inner * 0.42)));
      const captionSize = Math.max(10, Math.min(14, Math.round(inner * 0.17)));
      const gap = info.caption ? captionSize * 0.7 : 0;
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = p.text;
      ctx.font = `700 ${valueSize}px ${Chart.defaults.font.family}`;
      const maxWidth = inner * 1.6;
      const width = ctx.measureText(info.value).width;
      if (width > maxWidth) {
        valueSize = Math.max(10, Math.floor((valueSize * maxWidth) / width));
        ctx.font = `700 ${valueSize}px ${Chart.defaults.font.family}`;
      }
      ctx.fillText(info.value, arc.x, arc.y - gap);
      if (info.caption) {
        ctx.fillStyle = p.tick;
        ctx.font = `600 ${captionSize}px ${Chart.defaults.font.family}`;
        ctx.fillText(info.caption, arc.x, arc.y + valueSize * 0.55 + gap * 0.4);
      }
      ctx.restore();
    } catch (err) {
    }
  }
};
Chart.register(centerTextPlugin);

export function setCenterText(chart, info) {
  if (!chart) return;
  chart.__centerText = info || null;
  chart.draw();
}
