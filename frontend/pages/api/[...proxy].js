import httpProxy from "http-proxy";

const proxy = httpProxy.createProxyServer();

export const config = {
  api: {
    bodyParser: false,
  },
};

export default function handler(req, res) {
  return new Promise((resolve) => {
    proxy.web(req, res, { target: "http://api:8000" }, (err) => {
      console.error("Proxy error:", err);
      res.status(500).end("Proxy error");
      resolve();
    });
  });
}
