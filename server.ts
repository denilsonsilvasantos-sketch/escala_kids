import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import {
  handleCloudStateGet,
  handleCloudStatePut,
  handleExtractVolunteers,
  handleParseSchedule,
} from "./lib/apiHandlers.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "25mb" }));

  app.get("/favicon.ico", (_req, res) => {
    return res.status(204).end();
  });

  app.post("/api/parse-schedule", async (req, res) => {
    const result = await handleParseSchedule(req.body);
    return res.status(result.status).json(result.body);
  });

  app.post("/api/extract-volunteers", async (req, res) => {
    const result = await handleExtractVolunteers(req.body);
    return res.status(result.status).json(result.body);
  });

  app.get("/api/cloud/state", async (_req, res) => {
    const result = await handleCloudStateGet();
    return res.status(result.status).json(result.body);
  });

  app.put("/api/cloud/state", async (req, res) => {
    const result = await handleCloudStatePut(req.body);
    return res.status(result.status).json(result.body);
  });

  app.use("/api", (_req, res) => {
    return res.status(404).json({ error: "Rota de API não encontrada." });
  });

  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Escala Kids rodando em http://0.0.0.0:${PORT}`);
  });
}

startServer();
