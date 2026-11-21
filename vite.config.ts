import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import type { IncomingMessage, ServerResponse } from "node:http";

// dev-only: serve api/chat.ts at /api/chat (server side; never bundled into the client)
function apiDev(mode: string): Plugin {
  return {
    name: "dito-api-dev",
    apply: "serve",
    configureServer(server) {
      const env = loadEnv(mode, process.cwd(), "");
      if (env.GROQ_API_KEY) process.env.GROQ_API_KEY = env.GROQ_API_KEY; // only these vars, no VITE_ prefix
      if (env.GROQ_MODEL) process.env.GROQ_MODEL = env.GROQ_MODEL;

      const mw = async (req: IncomingMessage, res: ServerResponse) => {
        try {
          const { handler } = await server.ssrLoadModule("/api/chat.ts");
          const chunks: Uint8Array[] = [];
          for await (const c of req) chunks.push(c);
          const headers = new Headers();
          for (const [k, v] of Object.entries(req.headers)) {
            if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(", ") : v);
          }
          const method = req.method ?? "GET";
          const hasBody = method !== "GET" && method !== "HEAD";
          const webReq = new Request(`http://${req.headers.host ?? "localhost"}/api/chat`, {
            method,
            headers,
            body: hasBody ? new Blob(chunks as BlobPart[]) : undefined,
          });
          const out: Response = await handler(webReq);
          res.statusCode = out.status;
          out.headers.forEach((v, k) => res.setHeader(k, v));
          if (!out.body) return void res.end();
          const reader = out.body.getReader();
          res.on("close", () => void reader.cancel().catch(() => {}));
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(value); // node flushes each write; no buffering
          }
          res.end();
        } catch (err) {
          console.error("api dev error", err instanceof Error ? err.message : err);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader("content-type", "application/json");
          }
          res.end(JSON.stringify({ error: "server_error" }));
        }
      };
      server.middlewares.use("/api/chat", mw);
    },
  };
}

export default defineConfig(({ mode }) => ({ plugins: [react(), apiDev(mode)] }));
