// Microsoft Graph API client for Outlook email access
// Uses OAuth2 authorization code flow (delegated permissions)

const MS_CLIENT_ID = process.env.MS_CLIENT_ID!;
const MS_CLIENT_SECRET = process.env.MS_CLIENT_SECRET!;
const MS_TENANT_ID = process.env.MS_TENANT_ID!;
const MS_REDIRECT_URI = process.env.MS_REDIRECT_URI || "https://mallan.nyc/api/crm/outlook/callback";

const AUTHORITY = `https://login.microsoftonline.com/${MS_TENANT_ID}`;
const GRAPH_BASE = "https://graph.microsoft.com/v1.0";

// ── OAuth URLs ──────────────────────────────────────────────

export function getAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: MS_CLIENT_ID,
    response_type: "code",
    redirect_uri: MS_REDIRECT_URI,
    scope: "openid profile Mail.Read User.Read offline_access",
    response_mode: "query",
    state,
  });
  return `${AUTHORITY}/oauth2/v2.0/authorize?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string) {
  const body = new URLSearchParams({
    client_id: MS_CLIENT_ID,
    client_secret: MS_CLIENT_SECRET,
    code,
    redirect_uri: MS_REDIRECT_URI,
    grant_type: "authorization_code",
    scope: "openid profile Mail.Read User.Read offline_access",
  });

  const res = await fetch(`${AUTHORITY}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token exchange failed: ${res.status} ${err}`);
  }

  return res.json() as Promise<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
    token_type: string;
  }>;
}

export async function refreshAccessToken(refreshToken: string) {
  const body = new URLSearchParams({
    client_id: MS_CLIENT_ID,
    client_secret: MS_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
    scope: "openid profile Mail.Read User.Read offline_access",
  });

  const res = await fetch(`${AUTHORITY}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token refresh failed: ${res.status} ${err}`);
  }

  return res.json() as Promise<{
    access_token: string;
    refresh_token: string;
    expires_in: number;
  }>;
}

// ── Graph API Calls ─────────────────────────────────────────

async function graphFetch(accessToken: string, path: string) {
  const res = await fetch(`${GRAPH_BASE}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Graph API error ${res.status}: ${err}`);
  }
  return res.json();
}

export async function getMe(accessToken: string) {
  return graphFetch(accessToken, "/me") as Promise<{
    displayName: string;
    mail: string;
    userPrincipalName: string;
  }>;
}

export interface MailFolder {
  id: string;
  displayName: string;
  totalItemCount: number;
  unreadItemCount: number;
  childFolderCount: number;
}

export async function getMailFolders(accessToken: string): Promise<MailFolder[]> {
  const data = await graphFetch(
    accessToken,
    "/me/mailFolders?$top=50&$select=id,displayName,totalItemCount,unreadItemCount,childFolderCount"
  );
  return data.value || [];
}

export async function getChildFolders(accessToken: string, parentId: string): Promise<MailFolder[]> {
  const data = await graphFetch(
    accessToken,
    `/me/mailFolders/${parentId}/childFolders?$top=50&$select=id,displayName,totalItemCount,unreadItemCount,childFolderCount`
  );
  return data.value || [];
}

export interface MailMessage {
  id: string;
  subject: string;
  receivedDateTime: string;
  from: { emailAddress: { name: string; address: string } } | null;
  toRecipients: Array<{ emailAddress: { name: string; address: string } }>;
  ccRecipients: Array<{ emailAddress: { name: string; address: string } }>;
  body: { contentType: string; content: string };
}

export async function getMessages(
  accessToken: string,
  folderId: string,
  top: number = 50,
  skip: number = 0
): Promise<{ messages: MailMessage[]; total: number }> {
  const data = await graphFetch(
    accessToken,
    `/me/mailFolders/${folderId}/messages?$top=${top}&$skip=${skip}&$orderby=receivedDateTime desc&$select=id,subject,receivedDateTime,from,toRecipients,ccRecipients,body`
  );
  return { messages: data.value || [], total: data["@odata.count"] || data.value?.length || 0 };
}

// Strip HTML tags from email body to get plain text
export function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
