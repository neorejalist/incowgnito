import { Router } from "express";
import type { Request, Response } from "express";
import { config } from "../config";
import * as mailcow from "../services/mailcow";
import * as users from "../db/users";
import * as apiKeys from "../db/api-keys";
import {
  generateState,
  generateId,
  generateApiKey,
  hashApiKey,
} from "../utils/crypto";

declare module "express-session" {
  interface SessionData {
    userId?: string;
    userEmail?: string;
    oauthState?: string;
  }
}

const router = Router();

const REDIRECT_URI = `${config.app.url}/auth/callback`;

const getAuthorizeUrl = (state: string): string => {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.mailcow.oauthClientId,
    redirect_uri: REDIRECT_URI,
    scope: "profile",
    state,
  });
  return `https://${config.mailcow.host}/oauth/authorize?${params}`;
};

router.get("/login", (req: Request, res: Response) => {
  const state = generateState();
  req.session.oauthState = state;
  res.redirect(getAuthorizeUrl(state));
});

router.get("/callback", async (req: Request, res: Response) => {
  const { code, state, error } = req.query as Record<string, string>;

  if (error) return res.status(400).send(`OAuth error: ${error}`);
  if (!code || !state) return res.status(400).send("Missing code or state");
  if (state !== req.session.oauthState)
    return res.status(400).send("Invalid OAuth state");

  delete req.session.oauthState;

  try {
    const tokenData = await mailcow.exchangeCodeForToken(code, REDIRECT_URI);
    const profile = await mailcow.getUserProfile(tokenData.access_token);

    const user = await users.upsertUser(
      generateId(),
      profile.email,
      profile.username
    );

    req.session.userId = user.id;
    req.session.userEmail = user.email;

    res.redirect("/dashboard");
  } catch (err) {
    console.error("OAuth callback error:", (err as Error).message);
    res.status(500).send("Authentication failed");
  }
});

router.get("/logout", (req: Request, res: Response) => {
  req.session.destroy(() => res.redirect("/"));
});

// --- API key management (session-authenticated) ---

const requireSession = (req: Request, res: Response, next: Function) => {
  if (!req.session.userId)
    return res.status(401).json({ message: "Not logged in" });
  next();
};

router.post("/api-keys", requireSession, async (req: Request, res: Response) => {
  const name = (req.body.name as string)?.trim() || "Default";
  const rawKey = generateApiKey();
  const keyHash = hashApiKey(rawKey);

  await apiKeys.createApiKey(generateId(), req.session.userId!, keyHash, name);

  res.json({ key: rawKey, name });
});

router.get("/api-keys", requireSession, async (req: Request, res: Response) => {
  const keys = await apiKeys.listApiKeys(req.session.userId!);
  res.json({ data: keys });
});

router.delete(
  "/api-keys/:id",
  requireSession,
  async (req: Request, res: Response) => {
    const affected = await apiKeys.deleteApiKey(
      req.params.id as string,
      req.session.userId!
    );
    if (affected === 0)
      return res.status(404).json({ message: "API key not found" });
    res.json({ message: "Deleted" });
  }
);

// --- Session-based alias management for dashboard UI ---

router.get(
  "/aliases-preview",
  requireSession,
  async (req: Request, res: Response) => {
    const { listForUser } = await import("../services/aliases");
    const { toAliasResponse } = await import("../utils/format");
    const aliases = await listForUser(req.session.userEmail!);
    res.json({ data: aliases.map(toAliasResponse) });
  }
);

router.post(
  "/aliases-create",
  requireSession,
  async (req: Request, res: Response) => {
    const { generateLocalPart } = await import("../utils/crypto");
    const { config: cfg } = await import("../config");
    const mailcowSvc = await import("../services/mailcow");

    const customLocalPart = (req.body.local_part as string)?.trim();
    const localPart = customLocalPart || generateLocalPart();
    const address = `${localPart}@${cfg.relay.domain}`;

    try {
      await mailcowSvc.createAlias(address, req.session.userEmail!);
      res.json({ message: "Alias created" });
    } catch (err) {
      console.error("Alias creation failed:", (err as Error).message);
      res.status(502).json({ message: "Failed to create alias" });
    }
  }
);

router.patch(
  "/aliases-toggle/:id",
  requireSession,
  async (req: Request, res: Response) => {
    const mailcowSvc = await import("../services/mailcow");
    const aliasSvc = await import("../services/aliases");

    const alias = await aliasSvc.getById(Number(req.params.id), req.session.userEmail!);
    if (!alias) return res.status(404).json({ message: "Alias not found" });

    try {
      await mailcowSvc.setAliasActive(alias.id, !!req.body.active);
      res.json({ message: "Updated" });
    } catch (err) {
      console.error("Alias toggle failed:", (err as Error).message);
      res.status(502).json({ message: "Failed to update alias" });
    }
  }
);

router.delete(
  "/aliases-delete/:id",
  requireSession,
  async (req: Request, res: Response) => {
    const mailcowSvc = await import("../services/mailcow");
    const aliasSvc = await import("../services/aliases");

    const alias = await aliasSvc.getById(Number(req.params.id), req.session.userEmail!);
    if (!alias) return res.status(404).json({ message: "Alias not found" });

    try {
      await mailcowSvc.deleteAlias(alias.id);
      res.json({ message: "Deleted" });
    } catch (err) {
      console.error("Alias deletion failed:", (err as Error).message);
      res.status(502).json({ message: "Failed to delete alias" });
    }
  }
);

export default router;
