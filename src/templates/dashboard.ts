import { escapeHtml } from "../utils/format";

interface DashboardParams {
  serviceName: string;
  userEmail: string;
  aliasListHtml: string;
  keyListHtml: string;
}

export const dashboardPage = (p: DashboardParams): string => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(p.serviceName)} - Dashboard</title>
  <link rel="stylesheet" href="/assets/css/reset.css">
  <link rel="stylesheet" href="/assets/css/typography.css">
  <link rel="stylesheet" href="/assets/css/layout.css">
  <link rel="stylesheet" href="/assets/css/buttons.css">
  <link rel="stylesheet" href="/assets/css/forms.css">
  <link rel="stylesheet" href="/assets/css/cards.css">
  <link rel="stylesheet" href="/assets/css/badges.css">
  <link rel="stylesheet" href="/assets/css/toast.css">
</head>
<body>
  <div class="header">
    <div class="header-brand">
      <img src="/assets/img/logo.svg" alt="Logo" class="header-logo">
      <h1>${escapeHtml(p.serviceName)}</h1>
    </div>
    <div class="header-right">
      <span class="user-email">${escapeHtml(p.userEmail)}</span>
      <a href="/auth/logout" class="btn btn-ghost btn-sm">Logout</a>
    </div>
  </div>

  <main>
    <div class="section">
      <h2>Aliases</h2>
      <form class="form-row" hx-post="/auth/aliases-create" hx-target="#aliasList" hx-swap="innerHTML">
        <input type="text" name="local_part" placeholder="Custom local part (leave blank for random)">
        <button class="btn btn-primary" type="submit">Create Alias</button>
      </form>
      <div id="aliasList">${p.aliasListHtml}</div>
    </div>

    <div class="section">
      <h2>API Keys</h2>
      <p style="color:#94a3b8;font-size:0.85rem;margin-bottom:0.75rem;">Use these keys with Bitwarden&#39;s addy.io integration.</p>
      <form class="form-row" hx-post="/auth/api-keys" hx-target="#keySection" hx-swap="innerHTML">
        <input type="text" name="name" placeholder="Key name (e.g. Bitwarden)">
        <button class="btn btn-primary" type="submit">Create Key</button>
      </form>
      <div id="keySection">
        <div id="keyList">${p.keyListHtml}</div>
      </div>
    </div>
  </main>

  <div class="toast" id="toast"></div>

  <script src="/js/htmx.min.js"></script>
  <script src="/js/toast.js"></script>
</body>
</html>`;
