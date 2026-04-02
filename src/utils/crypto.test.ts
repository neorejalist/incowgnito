import { describe, it, expect } from "vitest";
import {
  generateId,
  generateLocalPart,
  generateState,
  generateApiKey,
  hashApiKey,
} from "./crypto";

const HEX_PATTERN = /^[0-9a-f]+$/;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

describe("generateId", () => {
  it("returns a 32-character hex string", () => {
    const id = generateId();
    expect(id).toHaveLength(32);
    expect(id).toMatch(HEX_PATTERN);
  });

  it("returns unique values on successive calls", () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateId()));
    expect(ids.size).toBe(50);
  });
});

describe("generateLocalPart", () => {
  it("returns a 16-character hex string", () => {
    const part = generateLocalPart();
    expect(part).toHaveLength(16);
    expect(part).toMatch(HEX_PATTERN);
  });

  it("returns unique values on successive calls", () => {
    const parts = new Set(Array.from({ length: 50 }, () => generateLocalPart()));
    expect(parts.size).toBe(50);
  });
});

describe("generateState", () => {
  it("returns a 64-character hex string", () => {
    const state = generateState();
    expect(state).toHaveLength(64);
    expect(state).toMatch(HEX_PATTERN);
  });
});

describe("generateApiKey", () => {
  it("returns a 43-character base64url string", () => {
    const key = generateApiKey();
    expect(key).toHaveLength(43);
    expect(key).toMatch(BASE64URL_PATTERN);
  });

  it("returns unique values on successive calls", () => {
    const keys = new Set(Array.from({ length: 50 }, () => generateApiKey()));
    expect(keys.size).toBe(50);
  });
});

describe("hashApiKey", () => {
  it("returns a 64-character hex string (SHA-256)", () => {
    const hash = hashApiKey("test-key");
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(HEX_PATTERN);
  });

  it("produces consistent output for the same input", () => {
    expect(hashApiKey("same-key")).toBe(hashApiKey("same-key"));
  });

  it("produces different output for different inputs", () => {
    expect(hashApiKey("key-a")).not.toBe(hashApiKey("key-b"));
  });
});
