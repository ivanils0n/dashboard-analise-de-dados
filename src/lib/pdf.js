import { nextTick } from "vue";
import { pdfExpand } from "@/composables/usePdfMode";

const SCALE_MAX = 2;
const SCALE_MIN = 0.75;
// Não aumentar: navegadores como Firefox e Safari falham em canvas acima de ~32 mil px de altura.
const MAX_CANVAS_PX = 30000;
// Não aumentar: o PDF limita a página a 14400 unidades, acima disso o arquivo não abre.
const MAX_PAGE_PX = 7000;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function slug(text) {
  return String(text || "dashboard")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function liberarAltura(doc, selector) {
  const panel = doc.querySelector(selector);
  if (!panel) return;
  for (let node = panel; node && node !== doc.body; node = node.parentElement) {
    node.style.height = "auto";
    node.style.maxHeight = "none";
    node.style.overflow = "visible";
  }
  const scroller = panel.querySelector("[data-pdf-scroll]");
  if (scroller) {
    scroller.style.height = "auto";
    scroller.style.maxHeight = "none";
    scroller.style.overflow = "visible";
    scroller.style.flex = "none";
  }
}

function expandirRolagens(panel) {
  const alterados = [];
  panel.querySelectorAll("*").forEach((el) => {
    if (el.hasAttribute("data-pdf-scroll") || el.tagName === "CANVAS") return;
    const cs = getComputedStyle(el);
    const rolaY = cs.overflowY === "auto" || cs.overflowY === "scroll";
    if (!rolaY || el.scrollHeight <= el.clientHeight + 1) return;
    alterados.push({ el, height: el.style.height, maxHeight: el.style.maxHeight });
    el.style.height = "auto";
    el.style.maxHeight = "none";
  });
  return () =>
    alterados.forEach(({ el, height, maxHeight }) => {
      el.style.height = height;
      el.style.maxHeight = maxHeight;
    });
}

async function capturar(html2canvas, panel) {
  const marker = `pdf-${Date.now()}`;
  const bg = getComputedStyle(panel).backgroundColor;
  const scroller = panel.querySelector("[data-pdf-scroll]");
  const fullHeight = scroller ? panel.clientHeight - scroller.clientHeight + scroller.scrollHeight : panel.scrollHeight;
  const scale = Math.max(SCALE_MIN, Math.min(SCALE_MAX, MAX_CANVAS_PX / fullHeight));

  panel.setAttribute("data-pdf-target", marker);
  try {
    const canvas = await html2canvas(panel, {
      scale,
      backgroundColor: bg,
      useCORS: true,
      logging: false,
      width: panel.clientWidth,
      height: fullHeight,
      windowWidth: panel.clientWidth,
      windowHeight: fullHeight,
      onclone: (doc) => {
        const style = doc.createElement("style");
        style.textContent = "*{animation:none !important;transition:none !important}.fade-in,.mac-panel{opacity:1 !important;transform:none !important}";
        doc.head.appendChild(style);
        liberarAltura(doc, `[data-pdf-target="${marker}"]`);
        doc.querySelectorAll("[data-pdf-hide]").forEach((el) => (el.style.display = "none"));
      }
    });
    return { canvas, scale, bg };
  } finally {
    panel.removeAttribute("data-pdf-target");
  }
}

function montarPdf(jsPDF, { canvas, scale, bg }, { title, subtitle, fileName }) {
  const widthPx = canvas.width / scale;
  const heightPx = canvas.height / scale;
  const pageH = Math.min(heightPx, MAX_PAGE_PX);
  const orientation = widthPx > pageH ? "landscape" : "portrait";
  const pdf = new jsPDF({ unit: "px", format: [widthPx, pageH], orientation, hotfixes: ["px_scaling"] });
  pdf.setProperties({ title: [title, subtitle].filter(Boolean).join(" - ") });

  const sliceH = pageH * scale;
  for (let y = 0, page = 0; y < canvas.height; y += sliceH, page++) {
    const h = Math.min(sliceH, canvas.height - y);
    const part = document.createElement("canvas");
    part.width = canvas.width;
    part.height = h;
    const ctx = part.getContext("2d");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, part.width, part.height);
    ctx.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
    if (page > 0) pdf.addPage([widthPx, pageH], orientation);
    pdf.addImage(part.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, widthPx, h / scale);
  }

  pdf.save(`${fileName || slug(title)}.pdf`);
}

export async function exportElementToPdf(panel, opcoes) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas-pro"), import("jspdf")]);

  let restaurar = () => {};
  try {
    // Gráficos virtualizados precisam redesenhar todas as linhas antes de capturar.
    pdfExpand.value = true;
    await nextTick();
    await wait(900);
    restaurar = expandirRolagens(panel);
    await nextTick();
    await wait(150);
    montarPdf(jsPDF, await capturar(html2canvas, panel), opcoes);
  } finally {
    restaurar();
    pdfExpand.value = false;
  }
}

