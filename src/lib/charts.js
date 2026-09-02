/* =========================================================
   Gráficos — Chart.js (linha, barras e pizza)
   As funções recebem as entradas já filtradas pela ui.
   Plugin "valueLabels": desenha os números nos gráficos
   quando options.plugins.valueLabels.display = true.
   ========================================================= */

import { Chart, registerables } from "chart.js";
import { formatAxisValue, formatShortDate } from "./utils";

Chart.register(...registerables);

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

export const ACCENT = "#ef4444";
export const ACCENT_HOVER = "#dc2626";
export const ABSENTEEISM_COLORS = ["#ef4444", "#f59e0b", "#94a3b8"];
/* Cor neutra da segunda fatia da pizza — legível em temas claro e escuro. */
export const PIE_SECONDARY = "#94a3b8";

const valueLabelsPlugin = {
  id: "valueLabels",
  afterDatasetsDraw(chart) {
    const opts = chart.options.plugins && chart.options.plugins.valueLabels;
    if (!opts || !opts.display) return;

    const { ctx } = chart;
    const p = chartPalette();
    ctx.save();
    ctx.font = "700 12px Inter, sans-serif";
    ctx.textAlign = "center";

    if (chart.config.type === "doughnut" || chart.config.type === "pie") {
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
        /* Cor de legenda por contraste com a fatia (vermelho -> branco,
           fatia neutra -> texto escuro). */
        ctx.fillStyle = ds.backgroundColor[i] === PIE_SECONDARY ? "#1f2937" : "#ffffff";
        ctx.textBaseline = "middle";
        ctx.fillText(String(val), x, y);
      });
    } else {
      ctx.fillStyle = p.text;
      const isBar = chart.config.type === "bar";
      chart.data.datasets.forEach((ds, di) => {
        const meta = chart.getDatasetMeta(di);
        meta.data.forEach((el, i) => {
          const val = ds.data[i];
          if (val == null) return;
          const offset = isBar ? 5 : 9;
          let y = el.y - offset;
          ctx.textBaseline = "bottom";
          if (y - 13 < 0) {
            ctx.textBaseline = "top";
            y = el.y + offset;
          }
          ctx.fillText(String(val), el.x, y);
        });
      });
    }
    ctx.restore();
  }
};

export function createMiniLineChart(canvas) {
  return new Chart(canvas, {
    type: "line",
    data: { labels: [], datasets: [{ data: [], borderColor: ACCENT, borderWidth: 2, tension: 0.4, pointRadius: 0, fill: false }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
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
    plugins: [valueLabelsPlugin],
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
            label: (context) => ` ${context.label}: ${context.raw}`
          }
        }
      }
    }
  });
}

/* data: [{ label, value }] */
export function updatePieChart(chart, data) {
  if (!chart || !data) return;
  chart.data.labels = data.map((d) => d.label);
  chart.data.datasets[0].data = data.map((d) => d.value);
  chart.update();
}

export function setShowValues(chart, display) {
  if (!chart || !chart.options.plugins.valueLabels) return;
  chart.options.plugins.valueLabels.display = display;
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
    plugins: [valueLabelsPlugin],
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

/* Barras do Absenteísmo (Faltas/Atrasos/Afastamentos) */
export function createAbsenteismoBar(canvas) {
  const p = chartPalette();
  return new Chart(canvas, {
    type: "bar",
    data: { labels: [], datasets: [] },
    plugins: [valueLabelsPlugin],
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
          ticks: { color: p.tick, font: { size: 11 } }
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

  if (!entries || !entries.length) {
    chart.data = { labels: [], datasets: [] };
    chart.update();
    return;
  }

  const labels = entries.map((e) => formatShortDate(e.date));
  const values = entries.map((e) => e.value);
  const p = chartPalette();

  const ctx = chart.ctx;
  const area = chart.chartArea || {};
  const top = area.top !== undefined ? area.top : 0;
  const bottom = area.bottom !== undefined ? area.bottom : chart.height || 100;
  const gradient = ctx.createLinearGradient(0, top, 0, bottom);
  gradient.addColorStop(0, "rgba(239, 68, 68, 0.38)");
  gradient.addColorStop(0.55, "rgba(239, 68, 68, 0.14)");
  gradient.addColorStop(1, "rgba(239, 68, 68, 0.02)");

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

export function createBarChart(canvas) {
  const p = chartPalette();
  return new Chart(canvas, {
    type: "bar",
    data: { labels: [], datasets: [] },
    plugins: [valueLabelsPlugin],
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
          ticks: { color: p.tick, font: { size: 11 } }
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

/* panorama: [{ label, value, tooltip }] */
export function updateBarChart(chart, panorama) {
  if (!chart || !panorama) return;
  const labels = panorama.map((p) => p.label);
  const values = panorama.map((p) => (p.value === null ? 0 : p.value));
  const tooltips = panorama.map((p) => p.tooltip);

  chart.data = {
    labels,
    datasets: [
      {
        label: "Último valor",
        data: values,
        backgroundColor: ACCENT,
        hoverBackgroundColor: ACCENT_HOVER,
        borderRadius: 6,
        barPercentage: 0.65
      }
    ]
  };

  chart.options.plugins.tooltip.callbacks = {
    label: (context) => tooltips[context.dataIndex] || context.raw
  };
  chart.update();
}
