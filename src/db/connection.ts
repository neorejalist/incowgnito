import mysql from "mysql2/promise";
import { config } from "../config";

let _pool: mysql.Pool | null = null;

export function getPool(): mysql.Pool {
  if (!_pool) {
    _pool = mysql.createPool({
      host: config.db.host,
      port: config.db.port,
      database: config.db.name,
      user: config.db.user,
      password: config.db.password,
      waitForConnections: true,
      connectionLimit: 10,
      idleTimeout: 60000,
    });
  }
  return _pool;
}

/** @deprecated Use getPool() — kept for backward compatibility */
export const pool = new Proxy({} as mysql.Pool, {
  get(_, prop: string | symbol) {
    const p = getPool();
    const val = (p as any)[prop];
    return typeof val === "function" ? val.bind(p) : val;
  },
});
