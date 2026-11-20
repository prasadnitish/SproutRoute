import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_WEBMCP_');
  const token = env.VITE_WEBMCP_ORIGIN_TRIAL_TOKEN;
  return {
    plugins: [
      react(),
      {
        name: 'webmcp-origin-trial',
        transformIndexHtml() {
          if (env.VITE_WEBMCP_ENABLED !== 'true' || !token) return [];
          return [{ tag: 'meta', attrs: { 'http-equiv': 'origin-trial', content: token }, injectTo: 'head-prepend' }];
        },
      },
    ],
    server: {
      port: 5173,
      proxy: {
        "/api": {
          target: "http://localhost:3000",
          changeOrigin: true,
        },
      },
    },
  };
});
