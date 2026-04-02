const required = (key: string): string => {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env var: ${key}`);
  return value;
};

interface Config {
  mailcow: {
    host: string;
    apiKey: string;
    oauthClientId: string;
    oauthClientSecret: string;
  };
  db: {
    host: string;
    port: number;
    name: string;
    user: string;
    password: string;
  };
  relay: {
    domain: string;
  };
  app: {
    url: string;
    port: number;
    sessionSecret: string;
    isProduction: boolean;
    assetsPath: string;
  };
}

const ASSETS_PATH_PRODUCTION = "/app/assets";
const ASSETS_PATH_DEVELOPMENT = "./assets";

let _config: Config | null = null;

function loadConfig(): Config {
  const isProduction = process.env.NODE_ENV === "production";

  return {
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
      isProduction,
      assetsPath: process.env.ASSETS_PATH ?? (isProduction ? ASSETS_PATH_PRODUCTION : ASSETS_PATH_DEVELOPMENT),
    },
  };
}

export const config: Config = {
  get mailcow() { if (!_config) _config = loadConfig(); return _config.mailcow; },
  get db() { if (!_config) _config = loadConfig(); return _config.db; },
  get relay() { if (!_config) _config = loadConfig(); return _config.relay; },
  get app() { if (!_config) _config = loadConfig(); return _config.app; },
};
