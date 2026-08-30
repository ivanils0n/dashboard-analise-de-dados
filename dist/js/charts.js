/* =========================================================
   Gráficos — Chart.js (linha, barras e pizza)
   As funções recebem as entradas já filtradas pela ui.
   Plugin "valueLabels": desenha os números nos gráficos
   quando options.plugins.valueLabels.display = true.
   ========================================================= */

function isDarkTheme() {
  return document.documentElement.getAttribute("data-theme") === "dark";
}

function chartPalette() {
  const dark = isDarkTheme();
  return {
    grid: dark ? "#2a2a30" : "#ececec",
    tick: dark ? "#9a9aa2" : "#6e6e73",
    text: dark ? "#f4f4f5" : "#111113",
    surface: dark ? "#18181b" : "#ffffff",
    slice: dark ? "#f4f4f5" : "#111113",
    tooltip: dark ? "#0f0f11" : "#111113"
  };
}

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
        ctx.fillStyle = ds.backgroundColor[i] === p.slice ? (isDarkTheme() ? "#111113" : "#ffffff") : "#991b1b";
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
          /* Sem espaço acima (ponto mais alto): desenha abaixo para não sair do canvas */
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

const Charts = {
  barChart: null,

  init() {
    const p = chartPalette();
    const barCanvas = document.getElementById("barChart");
    if (barCanvas) {
      this.barChart = new Chart(barCanvas, {
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
  },

  /* Recria os gráficos principais com as cores do tema atual */
  applyTheme() {
    if (this.barChart) { this.barChart.destroy(); this.barChart = null; }
    this.init();
  },

  /* Cria um mini gráfico de linha para ser exibido dentro do card do KPI */
  createMiniLineChart(canvas) {
    return new Chart(canvas, {
      type: "line",
      data: { labels: [], datasets: [{ data: [], borderColor: "#ef4444", borderWidth: 2, tension: 0.4, pointRadius: 0, fill: false }] },
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
  },

  updateMiniLineChart(chart, entries) {
    if (!chart) return;
    chart.data.labels = entries.map((e) => e.date);
    chart.data.datasets[0].data = entries.map((e) => e.value);
    chart.update();
  },

  createPieChart(canvas) {
    const p = chartPalette();
    return new Chart(canvas, {
      type: "doughnut",
      data: {
        labels: ["Entradas", "Saídas"],
        datasets: [
          {
            data: [0, 0],
            backgroundColor: ["#ef4444", p.slice],
            borderColor: p.surface,
            borderWidth: 3,
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
            labels: { color: p.tick, font: { size: 12 }, usePointStyle: true, padding: 16 }
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
  },

  /* data: [{ label, value }] */
  updatePieChart(chart, data) {
    if (!chart || !data) return;
    chart.data.labels = data.map((d) => d.label);
    chart.data.datasets[0].data = data.map((d) => d.value);
    chart.update();
  },

  setShowValues(chart, display) {
    if (!chart || !chart.options.plugins.valueLabels) return;
    chart.options.plugins.valueLabels.display = display;
    chart.update();
  },

  buildLineScales(indicator) {
    const p = chartPalette();
    const tickFormatter = indicator
      ? (value) => formatAxisValue(indicator, value)
      : (value) => value;
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
  },

  createLineChart(canvas) {
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
        scales: this.buildLineScales(null)
      }
    });
  },

  /* Gráfico de barras do Absenteísmo (Faltas/Atrasos/Afastamentos)
     ocupa o mesmo canvas da Evolução quando esse indicador é selecionado */
  createAbsenteismoBar(canvas) {
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
  },

  /* data: [{ label, value }] — uma barra por tipo de ocorrência */
  updateAbsenteismoBar(chart, data) {
    if (!chart || !data) return;
    chart.data = {
      labels: data.map((d) => d.label),
      datasets: [
        {
          label: "Ocorrências",
          data: data.map((d) => d.value),
          backgroundColor: ["#ef4444", "#f59e0b", "#94a3b8"].slice(0, data.length),
          borderRadius: 6,
          barPercentage: 0.55
        }
      ]
    };
    chart.update();
  },

  updateLineChart(chart, indicator, entries) {
    if (!chart) return;
    chart.options.scales = this.buildLineScales(indicator);

    if (!entries || !entries.length) {
      chart.data = { labels: [], datasets: [] };
      chart.update();
      return;
    }

    const labels = entries.map((e) => formatShortDate(e.date));
    const values = entries.map((e) => e.value);
    const p = chartPalette();

    /* Preenchimento em degradê (gráfico de área) */
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
          borderColor: "#ef4444",
          backgroundColor: gradient,
          fill: true,
          tension: 0.35,
          borderWidth: 2.5,
          pointBackgroundColor: "#ef4444",
          pointBorderColor: p.surface,
          pointBorderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6
        }
      ]
    };
    chart.update();
  },

  /* panorama: [{ label, value, tooltip }] - backward compatible */
  updateBarChart(chartOrPanorama, panoramaOrUndefined) {
    const isChartInstance = chartOrPanorama && typeof chartOrPanorama.update === "function";
    const chart = isChartInstance ? chartOrPanorama : this.barChart;
    const panorama = isChartInstance ? panoramaOrUndefined : chartOrPanorama;
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
          backgroundColor: chartPalette().slice,
          hoverBackgroundColor: "#ef4444",
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
};