const LONG_PRESS_MS = 550;
const MOVE_TOLERANCE_PX = 10;

function isIOS() {
  const ua = navigator.userAgent || "";
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function installLongPressContextMenu() {
  if (typeof window === "undefined" || !isIOS()) return;

  let timer = null;
  let start = null;
  let firedAt = 0;

  const cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  document.addEventListener(
    "touchstart",
    (e) => {
      cancel();
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      const target = e.target;
      start = { x: t.clientX, y: t.clientY };
      timer = setTimeout(() => {
        timer = null;
        firedAt = Date.now();
        target.dispatchEvent(
          new MouseEvent("contextmenu", {
            bubbles: true,
            cancelable: true,
            view: window,
            button: 2,
            buttons: 2,
            clientX: t.clientX,
            clientY: t.clientY,
            screenX: t.screenX,
            screenY: t.screenY
          })
        );
      }, LONG_PRESS_MS);
    },
    { passive: true }
  );

  document.addEventListener(
    "touchmove",
    (e) => {
      if (!timer || !start) return;
      const t = e.touches[0];
      if (Math.abs(t.clientX - start.x) > MOVE_TOLERANCE_PX || Math.abs(t.clientY - start.y) > MOVE_TOLERANCE_PX) cancel();
    },
    { passive: true }
  );

  const recentlyFired = () => Date.now() - firedAt < 800;

  document.addEventListener(
    "touchend",
    (e) => {
      cancel();
      if (recentlyFired() && e.cancelable) e.preventDefault();
    },
    { passive: false }
  );
  document.addEventListener("touchcancel", cancel, { passive: true });
  document.addEventListener(
    "click",
    (e) => {
      if (!recentlyFired()) return;
      firedAt = 0;
      e.preventDefault();
      e.stopPropagation();
    },
    true
  );
}

export const CONTEXT_ACTION_LABEL =
  typeof window !== "undefined" && window.matchMedia && window.matchMedia("(pointer: coarse)").matches
    ? "Toque e segure"
    : "Botão direito";
