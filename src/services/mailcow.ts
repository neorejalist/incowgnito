import axios, { type AxiosInstance } from "axios";
import https from "https";
import { config } from "../config";

const ALIAS_ACTIVE = 1;
const ALIAS_INACTIVE = 0;

let _apiClient: AxiosInstance | null = null;
let _oauthClient: AxiosInstance | null = null;

function getApiClient(): AxiosInstance {
  if (!_apiClient) {
    _apiClient = axios.create({
      baseURL: `https://${config.mailcow.host}/api/v1`,
      headers: {
        "X-API-Key": config.mailcow.apiKey,
        "Content-Type": "application/json",
      },
      httpsAgent: new https.Agent({ rejectUnauthorized: true }),
    });
  }
  return _apiClient;
}

function getOauthClient(): AxiosInstance {
  if (!_oauthClient) {
    _oauthClient = axios.create({
      baseURL: `https://${config.mailcow.host}`,
      httpsAgent: new https.Agent({ rejectUnauthorized: true }),
    });
  }
  return _oauthClient;
}

export const createAlias = async (
  address: string,
  goto: string
): Promise<{ id: number }> => {
  await getApiClient().post("/add/alias", {
    address,
    goto,
    active: ALIAS_ACTIVE,
  });

  const { data: allAliases } = await getApiClient().get("/get/alias/all");
  const created = allAliases.find(
    (a: { address: string }) => a.address === address
  );
  if (!created)
    throw new Error(`Alias ${address} created but could not be retrieved`);

  return { id: created.id };
};

export const deleteAlias = async (mailcowAliasId: number): Promise<void> => {
  await getApiClient().post("/delete/alias", [mailcowAliasId]);
};

export const setAliasActive = async (
  mailcowAliasId: number,
  active: boolean
): Promise<void> => {
  await getApiClient().post("/edit/alias", {
    items: [mailcowAliasId],
    attr: { active: active ? ALIAS_ACTIVE : ALIAS_INACTIVE },
  });
};

export const exchangeCodeForToken = async (
  code: string,
  redirectUri: string
): Promise<{ access_token: string }> => {
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: config.mailcow.oauthClientId,
    client_secret: config.mailcow.oauthClientSecret,
  });

  const { data } = await getOauthClient().post("/oauth/token", params.toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });

  return data;
};

export const getUserProfile = async (
  accessToken: string
): Promise<{ email: string; username: string }> => {
  const { data } = await getOauthClient().get("/oauth/profile", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  return data;
};
