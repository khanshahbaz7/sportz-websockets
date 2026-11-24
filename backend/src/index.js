import express from "express";
import { matchRouter } from "./routes/matches.js";
import http from 'http'
import { attachWebSocketServer } from "./ws/server.js";
import { securityMiddleware } from "./arcjet.js";
import { commentaryRouter } from "./routes/commentary.js";
import { startSportScorePoller } from "./services/sportscore/sync.js";
import { pool } from "./db/db.js";

const PORT = Number(process.env.PORT || 8000);
const HOST = process.env.HOST || '0.0.0.0'

const app = express();
const server = http.createServer(app);



app.use(express.json());

app.get("/", (req, res) => {
  res.send("Sportz API is running");
});

app.use(securityMiddleware());

app.use("/matches", matchRouter);
app.use("/matches/:id/commentary", commentaryRouter);

const {broadcastMatchCreated, broadcastCommentary, broadcastMatchUpdate} = attachWebSocketServer(server);

app.locals.broadcastMatchCreated = broadcastMatchCreated;
app.locals.broadcastCommentary = broadcastCommentary;
app.locals.broadcastMatchUpdate = broadcastMatchUpdate;

let sportScorePoller = null;
let shuttingDown = false;

server.listen(PORT, HOST, () => {
  const baseUrl = HOST === '0.0.0.0' ? `http://localhost:${PORT}` : `http://${HOST}:${PORT}`;

  console.log(`Server is listening on ${baseUrl}`);
  console.log(`WebSocket Server is running on ${baseUrl.replace('http', 'ws')}/ws`)

  sportScorePoller = startSportScorePoller({
    broadcast: {
      matchCreated: broadcastMatchCreated,
      commentary: broadcastCommentary,
      matchUpdated: broadcastMatchUpdate,
    },
  });
});

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`Received ${signal}; shutting down.`);

  if (sportScorePoller) {
    sportScorePoller.stop();
  }

  await new Promise((resolve) => server.close(resolve));

  try {
    await pool.end();
  } catch (error) {
    console.error('Failed to close database pool', error);
  }

  process.exit(0);
}

process.on('SIGINT', () => {
  shutdown('SIGINT').catch((error) => {
    console.error('Shutdown failed', error);
    process.exit(1);
  });
});

process.on('SIGTERM', () => {
  shutdown('SIGTERM').catch((error) => {
    console.error('Shutdown failed', error);
    process.exit(1);
  });
});

// The API must stay alive for the live feed and commentary to keep working.
// Network-level failures inside upstream clients (Arcjet, SportScore, DB pool)
// can surface as unhandled stream errors; never let those kill the server.
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception survived:', error);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection survived:', reason);
});