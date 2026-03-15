/**
 * Sentry error reporting helper for API routes.
 * Captures exceptions with context so they appear in Sentry Issues.
 */
import * as Sentry from "@sentry/nextjs";

/**
 * Report an error to Sentry with API route context.
 * Call this in catch blocks of API route handlers.
 */
export function reportApiError(
  error: unknown,
  context: {
    route: string;
    method?: string;
    userId?: bigint | string;
    extra?: Record<string, unknown>;
  }
) {
  const err = error instanceof Error ? error : new Error(String(error));

  Sentry.withScope((scope) => {
    scope.setTag("api.route", context.route);
    if (context.method) scope.setTag("api.method", context.method);
    if (context.userId) scope.setUser({ id: String(context.userId) });
    if (context.extra) scope.setExtras(context.extra);
    Sentry.captureException(err);
  });
}
