/**
 * Next.js instrumentation file — runs once when the server starts.
 * Used by Highlight.io for server-side error capture.
 */
export async function register() {
  const projectId = process.env.NEXT_PUBLIC_HIGHLIGHT_PROJECT_ID;
  if (!projectId) return;

  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { registerHighlight } = await import("@highlight-run/next/server");
    registerHighlight({ projectID: projectId });
  }
}
