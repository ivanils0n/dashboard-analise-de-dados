import { defineConfig, loadEnv } from "vite";

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

  return {
    // Caminhos relativos: funciona em raiz (Cloudflare) ou subpasta (GitHub Pages)
    base: "./",
    build: {
      outDir: "dist"
    },
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(url),
      "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify(key),
      "import.meta.env.SUPABASE_URL": JSON.stringify(url),
      "import.meta.env.SUPABASE_ANON_KEY": JSON.stringify(key)
    }
  };
});
