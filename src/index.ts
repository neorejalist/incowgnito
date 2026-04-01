import express from "express";
import session from "express-session";
import path from "path";
import { config } from "./config";
import { migrate } from "./db/migrate";
import authRouter from "./routes/auth";
import aliasesRouter from "./routes/aliases";
import accountRouter from "./routes/account";

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

app.use(express.static(path.join(import.meta.dir, "../public")));

app.get("/dashboard", (req, res) => {
  if (!req.session.userId) return res.redirect("/");
  res.sendFile(path.join(import.meta.dir, "../public/dashboard.html"));
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

const start = async () => {
  console.log("[startup] Loading config...");
  console.log(`[startup] Mailcow host: ${config.mailcow.host}`);
  console.log(`[startup] DB host: ${config.db.host}:${config.db.port}/${config.db.name}`);
  console.log(`[startup] DB user: ${config.db.user}`);
  console.log(`[startup] Relay domain: ${config.relay.domain}`);
  console.log(`[startup] App URL: ${config.app.url}`);

  console.log("[startup] Connecting to database...");
  await migrate();

  console.log("[startup] Starting HTTP server...");
  app.listen(config.app.port, () => {
    console.log(`[startup] Incowgnito running on port ${config.app.port}`);
  });
};

start().catch((err) => {
  console.error("[startup] Failed to start:", err);
  process.exit(1);
});
