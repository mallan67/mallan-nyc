import * as Sentry from "@sentry/nextjs";

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN
  || "https://5b2db0ba2983a12487fa2914823cfc54@o4511043715596288.ingest.us.sentry.io/4511043784343552";

Sentry.init({
  dsn: SENTRY_DSN,

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
