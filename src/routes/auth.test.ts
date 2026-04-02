import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";

vi.mock("../services/mailcow");
vi.mock("../services/aliases");
vi.mock("../db/users");
vi.mock("../db/api-keys");
vi.mock("../utils/crypto");
vi.mock("../config", () => ({
  config: {
    mailcow: {
      host: "mail.test",
      apiKey: "k",
      oauthClientId: "test-client-id",
      oauthClientSecret: "test-secret",
    },
    db: { host: "localhost", port: 3306, name: "test", user: "u", password: "p" },
    relay: { domain: "relay.test" },
    app: {
      url: "https://app.test",
      port: 3000,
      sessionSecret: "s",
      isProduction: false,
      assetsPath: "./assets",
    },
  },
}));

import router from "./auth";
import * as mailcow from "../services/mailcow";
import * as aliasSvc from "../services/aliases";
import * as users from "../db/users";
import * as apiKeys from "../db/api-keys";
import { generateState, generateId, generateApiKey, hashApiKey } from "../utils/crypto";

const mockMailcow = vi.mocked(mailcow);
const mockAliasSvc = vi.mocked(aliasSvc);
const mockUsers = vi.mocked(users);
const mockApiKeys = vi.mocked(apiKeys);
const mockGenerateState = vi.mocked(generateState);
const mockGenerateId = vi.mocked(generateId);
const mockGenerateApiKey = vi.mocked(generateApiKey);
const mockHashApiKey = vi.mocked(hashApiKey);

interface SessionData {
  oauthState?: string;
  userId?: string;
  userEmail?: string;
  destroy?: (cb: (err?: Error) => void) => void;
}

function createSession(data: Partial<SessionData> = {}): SessionData {
  return {
    destroy: vi.fn((cb: (err?: Error) => void) => cb()),
    ...data,
  };
}

interface DispatchResult {
  status: number;
  body: unknown;
  redirectUrl?: string;
  headers: Record<string, string>;
}

async function dispatch(
  method: string,
  path: string,
  options: {
    query?: Record<string, string>;
    body?: Record<string, unknown>;
    session?: SessionData;
  } = {}
): Promise<DispatchResult> {
  return new Promise((resolve) => {
    const session = options.session ?? createSession();
    const req = {
      method: method.toUpperCase(),
      url: path,
      path,
      baseUrl: "",
      params: {},
      query: options.query ?? {},
      headers: {},
      body: options.body ?? {},
      session,
      get: () => undefined,
    } as unknown as Request;

    const result: DispatchResult = {
      status: 200,
      body: null,
      headers: {},
    };
    const res = {
      status(code: number) {
        result.status = code;
        return this;
      },
      json(data: unknown) {
        result.body = data;
        resolve(result);
      },
      send(data?: unknown) {
        result.body = data ?? null;
        resolve(result);
      },
      redirect(url: string) {
        result.status = 302;
        result.redirectUrl = url;
        resolve(result);
      },
      set(key: string, value: string) {
        result.headers[key.toLowerCase()] = value;
        return this;
      },
      type(_t: string) {
        return this;
      },
    } as unknown as Response;

    router.handle(req, res, () => resolve(result));
  });
}

const MOCK_ALIASES = [
  { id: 1, address: "a@relay.test", goto: "u@test", active: 1, created: "2025-01-01", modified: "2025-01-01" },
];

const MOCK_KEYS = [
  { id: "key-1", user_id: "user-1", name: "My Key", created_at: "2025-01-01", last_used_at: null },
];

describe("GET /login", () => {
  it("redirects to mailcow OAuth authorize URL with state", async () => {
    mockGenerateState.mockReturnValue("random-state-value");

    const session = createSession();
    const { status, redirectUrl } = await dispatch("GET", "/login", { session });

    expect(status).toBe(302);
    expect(redirectUrl).toContain("mail.test/oauth/authorize");
    expect(redirectUrl).toContain("client_id=test-client-id");
    expect(redirectUrl).toContain("state=random-state-value");
    expect(session.oauthState).toBe("random-state-value");
  });
});

