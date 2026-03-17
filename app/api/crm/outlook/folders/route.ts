// GET /api/crm/outlook/folders
// Returns the user's Outlook mail folder tree
// Query: ?parent=FOLDER_ID for child folders
import { NextRequest, NextResponse } from "next/server";
import { requireAgentOrBroker, isAuthError } from "@/lib/auth";
import { getOutlookToken } from "@/lib/outlook/get-token";
import { getMailFolders, getChildFolders, getMe } from "@/lib/outlook/graph-client";

export async function GET(req: NextRequest) {
  const auth = await requireAgentOrBroker(req);
  if (isAuthError(auth)) return auth;

  const token = await getOutlookToken(BigInt(auth.userId));
  if (!token) {
    return NextResponse.json({ connected: false, error: "Outlook not connected" }, { status: 401 });
  }

  const parentId = req.nextUrl.searchParams.get("parent");

  try {
    const folders = parentId
      ? await getChildFolders(token, parentId)
      : await getMailFolders(token);

    // Also return connection info on root request
    if (!parentId) {
      const me = await getMe(token).catch(() => null);
      return NextResponse.json({
        connected: true,
        email: me?.mail || me?.userPrincipalName || null,
        displayName: me?.displayName || null,
        folders,
      });
    }

    return NextResponse.json({ folders });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
