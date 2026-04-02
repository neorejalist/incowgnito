import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";

vi.mock("../services/mailcow");
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
import * as users from "../db/users";
import * as apiKeys from "../db/api-keys";
import { generateState, generateId, generateApiKey, hashApiKey } from "../utils/crypto";

const mockMailcow = vi.mocked(mailcow);
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

async function dispatch(
  method: string,
  path: string,
  options: {
    query?: Record<string, string>;
    body?: Record<string, unknown>;
    session?: SessionData;
  } = {}
): Promise<{ status: number; body: unknown; redirectUrl?: string }> {
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

    const result: { status: number; body: unknown; redirectUrl?: string } = {
      status: 200,
      body: null,
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
    } as unknown as Response;

    router.handle(req, res, () => resolve(result));
  });
}

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
  it("creates and returns a new API key", async () => {
    mockGenerateApiKey.mockReturnValue("raw-api-key");
    mockHashApiKey.mockReturnValue("hashed-key");
    mockGenerateId.mockReturnValue("key-id");
    mockApiKeys.createApiKey.mockResolvedValue();

    const session = createSession({ userId: "user-1" });
    const { status, body } = await dispatch("POST", "/api-keys", {
      body: { name: "My Key" },
      session,
    });

    expect(status).toBe(200);
    expect((body as { key: string }).key).toBe("raw-api-key");
    expect((body as { name: string }).name).toBe("My Key");
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
  it("lists API keys for the logged-in user", async () => {
    mockApiKeys.listApiKeys.mockResolvedValue([
      {
        id: "key-1",
        user_id: "user-1",
        name: "My Key",
        created_at: "2025-01-01",
        last_used_at: null,
      },
    ]);

    const session = createSession({ userId: "user-1" });
    const { body } = await dispatch("GET", "/api-keys", { session });

    expect((body as { data: unknown[] }).data).toHaveLength(1);
    expect(mockApiKeys.listApiKeys).toHaveBeenCalledWith("user-1");
  });

  it("returns 401 when not logged in", async () => {
    const { status } = await dispatch("GET", "/api-keys");
    expect(status).toBe(401);
  });
});

describe("DELETE /api-keys/:id", () => {
  it("deletes an API key and returns success", async () => {
    mockApiKeys.deleteApiKey.mockResolvedValue(1);

    const session = createSession({ userId: "user-1" });
    const { body } = await dispatch("DELETE", "/api-keys/key-1", { session });

    expect((body as { message: string }).message).toBe("Deleted");
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
