import { escapeHtml } from "../utils/format";

interface AliasView {
  id: number;
  email: string;
  active: boolean;
}

export const aliasList = (aliases: AliasView[]): string => {
  if (!aliases.length) {
    return '<p class="empty">No aliases yet.</p>';
  }

  return aliases
    .map(
      (a) => `
    <div class="card">
      <div class="alias-row">
        <span class="alias-address">${escapeHtml(a.email)}</span>
        <div class="alias-actions">
          <span class="badge ${a.active ? "badge-active" : "badge-inactive"}">${a.active ? "Active" : "Inactive"}</span>
          <button class="btn btn-ghost btn-sm"
            hx-patch="/auth/aliases-toggle/${a.id}"
            hx-target="#aliasList"
            hx-swap="innerHTML">${a.active ? "Disable" : "Enable"}</button>
          <button class="btn btn-danger btn-sm"
            hx-delete="/auth/aliases-delete/${a.id}"
            hx-target="#aliasList"
            hx-swap="innerHTML"
            hx-confirm="Delete this alias? Emails sent to it will stop working.">Delete</button>
        </div>
      </div>
    </div>`
    )
    .join("");
};
