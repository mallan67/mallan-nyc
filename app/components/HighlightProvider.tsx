'use client';

import { HighlightInit } from "@highlight-run/next/client";

export default function HighlightProvider() {
  const projectId = process.env.NEXT_PUBLIC_HIGHLIGHT_PROJECT_ID;
  if (!projectId) return null;

  return (
    <HighlightInit
      projectId={projectId}
      serviceName="mallan-nyc"
      environment={process.env.NEXT_PUBLIC_VERCEL_ENV || "development"}
      tracingOrigins
      networkRecording={{
        enabled: true,
        recordHeadersAndBody: false, // PII safety
      }}
      privacySetting="strict" // Masks all text inputs (MLS/PII safety)
    />
  );
}
