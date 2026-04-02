import { describe, it, expect, beforeEach, vi } from "vitest";

const REQUIRED_ENV = {
  MAILCOW_HOSTNAME: "mail.example.com",
  MAILCOW_API_KEY: "api-key-123",
  MAILCOW_OAUTH_CLIENT_ID: "client-id",
  MAILCOW_OAUTH_CLIENT_SECRET: "client-secret",
  INCOWGNITO_DB_USER: "dbuser",
  INCOWGNITO_DB_PASSWORD: "dbpass",
  RELAY_DOMAIN: "relay.example.com",
  APP_URL: "https://app.example.com",
  SESSION_SECRET: "super-secret",
};

describe("config", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "development");
    for (const [key, value] of Object.entries(REQUIRED_ENV)) {
      vi.stubEnv(key, value);
    }
    // Clear optional vars
    delete process.env.DBHOST;
    delete process.env.DBPORT;
    delete process.env.DBNAME;
    delete process.env.PORT;
    delete process.env.ASSETS_PATH;
  });

  async function loadConfig() {
    const { config } = await import("./config");
    return config;
  }

  it("loads all required mailcow config", async () => {
    const config = await loadConfig();
    expect(config.mailcow.host).toBe("mail.example.com");
    expect(config.mailcow.apiKey).toBe("api-key-123");
    expect(config.mailcow.oauthClientId).toBe("client-id");
    expect(config.mailcow.oauthClientSecret).toBe("client-secret");
  });

  it("loads database config with defaults", async () => {
    const config = await loadConfig();
    expect(config.db.host).toBe("mysql-mailcow");
    expect(config.db.port).toBe(3306);
    expect(config.db.name).toBe("mailcow");
    expect(config.db.user).toBe("dbuser");
    expect(config.db.password).toBe("dbpass");
  });

  it("uses custom database host/port/name when set", async () => {
    vi.stubEnv("DBHOST", "custom-host");
    vi.stubEnv("DBPORT", "5432");
    vi.stubEnv("DBNAME", "custom-db");

    const config = await loadConfig();
    expect(config.db.host).toBe("custom-host");
    expect(config.db.port).toBe(5432);
    expect(config.db.name).toBe("custom-db");
  });

  it("loads relay and app config", async () => {
    const config = await loadConfig();
    expect(config.relay.domain).toBe("relay.example.com");
    expect(config.app.url).toBe("https://app.example.com");
    expect(config.app.sessionSecret).toBe("super-secret");
  });

  it("defaults to port 3000", async () => {
    const config = await loadConfig();
    expect(config.app.port).toBe(3000);
  });

  it("uses custom port when set", async () => {
    vi.stubEnv("PORT", "8080");
    const config = await loadConfig();
    expect(config.app.port).toBe(8080);
  });

  it("detects production mode", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const config = await loadConfig();
    expect(config.app.isProduction).toBe(true);
  });

  it("detects non-production mode", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const config = await loadConfig();
    expect(config.app.isProduction).toBe(false);
  });

  it("uses production assets path in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const config = await loadConfig();
    expect(config.app.assetsPath).toBe("/app/assets");
  });

  it("uses development assets path in development", async () => {
    const config = await loadConfig();
    expect(config.app.assetsPath).toBe("./assets");
  });

  it("allows custom assets path override", async () => {
    vi.stubEnv("ASSETS_PATH", "/custom/assets");
    const config = await loadConfig();
    expect(config.app.assetsPath).toBe("/custom/assets");
  });

  const requiredKeys = Object.keys(REQUIRED_ENV);
  it.each(requiredKeys)(
    "throws when %s is missing",
    async (key) => {
      delete process.env[key];
      await expect(loadConfig().then((c) => {
        // Access the section that contains this key to trigger lazy load
        if (key.startsWith("MAILCOW_")) return c.mailcow;
        if (key.startsWith("INCOWGNITO_DB_")) return c.db;
        if (key === "RELAY_DOMAIN") return c.relay;
        return c.app;
      })).rejects.toThrow(`Missing required env var: ${key}`);
    }
  );
});
