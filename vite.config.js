import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";

export default defineConfig(() => {
  const root = process.cwd();
  const isProd = process.env.NODE_ENV === "production";

  return {
    // Caminhos relativos: funciona em raiz (Cloudflare) ou subpasta (GitHub Pages)
    base: "./",
    plugins: [vue(), tailwindcss()],
    resolve: {
      alias: {
        "@": resolve(root, "src")
      }
    },
    // Expõe as variáveis VITE_* em import.meta.env (ex.: VITE_API_BASE).
    envPrefix: ["VITE_"],
    // Hardening de produção: o runtime do Vue 3 é compilado sem suporte a
    // DevTools (desliga __VUE_PROD_DEVTOOLS__ explicitamente).
    define: {
      __VUE_PROD_DEVTOOLS__: false
    },
    // Remoção automática de console.* e debugger SOMENTE no build de produção
    // (o dev continua com logs). Evita que mensagens com PII cheguem ao bundle.
    esbuild: {
      drop: isProd ? ["console", "debugger"] : []
    },
    // Pré-otimiza no início do dev as libs usadas por rotas lazy (DashboardView),
    // evitando re-otimização em tempo de navegação ("Outdated Optimize Dep").
    optimizeDeps: {
      include: ["xlsx", "chart.js"]
    },
    build: {
      outDir: "dist",
      // Sem source maps em produção: o código-fonte (que trata PII) não é
      // exposto publicamente via dist/*.js.map.
      sourcemap: false,
      minify: "esbuild",
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
