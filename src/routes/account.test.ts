import { describe, it, expect, vi } from "vitest";
import type { Request, Response, NextFunction } from "express";

vi.mock("../middleware/authenticate", () => ({
  authenticate: (_req: Request, _res: Response, next: NextFunction) => next(),
}));

vi.mock("../services/aliases");
vi.mock("../config", () => ({
  config: {
    mailcow: { host: "mail.test", apiKey: "k", oauthClientId: "c", oauthClientSecret: "s" },
    db: { host: "localhost", port: 3306, name: "test", user: "u", password: "p" },
    relay: { domain: "relay.test" },
    app: { url: "https://app.test", port: 3000, sessionSecret: "s", isProduction: false, assetsPath: "./assets" },
  },
}));

import router from "./account";
import * as aliasService from "../services/aliases";

const mockAliasService = vi.mocked(aliasService);

const SAMPLE_ALIAS = {
  id: 1,
  address: "a@relay.test",
  goto: "user@example.com",
  active: 1,
  created: "2025-01-01",
  modified: "2025-01-01",
};

async function dispatch(path: string): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve) => {
    const req = {
      method: "GET",
      url: path,
      path,
      baseUrl: "",
      params: {},
      query: {},
      headers: {},
      body: {},
      user: { id: "user-1", email: "user@example.com" },
      get: () => undefined,
    } as unknown as Request;

    const resBody: { status: number; body: unknown } = { status: 200, body: null };
    const res = {
      status(code: number) {
        resBody.status = code;
        return this;
      },
      json(data: unknown) {
        resBody.body = data;
        resolve(resBody);
      },
      send() {
        resolve(resBody);
      },
    } as unknown as Response;

    router.handle(req, res, () => resolve(resBody));
  });
}

describe("GET /account-details", () => {
  it("returns account info with alias count", async () => {
    mockAliasService.listForUser.mockResolvedValue([SAMPLE_ALIAS, SAMPLE_ALIAS]);

    const { status, body } = await dispatch("/account-details");

    expect(status).toBe(200);
    const data = (body as { data: Record<string, unknown> }).data;
    expect(data.id).toBe("user-1");
    expect(data.email).toBe("user@example.com");
    expect(data.default_alias_domain).toBe("relay.test");
    expect(data.alias_count).toBe(2);
  });

  it("returns alias_count of 0 when user has no aliases", async () => {
    mockAliasService.listForUser.mockResolvedValue([]);

    const { body } = await dispatch("/account-details");

    const data = (body as { data: Record<string, unknown> }).data;
    expect(data.alias_count).toBe(0);
  });
});
