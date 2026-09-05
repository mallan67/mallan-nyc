// lib/auth/index.ts
export { hashPassword, verifyPassword } from "./password";
export {
  createSession,
  createSessionRecord,
  validateSession,
  destroySession,
  cleanExpiredSessions,
  endDelegationAndRotateParent,
  DelegationRefusedError,
  DELEGATED_SESSION_MAX_MS,
  isDelegationTargetRole,
  type SessionUser,
  type DelegationSpec,
  type CreatedSession,
  type RestoredParentSession,
} from "./session";
export {
  requireAuth,
  requireRole,
  requireBroker,
  requireNonDelegatedBroker,
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
