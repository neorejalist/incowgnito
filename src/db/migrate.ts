import { pool } from "./connection";

export const migrate = async () => {
  const [rows] = await pool.execute(
    "SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'incowgnito_users'"
  );

  if ((rows as any)[0].count === 0) {
    throw new Error(
      "incowgnito_users table not found. Run the setup script first: " +
      "curl -sLO https://raw.githubusercontent.com/neorejalist/incowgnito/main/deploy/setup.sh && bash setup.sh"
    );
  }

  console.log("Database tables verified");
};
