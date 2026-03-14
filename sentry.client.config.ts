import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,

  tracesSampleRate: 0.1, // 10% of transactions for performance monitoring
  replaysSessionSampleRate: 0,   // Don't record replays (PostHog handles this)
  replaysOnErrorSampleRate: 0.5, // 50% replay capture on errors

  environment: process.env.NEXT_PUBLIC_VERCEL_ENV || "development",

  // Strip PII — never send MLS data, user emails, or query params
  beforeSend(event) {
    // Remove query strings from URLs (may contain search filters)
    if (event.request?.url) {
      event.request.url = event.request.url.split("?")[0];
    }
    if (event.request?.query_string) {
      event.request.query_string = undefined;
    }
    return event;
  },

  ignoreErrors: [
    // Browser extensions and noise
    "ResizeObserver loop",
    "Non-Error promise rejection",
    "Load failed",
    "Failed to fetch",
    // Next.js navigation (not real errors)
    "NEXT_REDIRECT",
    "NEXT_NOT_FOUND",
  ],
});
