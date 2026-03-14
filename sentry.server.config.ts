import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,

  tracesSampleRate: 0.2, // 20% server-side for API/cron performance

  environment: process.env.VERCEL_ENV || "development",

  // Strip PII from server-side events
  beforeSend(event) {
    if (event.request?.url) {
      event.request.url = event.request.url.split("?")[0];
    }
    if (event.request?.query_string) {
      event.request.query_string = undefined;
    }
    if (event.request?.cookies) {
      event.request.cookies = undefined;
    }
    if (event.request?.headers) {
      delete event.request.headers["cookie"];
      delete event.request.headers["authorization"];
    }
    return event;
  },
});
