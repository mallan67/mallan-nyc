import http from "http";

export const config = {
  api: {
    bodyParser: false, // important: do not let Next parse the body
  },
};

export default function handler(req, res) {
  // quick debug
  console.log("Proxy incoming:", req.method, req.url);
  try { console.log("Proxy headers:", JSON.stringify(req.headers || {}, null, 2)); } catch(e){}

  // strip leading /api so backend sees /agents instead of /api/agents
  const forwardPath = (req.url || "").replace(/^\/api/, "") || "/";

  console.log("Proxy forwarding to:", forwardPath);

  const options = {
    hostname: "api",    // docker-compose service name
    port: 8000,
    path: forwardPath,
    method: req.method,
    headers: {
      ...req.headers,
      host: "api:8000", // ensure Host header points to the api service
    },
  };

  const proxyReq = http.request(options, (proxyRes) => {
    // forward status and headers
    res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
    // pipe api response back to client
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on("error", (err) => {
    console.error("Proxy request error:", err && (err.stack || err));
    res.statusCode = 502;
    res.end("Proxy error");
  });

  // pipe the raw incoming req into the proxy request so the body is forwarded intact
  req.pipe(proxyReq, { end: true });
}
