import * as Sentry from "@sentry/nextjs";

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN
  || "https://5b2db0ba2983a12487fa2914823cfc54@o4511043715596288.ingest.us.sentry.io/4511043784343552";

Sentry.init({
  dsn: SENTRY_DSN,

  tracesSampleRate: 0.1, // Edge middleware — keep sampling low

  environment: process.env.VERCEL_ENV || "development",
});
