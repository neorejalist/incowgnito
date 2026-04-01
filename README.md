# Incowgnito

Self-hosted email alias service compatible with the [addy.io](https://addy.io) API. Runs as a sidecar to your existing [mailcow-dockerized](https://github.com/mailcow/mailcow-dockerized) installation.

Generate disposable forwarding aliases on demand — from [Bitwarden](https://bitwarden.com), other password managers with addy.io support, or the built-in web dashboard.

```
Bitwarden → POST /api/v1/aliases → Incowgnito → Mailcow API → alias@your-alias-domain.com → you@your-real-domain.com
```

## How It Works

Incowgnito plugs into your existing mailcow stack with zero additional infrastructure:

- **Authentication** — Mailcow OAuth, so any mailcow user can log in (no separate accounts)
- **Alias creation** — Uses the Mailcow API to provision real forwarding aliases
- **Alias storage** — Reads directly from mailcow's existing `alias` table (no duplication)
- **App data** — Stores only users and API keys in two prefixed tables (`incowgnito_*`) in mailcow's MariaDB
- **Networking** — Joins the existing `mailcow-network` and is reverse-proxied by `nginx-mailcow`

## Prerequisites

- A running [mailcow-dockerized](https://github.com/mailcow/mailcow-dockerized) installation
- A domain (or subdomain) for the alias service (e.g. `relay.example.com`)
- A domain for the generated aliases (e.g. `alias.example.com`)
- Docker Compose v2+

## Setup

### 1. Add the alias domain to Mailcow

In the Mailcow UI, go to **Mail Setup > Domains** and add your alias domain (e.g. `alias.example.com`). No mailboxes are needed — this domain is used for aliases only.

### 2. Create an OAuth2 application

In the Mailcow UI, go to **Admin > OAuth2 Apps > Add Application**:

- **Redirect URI:** `https://relay.example.com/auth/callback`
- Note the **Client ID** and **Client Secret**

### 3. Get a Mailcow API key

In the Mailcow UI, go to **Admin > API** and create a **Read/Write** API key.

### 4. Configure DNS & TLS

Point `relay.example.com` to your mailcow server (A/AAAA record or wildcard).

Ensure the domain is covered by your mailcow TLS certificate:

```bash
# Option A: Add to mailcow's certificate SANs
# Edit /opt/mailcow-dockerized/mailcow.conf
ADDITIONAL_SAN=relay.example.com,alias.example.com

cd /opt/mailcow-dockerized
docker compose run --rm certdumper

# Option B: If you already have a wildcard cert (*.example.com), skip this step.
```

### 5. Deploy

```bash
cd /opt/mailcow-dockerized

# Copy the compose override (extends mailcow's docker-compose.yml)
cp /path/to/incowgnito/deploy/docker-compose.override.yml .

# Copy the nginx reverse proxy config
cp /path/to/incowgnito/deploy/nginx-relay.conf data/conf/nginx/relay.conf
# Edit data/conf/nginx/relay.conf and replace the example domains with yours

# Create the environment file
cp /path/to/incowgnito/deploy/incowgnito.env.example incowgnito.env
```

Edit `incowgnito.env` with your values:

```env
MAILCOW_API_KEY=your-mailcow-admin-api-key
MAILCOW_OAUTH_CLIENT_ID=your-oauth-client-id
MAILCOW_OAUTH_CLIENT_SECRET=your-oauth-client-secret
RELAY_DOMAIN=alias.example.com
APP_URL=https://relay.example.com
SESSION_SECRET=          # generate with: openssl rand -hex 32
```

Database credentials (`DBUSER`, `DBPASS`, `DBNAME`) and `MAILCOW_HOSTNAME` are automatically inherited from `mailcow.conf` via the compose override — no need to duplicate them.

### 6. Start

```bash
cd /opt/mailcow-dockerized

docker compose pull incowgnito
docker compose up -d incowgnito

# Reload nginx to pick up the new proxy config
docker compose exec nginx-mailcow nginx -s reload
```

Visit `https://relay.example.com`, log in with your mailcow account, and create an API key from the dashboard.

### 7. Connect Bitwarden (or any addy.io-compatible client)

In your password manager, configure the addy.io integration:

| Field | Value |
|---|---|
| API URL | `https://relay.example.com` |
| API Key | *(copied from the Incowgnito dashboard)* |
| Default Domain | `alias.example.com` |

## Updating

```bash
cd /opt/mailcow-dockerized
docker compose pull incowgnito && docker compose up -d incowgnito
```

## API

All endpoints require `Authorization: Bearer <api_key>`.

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/account-details` | Account info |
| `GET` | `/api/v1/aliases` | List all aliases |
| `POST` | `/api/v1/aliases` | Create alias |
| `GET` | `/api/v1/aliases/:id` | Get alias by ID |
| `PATCH` | `/api/v1/aliases/:id` | Enable/disable alias |
| `DELETE` | `/api/v1/aliases/:id` | Delete alias |

**Create alias with custom local part:**

```bash
curl -X POST https://relay.example.com/api/v1/aliases \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"local_part": "shopping"}'
# → shopping@alias.example.com
```

Omit `local_part` to generate a random address.

## Configuration Reference

### Inherited from mailcow.conf

These are read automatically from `mailcow.conf` via the docker-compose `env_file` directive:

| Variable | Description |
|---|---|
| `MAILCOW_HOSTNAME` | Mailcow hostname (used for API calls and OAuth) |
| `DBNAME` | MariaDB database name |
| `DBUSER` | MariaDB user |
| `DBPASS` | MariaDB password |

### App-specific (incowgnito.env)

| Variable | Required | Description |
|---|---|---|
| `MAILCOW_API_KEY` | yes | Mailcow admin Read/Write API key |
| `MAILCOW_OAUTH_CLIENT_ID` | yes | OAuth2 client ID from step 2 |
| `MAILCOW_OAUTH_CLIENT_SECRET` | yes | OAuth2 client secret from step 2 |
| `RELAY_DOMAIN` | yes | Domain for generated aliases |
| `APP_URL` | yes | Public URL of this service |
| `SESSION_SECRET` | yes | Random secret (`openssl rand -hex 32`) |
| `PORT` | no | Internal port (default: `3000`) |

## Development

```bash
# Prerequisites: Bun (https://bun.sh)
bun install
bun run dev    # starts with --watch for auto-reload
```

The app expects a MariaDB instance and the environment variables listed above. For local development, you can point `DBHOST` at a local MariaDB or use Docker:

```bash
docker run -d --name mariadb-dev \
  -e MYSQL_ROOT_PASSWORD=root \
  -e MYSQL_DATABASE=mailcow \
  -e MYSQL_USER=mailcow \
  -e MYSQL_PASSWORD=mailcow \
  -p 3306:3306 \
  mariadb:11
```

Then set `DBHOST=localhost` in your environment.

## How It Stores Data

Incowgnito creates two tables in the existing mailcow MariaDB database:

- `incowgnito_users` — maps OAuth-authenticated users (email, username)
- `incowgnito_api_keys` — hashed API keys linked to users

Tables are created automatically on first startup (`CREATE TABLE IF NOT EXISTS`). Aliases are **not** duplicated — they're read directly from mailcow's own `alias` table, filtered by your relay domain.

## Project Structure

```
src/
├── index.ts                 # Express app entry point
├── config.ts                # Environment variable loader
├── db/
│   ├── connection.ts        # MariaDB connection pool
│   ├── migrate.ts           # Table creation
│   ├── users.ts             # User queries
│   └── api-keys.ts          # API key queries
├── middleware/
│   └── authenticate.ts      # Bearer token authentication
├── routes/
│   ├── auth.ts              # OAuth flow + API key management
│   ├── aliases.ts           # addy.io-compatible alias CRUD
│   └── account.ts           # Account details endpoint
├── services/
│   ├── mailcow.ts           # Mailcow HTTP API client
│   └── aliases.ts           # Read aliases from mailcow DB
└── utils/
    ├── crypto.ts            # Key generation and hashing
    └── format.ts            # Response formatters

public/
├── index.html               # Login page
└── dashboard.html           # Alias & API key management

deploy/
├── docker-compose.override.yml
├── nginx-relay.conf
└── incowgnito.env.example
```

## License

MIT
