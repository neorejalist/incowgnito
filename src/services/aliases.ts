import { pool } from "../db/connection";
import { config } from "../config";
import type { RowDataPacket } from "mysql2";

interface MailcowAlias {
  id: number;
  address: string;
  goto: string;
  active: number;
  created: string;
  modified: string;
}

export const listForUser = async (
  userEmail: string
): Promise<MailcowAlias[]> => {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT id, address, goto, active, created, modified
     FROM alias
     WHERE domain = ? AND goto = ?
     ORDER BY created DESC`,
    [config.relay.domain, userEmail]
  );

  return rows as MailcowAlias[];
};

export const getById = async (
  aliasId: number,
  userEmail: string
): Promise<MailcowAlias | null> => {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT id, address, goto, active, created, modified
     FROM alias
     WHERE id = ? AND domain = ? AND goto = ?`,
    [aliasId, config.relay.domain, userEmail]
  );

  return (rows[0] as MailcowAlias) ?? null;
};
