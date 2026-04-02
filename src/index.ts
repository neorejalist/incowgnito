import express from "express";
import helmet from "helmet";
import session from "express-session";
import path from "path";
import fs from "fs";
import { config } from "./config";
import { migrate } from "./db/migrate";
import authRouter from "./routes/auth";
import aliasesRouter from "./routes/aliases";
import accountRouter from "./routes/account";
import { loginPage } from "./templates/login";
import { dashboardPage } from "./templates/dashboard";
import { aliasList } from "./templates/aliases";
import { keyList } from "./templates/keys";
import { toAliasResponse } from "./utils/format";
import * as apiKeys from "./db/api-keys";
import * as aliasSvc from "./services/aliases";

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

export function createApp() {
  const app = express();

  app.set("trust proxy", 1);
  app.use(helmet());
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

  // Serve static JS (htmx, toast)
  app.use("/js", express.static(path.join(__dirname, "../public/js")));

  // Server-rendered login page
  app.get("/", (req, res) => {
    if (req.session.userId) return res.redirect("/dashboard");
    res.type("html").send(loginPage(branding.serviceName));
  });

  // Server-rendered dashboard
  app.get("/dashboard", async (req, res) => {
    if (!req.session.userId) return res.redirect("/");

    const aliases = await aliasSvc.listForUser(req.session.userEmail!);
    const keys = await apiKeys.listApiKeys(req.session.userId!);

    const html = dashboardPage({
      serviceName: branding.serviceName,
      userEmail: req.session.userEmail!,
      aliasListHtml: aliasList(aliases.map(toAliasResponse)),
      keyListHtml: keyList(keys),
    });

    res.type("html").send(html);
  });

  app.use("/auth", authRouter);
  app.use("/api/v1/aliases", aliasesRouter);
  app.use("/api/v1", accountRouter);

  app.use((_req, res) => res.status(404).json({ message: "Not found" }));

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("Unhandled error:", err);
    res.status(500).json({ message: "Internal server error" });
  });

  return app;
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
  const app = createApp();

  console.log("[startup] Starting HTTP server...");
  app.listen(config.app.port, () => {
    console.log(`[startup] Incowgnito running on port ${config.app.port}`);
  });
};

start().catch((err) => {
  console.error("[startup] Failed to start:", err);
  process.exit(1);
});
