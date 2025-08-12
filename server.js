const next = require('next');
const express = require('express');
const app = next({ dev: false, conf: { distDir: '.next' }});
const handle = app.getRequestHandler();
app.prepare().then(() => {
  const server = express();
  server.all('*', (req, res) => handle(req, res));
  const port = process.env.PORT || 3000;
  server.listen(port, () => console.log('Next.js running on', port));
});
