import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";

export default defineConfig(() => {
  const root = process.cwd();
  const isProd = process.env.NODE_ENV === "production";

  return {
    base: "./",
    plugins: [vue(), tailwindcss()],
    resolve: {
      alias: {
        "@": resolve(root, "src")
      }
    },
    envPrefix: ["VITE_"],
    define: {
      __VUE_PROD_DEVTOOLS__: false
    },
    esbuild: {
      drop: isProd ? ["console", "debugger"] : []
    },
    optimizeDeps: {
      include: ["xlsx", "chart.js"]
    },
    build: {
      outDir: "dist",
      sourcemap: false,
      minify: "esbuild",
      rollupOptions: {
        input: {
          app: resolve(root, "index.html")
        },
        output: {
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
