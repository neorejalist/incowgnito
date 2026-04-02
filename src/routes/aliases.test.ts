import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";

vi.mock("../middleware/authenticate", () => ({
  authenticate: (_req: Request, _res: Response, next: NextFunction) => next(),
}));

vi.mock("../services/mailcow");
vi.mock("../services/aliases");
vi.mock("../utils/crypto");
vi.mock("../config", () => ({
  config: {
    mailcow: { host: "mail.test", apiKey: "k", oauthClientId: "c", oauthClientSecret: "s" },
    db: { host: "localhost", port: 3306, name: "test", user: "u", password: "p" },
    relay: { domain: "relay.test" },
    app: { url: "https://app.test", port: 3000, sessionSecret: "s", isProduction: false, assetsPath: "./assets" },
  },
}));

import router from "./aliases";
import * as mailcow from "../services/mailcow";
import * as aliasService from "../services/aliases";
import { generateLocalPart } from "../utils/crypto";

const mockMailcow = vi.mocked(mailcow);
const mockAliasService = vi.mocked(aliasService);
const mockGenerateLocalPart = vi.mocked(generateLocalPart);

const SAMPLE_ALIAS = {
  id: 10,
  address: "abc123@relay.test",
  goto: "user@example.com",
  active: 1,
  created: "2025-01-01 00:00:00",
  modified: "2025-01-02 00:00:00",
};

// Helper to dispatch requests through the Express router
async function dispatch(
  method: string,
  path: string,
  body?: Record<string, unknown>
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve) => {
    const req = {
      method: method.toUpperCase(),
      url: path,
      path,
      baseUrl: "",
      body: body ?? {},
      params: {},
      query: {},
      headers: {},
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

    router.handle(req, res, () => {
      resolve(resBody);
    });
  });
}

describe("GET /", () => {
  it("returns formatted aliases for the authenticated user", async () => {
    mockAliasService.listForUser.mockResolvedValue([SAMPLE_ALIAS]);

    const { status, body } = await dispatch("GET", "/");

    expect(status).toBe(200);
    expect(mockAliasService.listForUser).toHaveBeenCalledWith("user@example.com");
    expect((body as { data: unknown[] }).data).toHaveLength(1);
    expect((body as { data: { email: string }[] }).data[0].email).toBe("abc123@relay.test");
  });

  it("returns empty array when user has no aliases", async () => {
    mockAliasService.listForUser.mockResolvedValue([]);

    const { body } = await dispatch("GET", "/");

    expect((body as { data: unknown[] }).data).toHaveLength(0);
  });
});

describe("POST /", () => {
  it("creates alias with auto-generated local part", async () => {
    mockGenerateLocalPart.mockReturnValue("deadbeef12345678");
    mockMailcow.createAlias.mockResolvedValue({ id: 10 });
    mockAliasService.getById.mockResolvedValue(SAMPLE_ALIAS);

    const { status, body } = await dispatch("POST", "/", {});

    expect(status).toBe(201);
    expect(mockMailcow.createAlias).toHaveBeenCalledWith(
      "deadbeef12345678@relay.test",
      "user@example.com"
    );
    expect((body as { data: { id: number } }).data.id).toBe(10);
  });

  it("creates alias with custom local part", async () => {
    mockMailcow.createAlias.mockResolvedValue({ id: 11 });
    mockAliasService.getById.mockResolvedValue({
      ...SAMPLE_ALIAS,
      id: 11,
      address: "custom@relay.test",
    });

    const { status } = await dispatch("POST", "/", { local_part: "custom" });

    expect(status).toBe(201);
    expect(mockMailcow.createAlias).toHaveBeenCalledWith(
      "custom@relay.test",
      "user@example.com"
    );
  });

  it("returns 502 when mailcow fails to create alias", async () => {
    mockMailcow.createAlias.mockRejectedValue(new Error("mailcow down"));

    const { status, body } = await dispatch("POST", "/", {});

    expect(status).toBe(502);
    expect((body as { message: string }).message).toContain("Failed to provision");
  });

  it("returns 502 when alias created but cannot be retrieved", async () => {
    mockGenerateLocalPart.mockReturnValue("deadbeef12345678");
    mockMailcow.createAlias.mockResolvedValue({ id: 10 });
    mockAliasService.getById.mockResolvedValue(null);

    const { status, body } = await dispatch("POST", "/", {});

    expect(status).toBe(502);
    expect((body as { message: string }).message).toContain("could not be retrieved");
  });
});

describe("GET /:id", () => {
  it("returns a single alias by id", async () => {
    mockAliasService.getById.mockResolvedValue(SAMPLE_ALIAS);

    const { status, body } = await dispatch("GET", "/10");

    expect(status).toBe(200);
    expect(mockAliasService.getById).toHaveBeenCalledWith(10, "user@example.com");
    expect((body as { data: { id: number } }).data.id).toBe(10);
  });

  it("returns 404 when alias does not exist", async () => {
    mockAliasService.getById.mockResolvedValue(null);

    const { status, body } = await dispatch("GET", "/999");

    expect(status).toBe(404);
    expect((body as { message: string }).message).toBe("Alias not found");
  });
});

describe("PATCH /:id", () => {
  it("toggles alias active status", async () => {
    mockAliasService.getById
      .mockResolvedValueOnce(SAMPLE_ALIAS)
      .mockResolvedValueOnce({ ...SAMPLE_ALIAS, active: 0 });
    mockMailcow.setAliasActive.mockResolvedValue();

    const { status, body } = await dispatch("PATCH", "/10", { active: false });

    expect(status).toBe(200);
    expect(mockMailcow.setAliasActive).toHaveBeenCalledWith(10, false);
    expect((body as { data: { active: boolean } }).data.active).toBe(false);
  });

  it("returns 404 when alias does not exist", async () => {
    mockAliasService.getById.mockResolvedValue(null);

    const { status, body } = await dispatch("PATCH", "/999", { active: true });

    expect(status).toBe(404);
    expect((body as { message: string }).message).toBe("Alias not found");
  });

  it("returns 502 when mailcow fails to update", async () => {
    mockAliasService.getById.mockResolvedValue(SAMPLE_ALIAS);
    mockMailcow.setAliasActive.mockRejectedValue(new Error("timeout"));

    const { status, body } = await dispatch("PATCH", "/10", { active: false });

    expect(status).toBe(502);
    expect((body as { message: string }).message).toContain("Failed to update");
  });
});

describe("DELETE /:id", () => {
  it("deletes alias and returns 204", async () => {
    mockAliasService.getById.mockResolvedValue(SAMPLE_ALIAS);
    mockMailcow.deleteAlias.mockResolvedValue();

    const { status } = await dispatch("DELETE", "/10");

    expect(status).toBe(204);
    expect(mockMailcow.deleteAlias).toHaveBeenCalledWith(10);
  });

  it("returns 404 when alias does not exist", async () => {
    mockAliasService.getById.mockResolvedValue(null);

    const { status, body } = await dispatch("DELETE", "/999");

    expect(status).toBe(404);
    expect((body as { message: string }).message).toBe("Alias not found");
  });

  it("returns 502 when mailcow fails to delete", async () => {
    mockAliasService.getById.mockResolvedValue(SAMPLE_ALIAS);
    mockMailcow.deleteAlias.mockRejectedValue(new Error("network error"));

    const { status, body } = await dispatch("DELETE", "/10");

    expect(status).toBe(502);
    expect((body as { message: string }).message).toContain("Failed to remove");
  });
});
