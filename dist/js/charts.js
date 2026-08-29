/* =========================================================
   Gráficos — Chart.js (linha, barras e pizza)
   As funções recebem as entradas já filtradas pela ui.
   Plugin "valueLabels": desenha os números nos gráficos
   quando options.plugins.valueLabels.display = true.
   ========================================================= */

const valueLabelsPlugin = {
  id: "valueLabels",
  afterDatasetsDraw(chart) {
    const opts = chart.options.plugins && chart.options.plugins.valueLabels;
    if (!opts || !opts.display) return;

    const { ctx } = chart;
    ctx.save();
    ctx.font = "700 12px Inter, sans-serif";
    ctx.textAlign = "center";

    if (chart.config.type === "doughnut" || chart.config.type === "pie") {
      const meta = chart.getDatasetMeta(0);
      const ds = chart.data.datasets[0];
      meta.data.forEach((el, i) => {
        const val = ds.data[i];
        if (val == null) return;
        const p = el.getProps(["x", "y", "startAngle", "endAngle", "innerRadius", "outerRadius"], true);
        const mid = (p.startAngle + p.endAngle) / 2;
        const r = (p.outerRadius + p.innerRadius) / 2;
        const x = p.x + Math.cos(mid) * r;
        const y = p.y + Math.sin(mid) * r;
        ctx.fillStyle = ds.backgroundColor[i] === "#111113" ? "#ffffff" : "#991b1b";
        ctx.textBaseline = "middle";
        ctx.fillText(String(val), x, y);
      });
    } else {
      ctx.fillStyle = "#111113";
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
  lineChart: null,
  barChart: null,
  turnoverPieChart: null,
  absBarChart: null,

  init() {
    const lineCanvas = document.getElementById("lineChart");
    if (lineCanvas) {
      this.lineChart = new Chart(lineCanvas, {
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
              backgroundColor: "#111113",
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
    }

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
              backgroundColor: "#111113",
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
              ticks: { color: "#6e6e73", font: { size: 11 } }
            },
            y: {
              grid: { color: "#ececec" },
              border: { display: false },
              ticks: { display: false },
              beginAtZero: true,
              grace: "12%"
            }
          }
        }
      });
    }

    const pieCanvas = document.getElementById("turnoverPieChart");
    if (pieCanvas) {
      this.turnoverPieChart = new Chart(pieCanvas, {
        type: "doughnut",
        data: {
          labels: ["Entradas", "Saídas"],
          datasets: [
            {
              data: [0, 0],
              backgroundColor: ["#ef4444", "#111113"],
              borderColor: "#ffffff",
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
              labels: { color: "#6e6e73", font: { size: 12 }, usePointStyle: true, padding: 16 }
            },
            tooltip: {
              backgroundColor: "#111113",
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
    return new Chart(canvas, {
      type: "doughnut",
      data: {
        labels: ["Entradas", "Saídas"],
        datasets: [
          {
            data: [0, 0],
            backgroundColor: ["#ef4444", "#111113"],
            borderColor: "#ffffff",
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
            labels: { color: "#6e6e73", font: { size: 12 }, usePointStyle: true, padding: 16 }
          },
          tooltip: {
            backgroundColor: "#111113",
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

  /* data: [{ label, value }] */
  updateTurnoverPie(data) {
    if (!this.turnoverPieChart || !data) return;
    this.turnoverPieChart.data.labels = data.map((d) => d.label);
    this.turnoverPieChart.data.datasets[0].data = data.map((d) => d.value);
    this.turnoverPieChart.update();
  },

  buildLineScales(indicator) {
    const tickFormatter = indicator
      ? (value) => formatAxisValue(indicator, value)
      : (value) => value;
    return {
      x: {
        grid: { display: false },
        ticks: { color: "#6e6e73", maxRotation: 45, font: { size: 11 } }
      },
      y: {
        grid: { color: "#ececec" },
        border: { display: false },
        ticks: { color: "#6e6e73", callback: tickFormatter },
        grace: "12%"
      }
    };
  },

  createLineChart(canvas) {
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
            backgroundColor: "#111113",
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
            backgroundColor: "#111113",
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
            ticks: { color: "#6e6e73", font: { size: 11 } }
          },
          y: {
            grid: { color: "#ececec" },
            border: { display: false },
            ticks: { color: "#6e6e73" },
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

  /* Destrói o gráfico principal ativo (linha ou barras de absenteísmo) */
  destroyMainChart() {
    if (this.lineChart) {
      this.lineChart.destroy();
      this.lineChart = null;
    }
    if (this.absBarChart) {
      this.absBarChart.destroy();
      this.absBarChart = null;
    }
  },

  updateLineChart(chartOrIndicator, indicatorOrEntries, entriesOrUndefined) {
    const isChartInstance = chartOrIndicator && typeof chartOrIndicator.update === "function";
    const chart = isChartInstance ? chartOrIndicator : this.lineChart;
    const indicator = isChartInstance ? indicatorOrEntries : chartOrIndicator;
    const entries = isChartInstance ? entriesOrUndefined : indicatorOrEntries;

    if (!chart) return;
    chart.options.scales = this.buildLineScales(indicator);

    if (!entries || !entries.length) {
      chart.data = { labels: [], datasets: [] };
      chart.update();
      return;
    }

    const labels = entries.map((e) => formatShortDate(e.date));
    const values = entries.map((e) => e.value);

    chart.data = {
      labels,
      datasets: [
        {
          label: indicator.name,
          data: values,
          borderColor: "#ef4444",
          backgroundColor: "rgba(239, 68, 68, 0.12)",
          fill: true,
          tension: 0.35,
          borderWidth: 2.5,
          pointBackgroundColor: "#ef4444",
          pointBorderColor: "#ffffff",
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
          backgroundColor: "#111113",
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