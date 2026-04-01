import { pool } from "./connection";

export const migrate = async () => {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS incowgnito_users (
      id          VARCHAR(36) PRIMARY KEY,
      email       VARCHAR(255) UNIQUE NOT NULL,
      username    VARCHAR(255) NOT NULL,
      created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.execute(`
    CREATE TABLE IF NOT EXISTS incowgnito_api_keys (
      id           VARCHAR(36) PRIMARY KEY,
      user_id      VARCHAR(36) NOT NULL,
      key_hash     VARCHAR(128) UNIQUE NOT NULL,
      name         VARCHAR(255) NOT NULL DEFAULT 'Default',
      created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_used_at DATETIME,
      FOREIGN KEY (user_id) REFERENCES incowgnito_users(id) ON DELETE CASCADE
    )
  `);

  console.log("Database migration complete");
};
