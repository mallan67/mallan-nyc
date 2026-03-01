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
  isAuthError,
  logAuditEvent,
  SESSION_COOKIE,
} from "./middleware";
