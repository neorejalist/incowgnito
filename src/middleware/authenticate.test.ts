import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response, NextFunction } from "express";

vi.mock("../db/api-keys");
vi.mock("../utils/crypto");

import { authenticate } from "./authenticate";
import { findByHash } from "../db/api-keys";
import { hashApiKey } from "../utils/crypto";

const mockFindByHash = vi.mocked(findByHash);
const mockHashApiKey = vi.mocked(hashApiKey);

function createMockReq(authHeader?: string): Partial<Request> {
  return {
    headers: authHeader ? { authorization: authHeader } : {},
  };
}

function createMockRes(): Partial<Response> {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe("authenticate middleware", () => {
  let next: NextFunction;

  beforeEach(() => {
    next = vi.fn();
    mockHashApiKey.mockReturnValue("hashed-token");
  });

  it("sets req.user and calls next for a valid Bearer token", async () => {
    mockFindByHash.mockResolvedValue({
      id: "key-1",
      user_id: "user-1",
      key_hash: "hashed-token",
      name: "My Key",
      created_at: "2025-01-01",
      last_used_at: null,
      email: "user@example.com",
    });

    const req = createMockReq("Bearer valid-token");
    const res = createMockRes();

    await authenticate(req as Request, res as Response, next);

    expect(mockHashApiKey).toHaveBeenCalledWith("valid-token");
    expect(mockFindByHash).toHaveBeenCalledWith("hashed-token");
    expect(req.user).toEqual({ id: "user-1", email: "user@example.com" });
    expect(next).toHaveBeenCalled();
  });

  it("returns 401 when Authorization header is missing", async () => {
    const req = createMockReq();
    const res = createMockRes();

    await authenticate(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      message: "Missing or invalid Authorization header",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when Authorization header is not Bearer scheme", async () => {
    const req = createMockReq("Basic dXNlcjpwYXNz");
    const res = createMockRes();

    await authenticate(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when API key is not found in database", async () => {
    mockFindByHash.mockResolvedValue(null);

    const req = createMockReq("Bearer unknown-token");
    const res = createMockRes();

    await authenticate(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: "Invalid API key" });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 for Bearer with empty token", async () => {
    mockFindByHash.mockResolvedValue(null);

    const req = createMockReq("Bearer ");
    const res = createMockRes();

    await authenticate(req as Request, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
