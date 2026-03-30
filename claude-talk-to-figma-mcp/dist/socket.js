// src/socket.ts
var logger = {
  info: (message, ...args) => {
    console.log(`[INFO] ${message}`, ...args);
  },
  debug: (message, ...args) => {
    console.log(`[DEBUG] ${message}`, ...args);
  },
  warn: (message, ...args) => {
    console.warn(`[WARN] ${message}`, ...args);
  },
  error: (message, ...args) => {
    console.error(`[ERROR] ${message}`, ...args);
  }
};
var channels = /* @__PURE__ */ new Map();
var stats = {
  totalConnections: 0,
  activeConnections: 0,
  messagesSent: 0,
  messagesReceived: 0,
  errors: 0
};
function handleConnection(ws) {
  stats.totalConnections++;
  stats.activeConnections++;
  const clientId = `client_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  ws.data = { clientId };
  logger.info(`New client connected: ${clientId}`);
  try {
    ws.send(JSON.stringify({
      type: "system",
      message: "Please join a channel to start communicating with Figma"
    }));
  } catch (error) {
    logger.error(`Failed to send welcome message to client ${clientId}:`, error);
    stats.errors++;
  }
  ws.close = () => {
    logger.info(`Client disconnected: ${clientId}`);
    stats.activeConnections--;
    channels.forEach((clients, channelName) => {
      if (clients.has(ws)) {
        clients.delete(ws);
        logger.debug(`Removed client ${clientId} from channel: ${channelName}`);
        try {
          clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({
                type: "system",
                message: "A client has left the channel",
                channel: channelName
              }));
              stats.messagesSent++;
            }
          });
        } catch (error) {
          logger.error(`Error notifying channel ${channelName} about client disconnect:`, error);
          stats.errors++;
        }
      }
    });
  };
}
var server = Bun.serve({
  port: 3055,
  // uncomment this to allow connections in windows wsl
  // hostname: "0.0.0.0",
  fetch(req, server2) {
    const url = new URL(req.url);
    logger.debug(`Received ${req.method} request to ${url.pathname}`);
    if (req.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization"
        }
      });
    }
    if (url.pathname === "/status") {
      return new Response(JSON.stringify({
        status: "running",
        uptime: process.uptime(),
        stats
      }), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      });
    }
    try {
      const success = server2.upgrade(req, {
        headers: {
          "Access-Control-Allow-Origin": "*"
        }
      });
      if (success) {
        return;
      }
    } catch (error) {
      logger.error("Failed to upgrade WebSocket connection:", error);
      stats.errors++;
      return new Response("Failed to upgrade to WebSocket", { status: 500 });
    }
    return new Response("Claude to Figma WebSocket server running. Try connecting with a WebSocket client.", {
      headers: {
        "Content-Type": "text/plain",
        "Access-Control-Allow-Origin": "*"
      }
    });
  },
  websocket: {
    open: handleConnection,
    message(ws, message) {
      try {
        stats.messagesReceived++;
        const clientId = ws.data?.clientId || "unknown";
        logger.debug(`Received message from client ${clientId}:`, typeof message === "string" ? message : "<binary>");
        const data = JSON.parse(message);
        if (data.type === "join") {
          const channelName = data.channel;
          if (!channelName || typeof channelName !== "string") {
            logger.warn(`Client ${clientId} attempted to join without a valid channel name`);
            ws.send(JSON.stringify({
              type: "error",
              message: "Channel name is required"
            }));
            stats.messagesSent++;
            return;
          }
          if (!channels.has(channelName)) {
            logger.info(`Creating new channel: ${channelName}`);
            channels.set(channelName, /* @__PURE__ */ new Set());
          }
          const channelClients = channels.get(channelName);
          channelClients.add(ws);
          logger.info(`Client ${clientId} joined channel: ${channelName}`);
          try {
            ws.send(JSON.stringify({
              type: "system",
              message: `Joined channel: ${channelName}`,
              channel: channelName
            }));
            stats.messagesSent++;
            ws.send(JSON.stringify({
              type: "system",
              message: {
                id: data.id,
                result: "Connected to channel: " + channelName
              },
              channel: channelName
            }));
            stats.messagesSent++;
            logger.debug(`Connection confirmation sent to client ${clientId} for channel ${channelName}`);
          } catch (error) {
            logger.error(`Failed to send join confirmation to client ${clientId}:`, error);
            stats.errors++;
          }
          try {
            let notificationCount = 0;
            channelClients.forEach((client) => {
              if (client !== ws && client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                  type: "system",
                  message: "A new client has joined the channel",
                  channel: channelName
                }));
                stats.messagesSent++;
                notificationCount++;
              }
            });
            if (notificationCount > 0) {
              logger.debug(`Notified ${notificationCount} other clients in channel ${channelName}`);
            }
          } catch (error) {
            logger.error(`Error notifying channel about new client:`, error);
            stats.errors++;
          }
          return;
        }
        if (data.type === "message") {
          const channelName = data.channel;
          if (!channelName || typeof channelName !== "string") {
            logger.warn(`Client ${clientId} sent message without a valid channel name`);
            ws.send(JSON.stringify({
              type: "error",
              message: "Channel name is required"
            }));
            stats.messagesSent++;
            return;
          }
          const channelClients = channels.get(channelName);
          if (!channelClients || !channelClients.has(ws)) {
            logger.warn(`Client ${clientId} attempted to send to channel ${channelName} without joining first`);
            ws.send(JSON.stringify({
              type: "error",
              message: "You must join the channel first"
            }));
            stats.messagesSent++;
            return;
          }
          try {
            let broadcastCount = 0;
            channelClients.forEach((client) => {
              if (client.readyState === WebSocket.OPEN) {
                logger.debug(`Broadcasting message to client in channel ${channelName}`);
                client.send(JSON.stringify({
                  type: "broadcast",
                  message: data.message,
                  sender: client === ws ? "You" : "User",
                  channel: channelName
                }));
                stats.messagesSent++;
                broadcastCount++;
              }
            });
            logger.info(`Broadcasted message to ${broadcastCount} clients in channel ${channelName}`);
          } catch (error) {
            logger.error(`Error broadcasting message to channel ${channelName}:`, error);
            stats.errors++;
          }
        }
        if (data.type === "progress_update") {
          const channelName = data.channel;
          if (!channelName || typeof channelName !== "string") {
            logger.warn(`Client ${clientId} sent progress update without a valid channel name`);
            return;
          }
          const channelClients = channels.get(channelName);
          if (!channelClients) {
            logger.warn(`Progress update for non-existent channel: ${channelName}`);
            return;
          }
          logger.debug(`Progress update for command ${data.id} in channel ${channelName}: ${data.message?.data?.status || "unknown"} - ${data.message?.data?.progress || 0}%`);
          try {
            channelClients.forEach((client) => {
              if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(data));
                stats.messagesSent++;
              }
            });
          } catch (error) {
            logger.error(`Error broadcasting progress update:`, error);
            stats.errors++;
          }
        }
      } catch (err) {
        stats.errors++;
        logger.error("Error handling message:", err);
        try {
          ws.send(JSON.stringify({
            type: "error",
            message: "Error processing your message: " + (err instanceof Error ? err.message : String(err))
          }));
          stats.messagesSent++;
        } catch (sendError) {
          logger.error("Failed to send error message to client:", sendError);
        }
      }
    },
    close(ws, code, reason) {
      const clientId = ws.data?.clientId || "unknown";
      logger.info(`WebSocket closed for client ${clientId}: Code ${code}, Reason: ${reason || "No reason provided"}`);
      channels.forEach((clients, channelName) => {
        if (clients.delete(ws)) {
          logger.debug(`Removed client ${clientId} from channel ${channelName} due to connection close`);
        }
      });
      stats.activeConnections--;
    },
    drain(ws) {
      const clientId = ws.data?.clientId || "unknown";
      logger.debug(`WebSocket backpressure relieved for client ${clientId}`);
    }
  }
});
logger.info(`Claude to Figma WebSocket server running on port ${server.port}`);
logger.info(`Status endpoint available at http://localhost:${server.port}/status`);
setInterval(() => {
  logger.info("Server stats:", {
    channels: channels.size,
    ...stats
  });
}, 5 * 60 * 1e3);
//# sourceMappingURL=socket.js.map