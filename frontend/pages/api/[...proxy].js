import httpProxy from "http-proxy";

const proxy = httpProxy.createProxyServer();

// Disable body parsing so the proxy forwards the raw body
export const config = {
  api: {
    bodyParser: false,
  },
};

export default function handler(req, res) {
  // Remove the /api prefix so backend sees /agents, /leads, etc.
  // If your frontend requests /api/agents, this turns it into /agents.
  req.url = req.url.replace(/^\/api/, "") || "/";

  return new Promise((resolve) => {
    proxy.web(
      req,
      res,
      { target: "http://api:8000", changeOrigin: true },
      (err) => {
        console.error("Proxy error:", err);
        // Give a useful response for debugging in the UI
        res.statusCode = 502;
        res.end("Proxy error");
        resolve();
      }
    );
  });
}
