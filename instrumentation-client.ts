// Client-side instrumentation — Sentry temporarily disabled to fix React 19 hydration crash
// The Sentry client SDK patches React internals and starts DOM-modifying replays on errors,
// which cascades with React 19's streaming SSR $RS resolution → Error #300.
//
// import * as Sentry from "@sentry/nextjs";
// import "./sentry.client.config";
// export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
