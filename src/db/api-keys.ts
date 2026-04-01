import { pool } from "./connection";
import type { RowDataPacket, ResultSetHeader } from "mysql2";

interface ApiKey {
  id: string;
  user_id: string;
  key_hash: string;
  name: string;
  created_at: string;
  last_used_at: string | null;
}

export const createApiKey = async (
  id: string,
  userId: string,
  keyHash: string,
  name: string
): Promise<void> => {
  await pool.execute(
    `INSERT INTO incowgnito_api_keys (id, user_id, key_hash, name)
     VALUES (?, ?, ?, ?)`,
    [id, userId, keyHash, name]
  );
};

export const listApiKeys = async (
  userId: string
): Promise<Omit<ApiKey, "key_hash">[]> => {
  const [rows] = await pool.execute<RowDataPacket[]>(
    "SELECT id, user_id, name, created_at, last_used_at FROM incowgnito_api_keys WHERE user_id = ? ORDER BY created_at DESC",
    [userId]
  );

  return rows as Omit<ApiKey, "key_hash">[];
};

export const findByHash = async (
  keyHash: string
): Promise<(ApiKey & { email: string }) | null> => {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT k.*, u.email
     FROM incowgnito_api_keys k
     JOIN incowgnito_users u ON k.user_id = u.id
     WHERE k.key_hash = ?`,
    [keyHash]
  );

  if (!rows[0]) return null;

  await pool.execute(
    "UPDATE incowgnito_api_keys SET last_used_at = NOW() WHERE id = ?",
    [(rows[0] as ApiKey).id]
  );

  return rows[0] as ApiKey & { email: string };
};

export const deleteApiKey = async (
  id: string,
  userId: string
): Promise<number> => {
  const [result] = await pool.execute<ResultSetHeader>(
    "DELETE FROM incowgnito_api_keys WHERE id = ? AND user_id = ?",
    [id, userId]
  );

  return result.affectedRows;
};