describe("GET /callback", () => {
  beforeEach(() => {
    mockGenerateId.mockReturnValue("generated-user-id");
  });

  it("exchanges code for token, creates user, and redirects to dashboard", async () => {
    mockMailcow.exchangeCodeForToken.mockResolvedValue({
      access_token: "oauth-token",
    });
    mockMailcow.getUserProfile.mockResolvedValue({
      email: "user@example.com",
      username: "testuser",
    });
    mockUsers.upsertUser.mockResolvedValue({
      id: "user-1",
      email: "user@example.com",
      username: "testuser",
      created_at: "2025-01-01",
    });

    const session = createSession({ oauthState: "valid-state" });
    const { status, redirectUrl } = await dispatch("GET", "/callback", {
      query: { code: "auth-code", state: "valid-state" },
      session,
    });

    expect(status).toBe(302);
    expect(redirectUrl).toBe("/dashboard");
    expect(mockMailcow.exchangeCodeForToken).toHaveBeenCalledWith(
      "auth-code",
      "https://app.test/auth/callback"
    );
    expect(session.userId).toBe("user-1");
    expect(session.userEmail).toBe("user@example.com");
    expect(session.oauthState).toBeUndefined();
  });

  it("returns 400 when error query param is present", async () => {
    const { status, body } = await dispatch("GET", "/callback", {
      query: { error: "access_denied" },
    });

    expect(status).toBe(400);
    expect(body).toContain("access_denied");
  });

  it("returns 400 when code is missing", async () => {
    const { status, body } = await dispatch("GET", "/callback", {
      query: { state: "some-state" },
    });

    expect(status).toBe(400);
    expect(body).toContain("Missing code or state");
  });

  it("returns 400 when state is missing", async () => {
    const { status, body } = await dispatch("GET", "/callback", {
      query: { code: "some-code" },
    });

    expect(status).toBe(400);
    expect(body).toContain("Missing code or state");
  });

  it("returns 400 when state does not match session", async () => {
    const session = createSession({ oauthState: "expected-state" });
    const { status, body } = await dispatch("GET", "/callback", {
      query: { code: "auth-code", state: "wrong-state" },
      session,
    });

    expect(status).toBe(400);
    expect(body).toContain("Invalid OAuth state");
  });

  it("returns 500 when OAuth token exchange fails", async () => {
    mockMailcow.exchangeCodeForToken.mockRejectedValue(new Error("network"));

    const session = createSession({ oauthState: "valid-state" });
    const { status, body } = await dispatch("GET", "/callback", {
      query: { code: "auth-code", state: "valid-state" },
      session,
    });

    expect(status).toBe(500);
    expect(body).toContain("Authentication failed");
  });
});

describe("GET /logout", () => {
  it("destroys session and redirects to home", async () => {
    const session = createSession({ userId: "user-1" });
    const { status, redirectUrl } = await dispatch("GET", "/logout", { session });

    expect(status).toBe(302);
    expect(redirectUrl).toBe("/");
    expect(session.destroy).toHaveBeenCalled();
  });
});

describe("POST /api-keys", () => {
  it("creates a key and returns HTML with new key display", async () => {
    mockGenerateApiKey.mockReturnValue("raw-api-key");
    mockHashApiKey.mockReturnValue("hashed-key");
    mockGenerateId.mockReturnValue("key-id");
    mockApiKeys.createApiKey.mockResolvedValue();
    mockApiKeys.listApiKeys.mockResolvedValue(MOCK_KEYS);

    const session = createSession({ userId: "user-1" });
    const { status, body, headers } = await dispatch("POST", "/api-keys", {
      body: { name: "My Key" },
      session,
    });

    expect(status).toBe(200);
    expect(body).toContain("raw-api-key");
    expect(body).toContain("copy it now");
    expect(headers["hx-trigger"]).toContain("showToast");
    expect(mockApiKeys.createApiKey).toHaveBeenCalledWith(
      "key-id",
      "user-1",
      "hashed-key",
      "My Key"
    );
  });

  it("defaults name to 'Default' when not provided", async () => {
    mockGenerateApiKey.mockReturnValue("raw-api-key");
    mockHashApiKey.mockReturnValue("hashed-key");
    mockGenerateId.mockReturnValue("key-id");
    mockApiKeys.createApiKey.mockResolvedValue();
    mockApiKeys.listApiKeys.mockResolvedValue([]);

    const session = createSession({ userId: "user-1" });
    await dispatch("POST", "/api-keys", { body: {}, session });

    expect(mockApiKeys.createApiKey).toHaveBeenCalledWith(
      "key-id",
      "user-1",
      "hashed-key",
      "Default"
    );
  });

  it("returns 401 when not logged in", async () => {
    const { status, body } = await dispatch("POST", "/api-keys", { body: { name: "Key" } });

    expect(status).toBe(401);
    expect((body as { message: string }).message).toBe("Not logged in");
  });
});

describe("GET /api-keys", () => {
  it("returns HTML list of API keys", async () => {
    mockApiKeys.listApiKeys.mockResolvedValue(MOCK_KEYS);

    const session = createSession({ userId: "user-1" });
    const { body } = await dispatch("GET", "/api-keys", { session });

    expect(body).toContain("My Key");
    expect(body).toContain("hx-delete");
    expect(mockApiKeys.listApiKeys).toHaveBeenCalledWith("user-1");
  });

  it("returns 401 when not logged in", async () => {
    const { status } = await dispatch("GET", "/api-keys");
    expect(status).toBe(401);
  });
});

