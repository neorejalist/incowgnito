const HTML_ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export const escapeHtml = (str: string): string =>
  str.replace(/[&<>"']/g, (ch) => HTML_ESCAPE_MAP[ch]);

interface MailcowAlias {
  id: number;
  address: string;
  goto: string;
  active: number;
  created: string;
  modified: string;
}

interface AliasResponse {
  id: number;
  email: string;
  active: boolean;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export const toAliasResponse = (row: MailcowAlias): AliasResponse => ({
  id: row.id,
  email: row.address,
  active: row.active === 1,
  description: null,
  created_at: row.created,
  updated_at: row.modified,
});
