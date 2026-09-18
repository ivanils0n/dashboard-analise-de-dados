/* Gráficos Chart.js (linha, barras e pizza). As funções recebem as entradas
   já filtradas pela UI; o plugin valueLabels desenha os números quando
   options.plugins.valueLabels.display = true. */
import { Chart, registerables } from "chart.js";
import { formatValue, formatAxisValue, formatShortDate, formatCurrency } from "./utils";

Chart.register(...registerables);

/* Animações mais curtas e redimensionamento com debounce: o padrão do
   Chart.js (1 s de animação a cada atualização, resize a cada pixel) deixava a
   troca de filtros e a rolagem da página pesadas — o dashboard tem mais de dez
   gráficos que reagem ao mesmo filtro. */
Chart.defaults.animation.duration = 300;
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
export const ABSENTEEISM_COLORS = ["#E8AF3E", "#b45309", "#94a3b8"];
/* Cor neutra da segunda fatia da pizza — legível em temas claro e escuro. */
export const PIE_SECONDARY = "#94a3b8";

/* Transformação de escala (raiz quadrada) aplicada às barras: comprime a
   altura de valores muito grandes em relação aos pequenos, evitando que
   um ou dois itens (ex.: uma filial com custo muito acima das demais)
   dominem visualmente o gráfico e apaguem as outras barras. Preserva a
   ordem e o zero — só a altura desenhada muda; rótulos e tooltips sempre
   mostram o valor real (ver chart.__realBarValues). */
function scaleTransform(v) {
  const n = Number(v) || 0;
  return Math.sign(n) * Math.sqrt(Math.abs(n));
}

const valueLabelsPlugin = {
  id: "valueLabels",
  afterDatasetsDraw(chart) {
    try {
      drawValueLabels(chart);
    } catch (err) {
      /* Nunca deixar um erro de desenho quebrar o app */
    }
  }
};

