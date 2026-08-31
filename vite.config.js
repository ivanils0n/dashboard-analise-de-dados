import { defineConfig, loadEnv } from "vite";
import { resolve } from "path";

export default defineConfig(({ mode }) => {
  // Lê TODAS as variáveis do .env (com ou sem prefixo VITE_)
  // e combina com as variáveis de ambiente do provedor de deploy
  // (Cloudflare Pages / GitHub Actions injetam os secrets aqui).
  const fileEnv = loadEnv(mode, process.cwd(), "");
  const url =
    fileEnv.VITE_SUPABASE_URL ||
    fileEnv.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    "";
  const key =
    fileEnv.VITE_SUPABASE_ANON_KEY ||
    fileEnv.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    "";

  const root = process.cwd();

  return {
    // Caminhos relativos: funciona em raiz (Cloudflare) ou subpasta (GitHub Pages)
    base: "./",
    build: {
      outDir: "dist",
      // Multi-page: cada página vira uma rota própria
      //   /           -> index.html (redireciona para /dashboard/)
      //   /login/     -> login/index.html (autenticação)
      //   /dashboard/ -> dashboard/index.html
      //   /equipe/    -> equipe/index.html
      //   /filiais/   -> filiais/index.html
      //   /usuarios/  -> usuarios/index.html (somente admin)
      rollupOptions: {
        input: {
          root: resolve(root, "index.html"),
          login: resolve(root, "login/index.html"),
          dashboard: resolve(root, "dashboard/index.html"),
          equipe: resolve(root, "equipe/index.html"),
          filiais: resolve(root, "filiais/index.html"),
          departamentos: resolve(root, "departamentos/index.html"),
          usuarios: resolve(root, "usuarios/index.html")
        }
      }
    },
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(url),
      "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify(key),
      "import.meta.env.SUPABASE_URL": JSON.stringify(url),
      "import.meta.env.SUPABASE_ANON_KEY": JSON.stringify(key)
    }
  };
});
