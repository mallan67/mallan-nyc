import httpProxy from "http-proxy";

const proxy = httpProxy.createProxyServer();

export const config = {
  api: {
    bodyParser: false,
  },
};

export default function handler(req, res) {
  // DEBUG: quick summarized view
  console.log("Proxy incoming:", req.method, req.url);

  // show request headers so we can spot who called (host, referrer, x-forwarded headers)
  try {
    console.log("Proxy headers:", JSON.stringify(req.headers || {}, null, 2));
  } catch(e) { console.log("Proxy headers: (unserializable)"); }

  // remote address inside container (useful when debugging from within containers)
  try {
    console.log("Proxy remoteAddress:", (req.socket && req.socket.remoteAddress) || (req.connection && req.connection.remoteAddress));
  } catch(e) {}

  // strip leading /api so backend sees /agents instead of /api/agents
  req.url = (req.url || "").replace(/^\/api/, "") || "/";

  // DEBUG: show the path we'll forward to backend
  console.log("Proxy forwarded url:", req.method, req.url);

  return new Promise((resolve) => {
    proxy.web(req, res, { target: "http://api:8000", changeOrigin: true }, (err) => {
      console.error("Proxy error:", err && (err.stack || err));
      res.statusCode = 502;
      res.end("Proxy error");
      resolve();
    });
  });
}