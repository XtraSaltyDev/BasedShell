#!/usr/bin/env node
import net from 'node:net';

const PORT = 5173;
const HOST = '127.0.0.1';

function fail(message) {
  console.error(`[dev:preflight] ${message}`);
  process.exit(1);
}

const server = net.createServer();

server.once('error', (error) => {
  if (error && typeof error === 'object' && 'code' in error && error.code === 'EADDRINUSE') {
    fail(
      `Port ${PORT} is already in use. Stop the process using ${PORT} (for example: lsof -nP -iTCP:${PORT} -sTCP:LISTEN) and retry.`
    );
    return;
  }

  fail(`Unable to validate port ${PORT}: ${String(error)}`);
});

server.once('listening', () => {
  server.close(() => {
    process.exit(0);
  });
});

server.listen(PORT, HOST);