describe("DELETE /api-keys/:id", () => {
  it("deletes an API key and returns HTML with toast", async () => {
    mockApiKeys.deleteApiKey.mockResolvedValue(1);
    mockApiKeys.listApiKeys.mockResolvedValue([]);

    const session = createSession({ userId: "user-1" });
    const { body, headers } = await dispatch("DELETE", "/api-keys/key-1", { session });

    expect(body).toContain("No API keys yet");
    expect(headers["hx-trigger"]).toContain("showToast");
    expect(mockApiKeys.deleteApiKey).toHaveBeenCalledWith("key-1", "user-1");
  });

  it("returns 404 when key does not exist or belongs to another user", async () => {
    mockApiKeys.deleteApiKey.mockResolvedValue(0);

    const session = createSession({ userId: "user-1" });
    const { status, body } = await dispatch("DELETE", "/api-keys/nonexistent", {
      session,
    });

    expect(status).toBe(404);
    expect((body as { message: string }).message).toBe("API key not found");
  });

  it("returns 401 when not logged in", async () => {
    const { status } = await dispatch("DELETE", "/api-keys/key-1");
    expect(status).toBe(401);
  });
});

describe("GET /aliases-preview", () => {
  it("returns HTML list of aliases", async () => {
    mockAliasSvc.listForUser.mockResolvedValue(MOCK_ALIASES);

    const session = createSession({ userId: "user-1", userEmail: "u@test" });
    const { body } = await dispatch("GET", "/aliases-preview", { session });

    expect(body).toContain("a@relay.test");
    expect(body).toContain("hx-patch");
    expect(body).toContain("hx-delete");
  });

  it("returns 401 when not logged in", async () => {
    const { status } = await dispatch("GET", "/aliases-preview");
    expect(status).toBe(401);
  });
});

describe("POST /aliases-create", () => {
  it("creates alias and returns HTML alias list with toast", async () => {
    mockMailcow.createAlias.mockResolvedValue({ id: 1 });
    mockAliasSvc.listForUser.mockResolvedValue(MOCK_ALIASES);

    const session = createSession({ userId: "user-1", userEmail: "u@test" });
    const { body, headers } = await dispatch("POST", "/aliases-create", {
      body: { local_part: "custom" },
      session,
    });

    expect(body).toContain("a@relay.test");
    expect(headers["hx-trigger"]).toContain("showToast");
    expect(mockMailcow.createAlias).toHaveBeenCalledWith("custom@relay.test", "u@test");
  });

  it("returns 502 when alias creation fails", async () => {
    mockMailcow.createAlias.mockRejectedValue(new Error("network"));

    const session = createSession({ userId: "user-1", userEmail: "u@test" });
    const { status } = await dispatch("POST", "/aliases-create", {
      body: {},
      session,
    });

    expect(status).toBe(502);
  });
});

describe("PATCH /aliases-toggle/:id", () => {
  it("toggles alias active state and returns HTML with toast", async () => {
    mockAliasSvc.getById.mockResolvedValue(MOCK_ALIASES[0]);
    mockMailcow.setAliasActive.mockResolvedValue();
    mockAliasSvc.listForUser.mockResolvedValue(MOCK_ALIASES);

    const session = createSession({ userId: "user-1", userEmail: "u@test" });
    const { body, headers } = await dispatch("PATCH", "/aliases-toggle/1", { session });

    expect(body).toContain("a@relay.test");
    expect(headers["hx-trigger"]).toContain("showToast");
    // alias.active is 1, so toggle should call setAliasActive with false
    expect(mockMailcow.setAliasActive).toHaveBeenCalledWith(1, false);
  });

  it("returns 404 when alias not found", async () => {
    mockAliasSvc.getById.mockResolvedValue(null);

    const session = createSession({ userId: "user-1", userEmail: "u@test" });
    const { status } = await dispatch("PATCH", "/aliases-toggle/999", { session });

    expect(status).toBe(404);
  });
});

describe("DELETE /aliases-delete/:id", () => {
  it("deletes alias and returns HTML with toast", async () => {
    mockAliasSvc.getById.mockResolvedValue(MOCK_ALIASES[0]);
    mockMailcow.deleteAlias.mockResolvedValue();
    mockAliasSvc.listForUser.mockResolvedValue([]);

    const session = createSession({ userId: "user-1", userEmail: "u@test" });
    const { body, headers } = await dispatch("DELETE", "/aliases-delete/1", { session });

    expect(body).toContain("No aliases yet");
    expect(headers["hx-trigger"]).toContain("showToast");
    expect(mockMailcow.deleteAlias).toHaveBeenCalledWith(1);
  });

  it("returns 404 when alias not found", async () => {
    mockAliasSvc.getById.mockResolvedValue(null);

    const session = createSession({ userId: "user-1", userEmail: "u@test" });
    const { status } = await dispatch("DELETE", "/aliases-delete/999", { session });

    expect(status).toBe(404);
  });
});
