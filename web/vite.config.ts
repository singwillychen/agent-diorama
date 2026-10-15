import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@themes": path.resolve(__dirname, "../themes") } },
  server: { port: 5173, fs: { allow: [".."] } },
});
