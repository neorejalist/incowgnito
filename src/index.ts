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
  await migrate();
  app.listen(config.app.port, () => {
    console.log(`Incowgnito running on port ${config.app.port}`);
    console.log(`Relay domain: ${config.relay.domain}`);
  });
};

start().catch((err) => {
  console.error("Failed to start:", err);
  process.exit(1);
});