/* Registrado globalmente ANTES dos plugins de linha (média/tendência) para que
   essas linhas sejam desenhadas por cima dos rótulos de valor. O registro
   global vale para todos os gráficos — não repetir em `plugins: []` na
   criação de cada um. */
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
  /* Checa antes de `ctx.save()`: o retorno antecipado abaixo deixava o
     contexto salvo sem restaurar. */
  if (isPie && (!chart.getDatasetMeta(0) || !chart.data.datasets[0])) return;
  const rawFormatter = local.formatter !== undefined ? local.formatter : opts.formatter;
  const formatter = typeof rawFormatter === "function" ? rawFormatter : null;
  const label = (val) => (formatter ? formatter(val) : String(val));
  ctx.save();
  ctx.font = compact ? "700 9px Inter, sans-serif" : "700 12px Inter, sans-serif";
  ctx.textAlign = "center";

  if (isPie) {
    const meta = chart.getDatasetMeta(0);
    const ds = chart.data.datasets[0];
    meta.data.forEach((el, i) => {
      const val = ds.data[i];
      if (val == null) return;
      const prop = el.getProps(["x", "y", "startAngle", "endAngle", "innerRadius", "outerRadius"], true);
      const mid = (prop.startAngle + prop.endAngle) / 2;
      const r = (prop.outerRadius + prop.innerRadius) / 2;
      const x = prop.x + Math.cos(mid) * r;
      const y = prop.y + Math.sin(mid) * r;
      ctx.fillStyle = ds.backgroundColor[i] === PIE_SECONDARY ? "#1f2937" : "#ffffff";
      ctx.textBaseline = "middle";
      ctx.fillText(label(val), x, y);
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
        /* Barras com transformação de escala: o dataset guarda o valor
           transformado (altura desenhada), mas o rótulo sempre mostra o
           valor real. */
        const val = isBar && di === 0 && realBarValues ? realBarValues[i] : ds.data[i];
        if (val == null) return;
        /* Em gráficos compactos (mini sparklines) evita sobrepor rótulos,
           mas sempre desenha o último ponto. */
        if (compact && i !== total - 1 && el.x - lastX < 24) return;
        const offset = isBar ? 5 : compact ? 4 : 9;
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

/* Linha tracejada da média do período (usada p/ Tempo médio de contratação).
   updateLineChart define chart.__meanLine = { value, label }. */
const meanLinePlugin = {
  id: "meanLine",
  afterDatasetsDraw(chart) {
    try {
      drawMeanLine(chart);
    } catch (err) {
      /* Nunca deixar um erro de desenho quebrar o app */
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

/* Linha de tendência — média móvel de 2 períodos (MM2) sobre os pontos do
   gráfico de barras. updateBarChart define chart.__trendLine = [valores]. */
export const TREND_COLOR = "#3b82f6";
const trendLinePlugin = {
  id: "trendLine",
  afterDatasetsDraw(chart) {
    try {
      drawTrendLine(chart);
    } catch (err) {
      /* Nunca deixar um erro de desenho quebrar o app */
    }
  }
};

function drawTrendLine(chart) {
  const t = chart.__trendLine;
  if (!t || !Array.isArray(t.data) || !t.data.length) return;
  const meta = chart.getDatasetMeta(0);
  const yScale = chart.scales && chart.scales.y;
  if (!meta || !yScale) return;

  const { ctx } = chart;
  ctx.save();
  ctx.strokeStyle = TREND_COLOR;
  ctx.lineWidth = 2;
  ctx.setLineDash([]);
  ctx.beginPath();
  let started = false;
  const points = [];
  t.data.forEach((val, i) => {
    const el = meta.data[i];
    if (!el || val === null || val === undefined || isNaN(Number(val))) return;
    const x = el.x;
    const y = yScale.getPixelForValue(Number(val));
    points.push({ x, y });
    if (!started) {
      ctx.moveTo(x, y);
      started = true;
    } else {
      ctx.lineTo(x, y);
    }
  });
  if (started) ctx.stroke();

  ctx.fillStyle = TREND_COLOR;
  points.forEach((pt) => {
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 3, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
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
          hoverOffset: 8
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: "58%",
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
            /* Único uso atual (Turnover): cada fatia já é uma taxa (%), não
               uma contagem — formata com 1 casa decimal e o sufixo "%". */
            label: (context) => ` ${context.label}: ${formatPiePercent(context.raw)}`
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

/* data: [{ label, value }] */
export function updatePieChart(chart, data) {
  if (!chart || !data) return;
  chart.data.labels = data.map((d) => d.label);
  chart.data.datasets[0].data = data.map((d) => d.value);
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

/* Barras do Absenteísmo (Falta/Atestado/Acidente) */
export function createAbsenteismoBar(canvas) {
  const p = chartPalette();
  return new Chart(canvas, {
    type: "bar",
    data: { labels: [], datasets: [] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 24 } },
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
      scales: {
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
          ticks: { color: p.tick },
          beginAtZero: true,
          grace: "12%"
        }
      }
    }
  });
}

/* data: [{ label, value }] — uma barra por tipo de ocorrência */
export function updateAbsenteismoBar(chart, data) {
  if (!chart || !data) return;
  chart.data = {
    labels: data.map((d) => d.label),
    datasets: [
      {
        label: "Ocorrências",
        data: data.map((d) => d.value),
        backgroundColor: ABSENTEEISM_COLORS.slice(0, data.length),
        borderRadius: 6,
        barPercentage: 0.55
      }
    ]
  };
  chart.update();
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

  /* Tempo médio de contratação: destaca a média do período em dias. */
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

/* Linha sobre categorias (uma por item, ex.: uma vaga por ponto) — mesmo
   formato de dados do gráfico de barras (ver updateBarChart). */
export function createSeriesLineChart(canvas) {
  const chart = createLineChart(canvas);
  chart.options.interaction = { mode: "nearest", intersect: true };
  return chart;
}

/* rows: [{ label, value, tooltipValue? }]. options: { formatter } formata o
   eixo Y. Só a linha: valores e nomes aparecem no tooltip ao passar o mouse. */
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
      /* Sem nomes embaixo: a função aparece no tooltip ao passar o mouse. */
      ticks: { display: false }
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

export function createBarChart(canvas) {
  const p = chartPalette();
  return new Chart(canvas, {
    type: "bar",
    data: { labels: [], datasets: [] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 24 } },
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
      scales: {
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
      }
    }
  });
}

/* panorama: [{ label, value, tooltipValue, format? }] — `format` por item
   ("currency") controla o rótulo daquela barra.
   options: { trend?: boolean } — desenha (padrão) ou não a linha de tendência.
   A formatação global dos rótulos vem de chart.__valueLabels.formatter,
   definido pelo componente (ver BarChart.vue). */
export function updateBarChart(chart, panorama, options = {}) {
  if (!chart || !panorama) return;
  const labels = panorama.map((p) => p.label);
  const values = panorama.map((p) => (p.value === null ? 0 : p.value));
  const tooltips = panorama.map((p) =>
    p.tooltipValue != null ? p.tooltipValue : p.tooltip
  );
  chart.__valueFormats = panorama.map((p) => p.format || null);
  /* Valores reais (sem transformação) — usados pelos rótulos, tooltip de
     fallback e pelo clique na barra. */
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
    /* O título do tooltip já é o rótulo (nome do indicador/filial); aqui
       mostramos apenas o valor real (nunca o transformado). */
    label: (context) => String(tooltips[context.dataIndex] ?? values[context.dataIndex])
  };

  /* Linha de tendência — média móvel de 2 períodos (MM2), calculada sobre os
     valores reais e depois levada para a mesma escala transformada das
     barras (senão ficaria desalinhada visualmente). */
  const ma2 = values.map((v, i) => {
    const cur = Number(v) || 0;
    if (i === 0) return cur;
    return (Number(values[i - 1]) + cur) / 2;
  });
  chart.__trendLine =
    options.trend !== false && values.length
      ? { data: ma2.map(scaleTransform), label: "Tendência (MM2)" }
      : null;

  /* Gráficos de barras não usam a linha de média. */
  chart.__meanLine = null;

  chart.update();
}
