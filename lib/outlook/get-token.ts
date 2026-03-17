// Get a valid Outlook access token for an agent, refreshing if expired
import prisma from "@/lib/prisma";
import { refreshAccessToken } from "./graph-client";

export async function getOutlookToken(agentId: bigint): Promise<string | null> {
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: {
      outlook_access_token: true,
      outlook_refresh_token: true,
      outlook_token_expires_at: true,
    },
  });

  if (!agent?.outlook_access_token || !agent?.outlook_refresh_token) {
    return null; // Not connected
  }

  // Check if token is still valid (with 5-min buffer)
  const expiresAt = agent.outlook_token_expires_at?.getTime() || 0;
  if (Date.now() < expiresAt - 5 * 60 * 1000) {
    return agent.outlook_access_token;
  }

  // Token expired — refresh it
  try {
    const tokens = await refreshAccessToken(agent.outlook_refresh_token);
    await prisma.agent.update({
      where: { id: agentId },
      data: {
        outlook_access_token: tokens.access_token,
        outlook_refresh_token: tokens.refresh_token,
        outlook_token_expires_at: new Date(Date.now() + tokens.expires_in * 1000),
      },
    });
    return tokens.access_token;
  } catch (err) {
    console.error("Outlook token refresh failed:", err);
    // Clear stale tokens
    await prisma.agent.update({
      where: { id: agentId },
      data: {
        outlook_access_token: null,
        outlook_refresh_token: null,
        outlook_token_expires_at: null,
      },
    });
    return null;
  }
}
