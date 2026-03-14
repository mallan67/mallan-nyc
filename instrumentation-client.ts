// This file is loaded on the client side to initialize Sentry.
// Next.js 15+ requires this file for client-side instrumentation.
import * as Sentry from "@sentry/nextjs";
import "./sentry.client.config";

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
