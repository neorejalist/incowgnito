import { escapeHtml } from "../utils/format";

interface KeyView {
  id: string;
  name: string;
  created_at: string;
}

export const keyList = (keys: KeyView[]): string => {
  if (!keys.length) {
    return '<p class="empty">No API keys yet.</p>';
  }

  return keys
    .map(
      (k) => `
    <div class="card">
      <div class="key-row">
        <div>
          <strong>${escapeHtml(k.name)}</strong>
          <span class="key-meta"> &mdash; created ${escapeHtml(new Date(k.created_at).toLocaleDateString())}</span>
        </div>
        <button class="btn btn-danger btn-sm"
          hx-delete="/auth/api-keys/${escapeHtml(k.id)}"
          hx-target="#keyList"
          hx-swap="innerHTML"
          hx-confirm="Delete this API key?">Delete</button>
      </div>
    </div>`
    )
    .join("");
};

export const newKeyDisplay = (rawKey: string): string => `
  <div class="card">
    <strong>New API key created &mdash; copy it now, it won&#39;t be shown again:</strong>
    <div class="key-display">${escapeHtml(rawKey)}</div>
  </div>`;
