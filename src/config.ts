const required = (key: string): string => {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env var: ${key}`);
  return value;
};

export const config = {
  mailcow: {
    host: required("MAILCOW_HOSTNAME"),
    apiKey: required("MAILCOW_API_KEY"),
    oauthClientId: required("MAILCOW_OAUTH_CLIENT_ID"),
    oauthClientSecret: required("MAILCOW_OAUTH_CLIENT_SECRET"),
  },
  db: {
    host: process.env.DBHOST ?? "mysql-mailcow",
    port: Number(process.env.DBPORT ?? 3306),
    name: process.env.DBNAME ?? "mailcow",
    user: required("INCOWGNITO_DB_USER"),
    password: required("INCOWGNITO_DB_PASSWORD"),
  },
  relay: {
    domain: required("RELAY_DOMAIN"),
  },
  app: {
    url: required("APP_URL"),
    port: Number(process.env.PORT ?? 3000),
    sessionSecret: required("SESSION_SECRET"),
    isProduction: process.env.NODE_ENV === "production",
  },
} as const;
