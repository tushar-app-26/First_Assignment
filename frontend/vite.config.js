import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/signup": "http://localhost:3000",
      "/login": "http://localhost:3000",
      "/verify-login-otp": "http://localhost:3000",
      "/profile": "http://localhost:3000",
    },
  },
});
