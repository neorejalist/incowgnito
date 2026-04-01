import { randomBytes, createHash } from "crypto";

const ID_BYTES = 16;
const LOCAL_PART_BYTES = 8;
const STATE_BYTES = 32;
const API_KEY_BYTES = 32;

export const generateId = (): string => randomBytes(ID_BYTES).toString("hex");

export const generateLocalPart = (): string =>
  randomBytes(LOCAL_PART_BYTES).toString("hex");

export const generateState = (): string =>
  randomBytes(STATE_BYTES).toString("hex");

export const generateApiKey = (): string =>
  randomBytes(API_KEY_BYTES).toString("base64url");

export const hashApiKey = (key: string): string =>
  createHash("sha256").update(key).digest("hex");
