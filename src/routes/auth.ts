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
  generateLocalPart,
  hashApiKey,
} from "../utils/crypto";
import * as aliasSvc from "../services/aliases";
import { aliasList } from "../templates/aliases";
import { keyList, newKeyDisplay } from "../templates/keys";
import { toAliasResponse } from "../utils/format";

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
  req.session.destroy((err) => {
    if (err) console.error("Session destroy failed:", err);
    res.redirect("/");
  });
});

// --- Session guard ---

const requireSession = (req: Request, res: Response, next: Function) => {
  if (!req.session.userId)
    return res.status(401).json({ message: "Not logged in" });
  next();
};

// --- Helpers ---

const renderAliasListForUser = async (userEmail: string): Promise<string> => {
  const aliases = await aliasSvc.listForUser(userEmail);
  return aliasList(aliases.map(toAliasResponse));
};

const renderKeyListForUser = async (userId: string): Promise<string> => {
  const keys = await apiKeys.listApiKeys(userId);
  return keyList(keys);
};

const htmlResponse = (res: Response, html: string, toast?: string) => {
  if (toast) {
    res.set("HX-Trigger", JSON.stringify({ showToast: toast }));
  }
  res.type("html").send(html);
};

// --- API key management (session-authenticated) ---

router.post("/api-keys", requireSession, async (req: Request, res: Response) => {
  const name = (req.body.name as string)?.trim() || "Default";
  const rawKey = generateApiKey();
  const keyHash = hashApiKey(rawKey);

  await apiKeys.createApiKey(generateId(), req.session.userId!, keyHash, name);

  const keysHtml = await renderKeyListForUser(req.session.userId!);
  const html = newKeyDisplay(rawKey) + `<div id="keyList">${keysHtml}</div>`;
  htmlResponse(res, html, "API key created");
});

router.get("/api-keys", requireSession, async (req: Request, res: Response) => {
  const html = await renderKeyListForUser(req.session.userId!);
  htmlResponse(res, html);
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

    const html = await renderKeyListForUser(req.session.userId!);
    htmlResponse(res, html, "API key deleted");
  }
);

// --- Session-based alias management for dashboard UI ---

router.get(
  "/aliases-preview",
  requireSession,
  async (req: Request, res: Response) => {
    const html = await renderAliasListForUser(req.session.userEmail!);
    htmlResponse(res, html);
  }
);

router.post(
  "/aliases-create",
  requireSession,
  async (req: Request, res: Response) => {
    const customLocalPart = (req.body.local_part as string)?.trim();
    const localPart = customLocalPart || generateLocalPart();
    const address = `${localPart}@${config.relay.domain}`;

    try {
      await mailcow.createAlias(address, req.session.userEmail!);
      const html = await renderAliasListForUser(req.session.userEmail!);
      htmlResponse(res, html, "Alias created");
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
    const alias = await aliasSvc.getById(Number(req.params.id), req.session.userEmail!);
    if (!alias) return res.status(404).json({ message: "Alias not found" });

    const newActive = alias.active !== 1;

    try {
      await mailcow.setAliasActive(alias.id, newActive);
      const html = await renderAliasListForUser(req.session.userEmail!);
      htmlResponse(res, html, newActive ? "Alias enabled" : "Alias disabled");
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
    const alias = await aliasSvc.getById(Number(req.params.id), req.session.userEmail!);
    if (!alias) return res.status(404).json({ message: "Alias not found" });

    try {
      await mailcow.deleteAlias(alias.id);
      const html = await renderAliasListForUser(req.session.userEmail!);
      htmlResponse(res, html, "Alias deleted");
    } catch (err) {
      console.error("Alias deletion failed:", (err as Error).message);
      res.status(502).json({ message: "Failed to delete alias" });
    }
  }
);

export default router;
