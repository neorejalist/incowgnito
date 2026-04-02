import { describe, it, expect, vi } from "vitest";
import request from "supertest";

vi.mock("./db/migrate", () => ({ migrate: vi.fn() }));
vi.mock("./config", () => ({
  config: {
    mailcow: { host: "mail.test", apiKey: "k", oauthClientId: "c", oauthClientSecret: "s" },
    db: { host: "localhost", port: 3306, name: "test", user: "u", password: "p" },
    relay: { domain: "relay.test" },
    app: { url: "https://app.test", port: 3000, sessionSecret: "s", isProduction: false, assetsPath: "./assets" },
  },
}));

import { createApp } from "./index";

const app = createApp();

describe("security headers", () => {
  it("sets x-content-type-options to nosniff", async () => {
    const res = await request(app).get("/api/branding");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("sets x-frame-options to SAMEORIGIN", async () => {
    const res = await request(app).get("/api/branding");
    expect(res.headers["x-frame-options"]).toBe("SAMEORIGIN");
  });

  it("removes x-powered-by header", async () => {
    const res = await request(app).get("/api/branding");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("sets strict-transport-security header", async () => {
    const res = await request(app).get("/api/branding");
    expect(res.headers["strict-transport-security"]).toBeDefined();
  });

  it("sets content-security-policy header", async () => {
    const res = await request(app).get("/api/branding");
    expect(res.headers["content-security-policy"]).toBeDefined();
  });
});
