// lib/auth/index.ts
export { hashPassword, verifyPassword } from "./password";
export {
  createSession,
  validateSession,
  destroySession,
  cleanExpiredSessions,
  type SessionUser,
} from "./session";
export {
  requireAuth,
  requireRole,
  requireBroker,
  requireAgentOrBroker,
  requirePortalRole,
  requireWorkspace,
  isAuthError,
  logAuditEvent,
  SESSION_COOKIE,
} from "./middleware";
export {
  generatePortalToken,
  hashPortalToken,
  isPortalTokenExpired,
  PORTAL_TOKEN_TTL_MS,
} from "./portal-token";
