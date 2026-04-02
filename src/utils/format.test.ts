import { describe, it, expect } from "vitest";
import { toAliasResponse } from "./format";

const BASE_ALIAS = {
  id: 42,
  address: "abc123@relay.example.com",
  goto: "user@example.com",
  active: 1,
  created: "2025-01-15 10:30:00",
  modified: "2025-02-20 14:00:00",
};

describe("toAliasResponse", () => {
  it("maps all fields correctly", () => {
    const result = toAliasResponse(BASE_ALIAS);

    expect(result).toEqual({
      id: 42,
      email: "abc123@relay.example.com",
      active: true,
      description: null,
      created_at: "2025-01-15 10:30:00",
      updated_at: "2025-02-20 14:00:00",
    });
  });

  it("converts active=1 to true", () => {
    expect(toAliasResponse({ ...BASE_ALIAS, active: 1 }).active).toBe(true);
  });

  it("converts active=0 to false", () => {
    expect(toAliasResponse({ ...BASE_ALIAS, active: 0 }).active).toBe(false);
  });

  it("sets description to null", () => {
    expect(toAliasResponse(BASE_ALIAS).description).toBeNull();
  });

  it("preserves empty string fields", () => {
    const alias = { ...BASE_ALIAS, address: "", created: "", modified: "" };
    const result = toAliasResponse(alias);

    expect(result.email).toBe("");
    expect(result.created_at).toBe("");
    expect(result.updated_at).toBe("");
  });
});
