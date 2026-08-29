/* =========================================================
   Dialog — modais de confirmação no lugar dos nativos
   ---------------------------------------------------------
   Dialog.confirm({ title, message, confirmText, cancelText, danger })
     -> Promise<boolean>

   As promessas permitem substituir `confirm(...)` síncrono
   por `await Dialog.confirm(...)` sem alterar o fluxo.
   ========================================================= */

const Dialog = {
  els: {},
  _resolve: null,

  init() {
    this.els = {
      overlay: document.getElementById("dialogOverlay"),
      icon: document.getElementById("dialogIcon"),
      title: document.getElementById("dialogTitle"),
      message: document.getElementById("dialogMessage"),
      okBtn: document.getElementById("dialogConfirm"),
      cancelBtn: document.getElementById("dialogCancel")
    };
    if (!this.els.overlay) return;

    this.els.okBtn.addEventListener("click", () => this._close(true));
    this.els.cancelBtn.addEventListener("click", () => this._close(false));
    this.els.overlay.addEventListener("click", (e) => {
      if (e.target === this.els.overlay) this._close(false);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !this.els.overlay.hidden) {
        e.stopImmediatePropagation(); // não deixa o handler do ui fechar modais de fundo
        this._close(false);
      }
    });
  },

  confirm({ title = "Confirmar ação", message = "", confirmText = "Confirmar", cancelText = "Cancelar", danger = false } = {}) {
    return new Promise((resolve) => {
      this._open({ title, message, okText: confirmText, cancelText, danger }, resolve);
    });
  },

  /* ---------- Internos ---------- */

  _open({ title, message, okText, cancelText, danger = false }, resolve) {
    if (!this.els.overlay) return;
    this._resolve = resolve;

    this.els.icon.classList.toggle("is-danger", !!danger);
    this.els.title.textContent = title;
    this.els.message.textContent = message;
    this.els.message.hidden = !message;

    this.els.okBtn.textContent = okText;
    this.els.okBtn.classList.toggle("btn-danger", !!danger);
    this.els.okBtn.classList.toggle("btn-primary", !danger);

    this.els.cancelBtn.textContent = cancelText || "Cancelar";
    this.els.cancelBtn.hidden = false;

    this.els.overlay.hidden = false;
    this.els.okBtn.focus();
  },

  _close(result) {
    if (this.els.overlay.hidden) return;
    this.els.overlay.hidden = true;
    const resolve = this._resolve;
    this._resolve = null;
    if (resolve) resolve(result);
  }
};
