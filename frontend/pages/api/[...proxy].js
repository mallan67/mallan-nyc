import http from "http";

export const config = {
  api: {
    bodyParser: false, // important: we stream the body
  },
};

export default function handler(req, res) {
  console.log("Proxy incoming:", req.method, req.url);
  try { console.log("Proxy headers:", JSON.stringify(req.headers || {}, null, 2)); } catch (e) {}

  const forwardPath = (req.url || "").replace(/^\/api/, "") || "/";

  // clone & sanitize headers
  const headers = Object.assign({}, req.headers || {});
  // remove hop-by-hop / problematic headers
  ["connection","expect","x-invoke-path","x-invoke-query","x-middleware-invoke","x-forwarded-for","x-forwarded-host","x-forwarded-proto","x-forwarded-port"].forEach(h => delete headers[h]);
  // ensure host points to the backend service name inside docker
  headers["host"] = "api:8000";

  const options = {
    hostname: "api",
    port: 8000,
    path: forwardPath,
    method: req.method,
    headers,
  };

  const proxyReq = http.request(options, (proxyRes) => {
    // forward status + headers
    res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on("error", (err) => {
    console.error("Proxy request error:", err && (err.stack || err));
    if (!res.headersSent) {
      res.writeHead(502, { "content-type": "text/plain" });
    }
    res.end("Proxy error");
  });

  // stream the incoming request body directly to the upstream.
  req.pipe(proxyReq, { end: true });
}