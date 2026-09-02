import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";

export default defineConfig(() => {
  const root = process.cwd();

  return {
    // Caminhos relativos: funciona em raiz (Cloudflare) ou subpasta (GitHub Pages)
    base: "./",
    plugins: [vue(), tailwindcss()],
    resolve: {
      alias: {
        "@": resolve(root, "src")
      }
    },
    // Expõe SUPABASE_URL / SUPABASE_ANON_KEY (e as variantes VITE_*) em
    // import.meta.env — tanto no .env local quanto nos secrets do deploy.
    envPrefix: ["VITE_", "SUPABASE_"],
    // Pré-otimiza no início do dev as libs usadas por rotas lazy (DashboardView),
    // evitando re-otimização em tempo de navegação ("Outdated Optimize Dep").
    optimizeDeps: {
      include: ["xlsx", "chart.js"]
    },
    build: {
      outDir: "dist",
      // SPA única: o roteamento é feito em runtime pelo vue-router
      // (hash history — funciona em hospedagem estática sem rewrite).
      rollupOptions: {
        input: {
          app: resolve(root, "index.html")
        },
        output: {
          // Separa as bibliotecas pesadas em chunks com cache estável
          manualChunks(id) {
            if (!id.includes("node_modules")) return;
            if (id.includes("chart.js")) return "charts";
            if (id.includes("xlsx")) return "xlsx";
            if (id.includes("vue-router")) return "vue-router";
            if (id.includes("vue")) return "vue";
          }
        }
      }
    }
  };
});
