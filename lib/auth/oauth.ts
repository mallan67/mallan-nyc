// lib/auth/oauth.ts
// Shared helpers for OAuth sign-in flows

import prisma from "@/lib/prisma";
import { createSession, isPrincipalBrokerRole, SESSION_COOKIE } from "@/lib/auth";
import { NextResponse } from "next/server";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://mallan.nyc";

export { SITE_URL };

interface OAuthProfile {
  email: string;
  firstName: string;
  lastName: string;
  picture?: string;
  provider: string;
}

/**
 * After OAuth, find or create the user and set session cookie.
 * Tries Agent table first, then Lead table (same as login "auto" mode).
 * If no account exists, creates a Lead (client) — they'll pick role on first visit.
 */
export async function handleOAuthLogin(profile: OAuthProfile) {
  const normalizedEmail = profile.email.trim().toLowerCase();

  // 1. Check Agent table
  const agent = await prisma.agent.findUnique({
    where: { email: normalizedEmail },
  });

  if (agent) {
    if (agent.status !== "active") {
      return NextResponse.redirect(
        `${SITE_URL}/sign-in?error=Account+is+inactive+or+suspended`
      );
    }

    // ── OAuth identity alone must NOT mint a principal-broker session ──
    // Google, Facebook and LinkedIn all funnel through this one helper, so the
    // correction belongs here rather than in three callback copies. Proving
    // control of an email address at an identity provider is not broker MFA.
    // Fail closed: send the broker through the standard password + OTP sign-in.
    // No privileged token is placed in a URL and no second MFA state machine is
    // introduced. Non-broker agents are unaffected.
    if (isPrincipalBrokerRole(agent.role)) {
      return NextResponse.redirect(
        `${SITE_URL}/sign-in?error=Broker+accounts+must+sign+in+with+a+password+and+verification+code`
      );
    }

    const token = await createSession("agent", agent.id, agent.role);
    await prisma.agent.update({
      where: { id: agent.id },
      data: { last_login: new Date() },
    });

    const res = NextResponse.redirect(
      `${SITE_URL}/crm/dashboard`
    );
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 24 * 60 * 60,
    });
    return res;
  }

  // 2. Check Lead table
  let lead = await prisma.lead.findUnique({
    where: { email: normalizedEmail },
  });

  if (!lead) {
    // Create new lead — no password (OAuth only), role TBD
    lead = await prisma.lead.create({
      data: {
        first_name: profile.firstName || "User",
        last_name: profile.lastName || "",
        email: normalizedEmail,
        phone: "",
        password_hash: null,
        roles: [],
        portal_role: null,
        status: "new",
        source: `oauth_${profile.provider}`,
      },
    });

    // New user — redirect to complete profile (pick role + add phone)
    const token = await createSession("lead", lead.id, "buyer");
    const res = NextResponse.redirect(`${SITE_URL}/portal/complete-profile`);
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 24 * 60 * 60,
    });
    return res;
  }

  // Existing lead — sign in
  const role = lead.portal_role || "buyer";
  const token = await createSession("lead", lead.id, role);

  // If they still need to pick a role or add phone, redirect to complete profile
  const needsProfile = !lead.portal_role || !lead.phone;
  const redirectUrl = needsProfile
    ? `${SITE_URL}/portal/complete-profile`
    : `${SITE_URL}/portal`;

  const res = NextResponse.redirect(redirectUrl);
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 24 * 60 * 60,
  });
  return res;
}
