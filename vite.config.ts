import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "node:fs";
import { componentTagger } from "lovable-tagger";

function localDbPlugin(): Plugin {
  const file = path.resolve(__dirname, "data/db.json");
  return {
    name: "local-json-db",
    configureServer(server) {
      server.middlewares.use("/api/local-db", (req, res, next) => {
        if (req.method === "GET") {
          if (!fs.existsSync(file)) {
            res.statusCode = 404;
            res.end();
            return;
          }
          res.setHeader("Content-Type", "application/json");
          fs.createReadStream(file).pipe(res);
          return;
        }
        if (req.method === "PUT") {
          const chunks: Buffer[] = [];
          req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
          req.on("end", () => {
            try {
              const text = Buffer.concat(chunks).toString("utf8");
              JSON.parse(text);
              fs.mkdirSync(path.dirname(file), { recursive: true });
              fs.writeFileSync(file, text.endsWith("\n") ? text : `${text}\n`);
              res.statusCode = 204;
              res.end();
            } catch {
              res.statusCode = 400;
              res.end("Invalid JSON");
            }
          });
          return;
        }
        next();
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [localDbPlugin(), react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "@tanstack/react-query"],
  },
  optimizeDeps: {
    include: ["react", "react-dom", "@tanstack/react-query"],
  },
}));
