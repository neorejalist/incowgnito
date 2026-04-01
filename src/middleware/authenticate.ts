import type { Request, Response, NextFunction } from "express";
import { hashApiKey } from "../utils/crypto";
import { findByHash } from "../db/api-keys";

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; email: string };
    }
  }
}

export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer "))
    return res.status(401).json({ message: "Missing or invalid Authorization header" });

  const token = authHeader.slice(7);
  const keyHash = hashApiKey(token);
  const apiKey = await findByHash(keyHash);

  if (!apiKey)
    return res.status(401).json({ message: "Invalid API key" });

  req.user = { id: apiKey.user_id, email: apiKey.email };
  next();
};
