// lib/auth/index.ts
export { hashPassword, verifyPassword } from "./password";
export {
  createSession,
  validateSession,
  destroySession,
  cleanExpiredSessions,
  isPrincipalBrokerRole,
  BrokerSessionAssuranceError,
  type BrokerSessionAssurance,
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
export {
  generateOtpCode,
  sendOtpEmail,
  sendOtpSms,
  MFA_SESSION_TTL_MS,
  MFA_MAX_ATTEMPTS,
} from "./mfa";
