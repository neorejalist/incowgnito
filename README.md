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

### 4. Configure DNS

#### App domain (`relay.example.com`)

Point `relay.example.com` to your mailcow server with an A (and/or AAAA) record.

#### Alias domain (`alias.example.com`)

The alias domain needs MX records so that incoming mail is routed to your mailcow server:

| Type | Name | Value | Priority |
|---|---|---|---|
| MX | `alias.example.com` | `mail.example.com` | 10 |
| TXT | `alias.example.com` | `v=spf1 include:mail.example.com ~all` | — |

Replace `mail.example.com` with your mailcow hostname. The SPF record ensures forwarded replies aren't flagged as spam.

If your mailcow instance uses DKIM, no extra DKIM setup is needed for the alias domain — mailcow signs outbound mail with the sending domain's key, and aliases only forward inbound mail.

#### TLS

Ensure both domains are covered by your mailcow TLS certificate:

```bash
# Option A: Add to mailcow's certificate SANs
# Edit /opt/mailcow-dockerized/mailcow.conf
ADDITIONAL_SAN=relay.example.com,alias.example.com

cd /opt/mailcow-dockerized
docker compose run --rm certdumper

# Option B: If you already have a wildcard cert (*.example.com), skip this step.
```

### 5. Run the setup script

The interactive setup script handles everything: configuration, database user, nginx, SSL, and container startup.

```bash
cd /opt/mailcow-dockerized
curl -sLO https://raw.githubusercontent.com/neorejalist/incowgnito/main/deploy/setup.sh && bash setup.sh
```

The script will ask for your app domain, alias domain, API key, and OAuth credentials. It then:

1. Generates a dedicated database user and session secret
2. Writes `incowgnito.conf`
3. Updates (or creates) `docker-compose.override.yml` — backs up existing file first, validates after merging, and rolls back if parsing fails
4. Writes the nginx reverse proxy config
5. Adds your domains to `ADDITIONAL_SAN` in `mailcow.conf` and runs certdumper
6. Creates the database user and tables with minimal privileges
7. Pulls and starts the container

### 6. Connect Bitwarden (or any addy.io-compatible client)

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
| `DBUSER` | MariaDB admin user (used by setup script only) |
| `DBPASS` | MariaDB admin password (used by setup script only) |

### App-specific (incowgnito.conf)

| Variable | Required | Description |
|---|---|---|
| `MAILCOW_API_KEY` | yes | Mailcow admin Read/Write API key |
| `MAILCOW_OAUTH_CLIENT_ID` | yes | OAuth2 client ID from step 2 |
| `MAILCOW_OAUTH_CLIENT_SECRET` | yes | OAuth2 client secret from step 2 |
| `RELAY_DOMAIN` | yes | Domain for generated aliases |
| `APP_URL` | yes | Public URL of this service |
| `INCOWGNITO_DB_USER` | yes | Dedicated DB user (created by setup script) |
| `INCOWGNITO_DB_PASSWORD` | yes | DB password (`openssl rand -hex 16`) |
| `SESSION_SECRET` | yes | Session secret (`openssl rand -hex 32`) |
| `PORT` | no | Internal port (default: `3000`) |

## Development

```bash
npm install
npm run dev    # starts with --watch for auto-reload
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

Incowgnito uses two tables in the existing mailcow MariaDB database, created by the setup script:

- `incowgnito_users` — maps OAuth-authenticated users (email, username)
- `incowgnito_api_keys` — hashed API keys linked to users

The app connects with a dedicated DB user that has **read-only** access to mailcow's `alias` table and **read/write** access to its own tables. Aliases are **not** duplicated — they're read directly from mailcow's own `alias` table, filtered by your relay domain.

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
├── incowgnito.conf.example
└── setup.sh
```

## Roadmap

### Send-as support for aliases

Aliases are currently receive-only (forwarding). A planned toggle in the dashboard will let users enable "send as" on individual aliases via the Mailcow API. This is useful when a service requires proof that you own the address (e.g. a company asking you to send a verification email from it).

### Custom branding

A mountable `/assets` volume will allow full visual customisation:

```
assets/
├── branding.json        # App name, colors, footer text
├── img/                 # Logo, favicon, background
└── css/                 # Style overrides
```

Mount it in your `docker-compose.override.yml` and Incowgnito will pick up your branding automatically — no fork needed.

## Support

If you find Incowgnito useful, consider supporting development:

[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-support-yellow?style=flat-square)](https://buy.stripe.com/3cI00ia2Peir2y65hx9AA07)

## License

MIT
