/* =========================================================
   Página de Login — submissão do formulário
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {
  Auth.redirectIfAuthenticated();

  const form = document.getElementById("loginForm");
  const userEl = document.getElementById("loginUser");
  const passEl = document.getElementById("loginPassword");
  const errorEl = document.getElementById("loginError");
  const submitBtn = document.getElementById("loginSubmit");
  const submitText = document.getElementById("loginSubmitText");

  function showError(message) {
    errorEl.textContent = message;
    errorEl.hidden = false;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.hidden = true;

    const usuario = userEl.value.trim();
    const password = passEl.value;
    if (!usuario || !password) {
      showError("Informe usuário e senha.");
      return;
    }

    submitBtn.disabled = true;
    submitText.textContent = "Entrando...";

    const { error } = await Auth.login(usuario, password);

    if (error) {
      submitBtn.disabled = false;
      submitText.textContent = "Entrar";
      const friendly =
        error.message === "Invalid login credentials"
          ? "Usuário ou senha inválidos."
          : error.message;
      showError(friendly);
      if (typeof Auth !== "undefined" && Auth.notify) {
        Auth.notify(friendly);
      }
      return;
    }

    location.replace("../dashboard/");
  });
});
