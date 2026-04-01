import { pool } from "./connection";
import type { RowDataPacket } from "mysql2";

interface User {
  id: string;
  email: string;
  username: string;
  created_at: string;
}

export const upsertUser = async (
  id: string,
  email: string,
  username: string
): Promise<User> => {
  await pool.execute(
    `INSERT INTO incowgnito_users (id, email, username)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE username = VALUES(username)`,
    [id, email, username]
  );

  const [rows] = await pool.execute<RowDataPacket[]>(
    "SELECT * FROM incowgnito_users WHERE email = ?",
    [email]
  );

  return rows[0] as User;
};

export const getUserById = async (id: string): Promise<User | null> => {
  const [rows] = await pool.execute<RowDataPacket[]>(
    "SELECT * FROM incowgnito_users WHERE id = ?",
    [id]
  );

  return (rows[0] as User) ?? null;
};
