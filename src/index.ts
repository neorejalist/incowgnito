import express from "express";
import session from "express-session";
import path from "path";
import fs from "fs";
import { config } from "./config";
import { migrate } from "./db/migrate";
import authRouter from "./routes/auth";
import aliasesRouter from "./routes/aliases";
import accountRouter from "./routes/account";

interface Branding {
  serviceName: string;
  domain: string;
  owner: string;
}

const ASSETS_DEFAULT_PATH = path.join(__dirname, "../public/assets/default");
const BRANDING_FILENAME = "branding.json";

function loadBranding(): Branding {
  const overridePath = path.join(config.app.assetsPath, BRANDING_FILENAME);
  const defaultPath = path.join(ASSETS_DEFAULT_PATH, BRANDING_FILENAME);
  const brandingPath = fs.existsSync(overridePath) ? overridePath : defaultPath;
  return JSON.parse(fs.readFileSync(brandingPath, "utf-8"));
}

const start = async () => {
  console.log("[startup] Loading config...");
  console.log(`[startup] Mailcow host: ${config.mailcow.host}`);
  console.log(`[startup] DB host: ${config.db.host}:${config.db.port}/${config.db.name}`);
  console.log(`[startup] DB user: ${config.db.user}`);
  console.log(`[startup] Relay domain: ${config.relay.domain}`);
  console.log(`[startup] App URL: ${config.app.url}`);

  console.log("[startup] Connecting to database...");
  await migrate();

  console.log("[startup] Configuring HTTP server...");
  const app = express();

  app.set("trust proxy", 1);
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  app.use(
    session({
      secret: config.app.sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: config.app.isProduction,
        httpOnly: true,
        maxAge: 7 * 24 * 60 * 60 * 1000,
      },
    })
  );

  // Asset fallback: user overrides take priority over defaults
  app.use("/assets", express.static(config.app.assetsPath));
  app.use("/assets", express.static(ASSETS_DEFAULT_PATH));

  const branding = loadBranding();
  app.get("/api/branding", (_req, res) => res.json(branding));

  app.use(express.static(path.join(__dirname, "../public")));

  app.get("/dashboard", (req, res) => {
    if (!req.session.userId) return res.redirect("/");
    res.sendFile(path.join(__dirname, "../public/dashboard.html"));
  });

  app.get("/session-info", (req, res) => {
    if (!req.session.userId) return res.json({ loggedIn: false });
    res.json({ loggedIn: true, email: req.session.userEmail });
  });

  app.use("/auth", authRouter);
  app.use("/api/v1/aliases", aliasesRouter);
  app.use("/api/v1", accountRouter);

  app.use((_req, res) => res.status(404).json({ message: "Not found" }));

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("Unhandled error:", err);
    res.status(500).json({ message: "Internal server error" });
  });

  console.log("[startup] Starting HTTP server...");
  app.listen(config.app.port, () => {
    console.log(`[startup] Incowgnito running on port ${config.app.port}`);
  });
};

start().catch((err) => {
  console.error("[startup] Failed to start:", err);
  process.exit(1);
});
