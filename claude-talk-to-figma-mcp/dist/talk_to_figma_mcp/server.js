#!/usr/bin/env node

// src/talk_to_figma_mcp/server.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// src/talk_to_figma_mcp/config/config.ts
var args = process.argv.slice(2);
var serverArg = args.find((arg) => arg.startsWith("--server="));
var portArg = args.find((arg) => arg.startsWith("--port="));
var reconnectArg = args.find((arg) => arg.startsWith("--reconnect-interval="));
var serverUrl = serverArg ? serverArg.split("=")[1] : "localhost";
var defaultPort = portArg ? parseInt(portArg.split("=")[1], 10) : 3055;
var reconnectInterval = reconnectArg ? parseInt(reconnectArg.split("=")[1], 10) : 2e3;
var WS_URL = serverUrl === "localhost" ? `ws://${serverUrl}` : `wss://${serverUrl}`;
var SERVER_CONFIG = {
  name: "ClaudeTalkToFigmaMCP",
  description: "Claude MCP Plugin for Figma",
  version: "0.4.0"
};

// src/talk_to_figma_mcp/utils/logger.ts
var logger = {
  info: (message) => process.stderr.write(`[INFO] ${message}
`),
  debug: (message) => process.stderr.write(`[DEBUG] ${message}
`),
  warn: (message) => process.stderr.write(`[WARN] ${message}
`),
  error: (message) => process.stderr.write(`[ERROR] ${message}
`),
  log: (message) => process.stderr.write(`[LOG] ${message}
`)
};

// src/talk_to_figma_mcp/utils/websocket.ts
import WebSocket from "ws";
import { v4 as uuidv4 } from "uuid";
var ws = null;
var currentChannel = null;
var pendingRequests = /* @__PURE__ */ new Map();
function connectToFigma(port = defaultPort) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    logger.info("Already connected to Figma");
    return;
  }
  if (ws && ws.readyState === WebSocket.CONNECTING) {
    logger.info("Connection to Figma is already in progress");
    return;
  }
  if (ws && (ws.readyState === WebSocket.CLOSING || ws.readyState === WebSocket.CLOSED)) {
    ws.removeAllListeners();
    ws = null;
  }
  const wsUrl = serverUrl === "localhost" ? `${WS_URL}:${port}` : WS_URL;
  logger.info(`Connecting to Figma socket server at ${wsUrl}...`);
  try {
    ws = new WebSocket(wsUrl);
    const connectionTimeout = setTimeout(() => {
      if (ws && ws.readyState === WebSocket.CONNECTING) {
        logger.error("Connection to Figma timed out");
        ws.terminate();
      }
    }, 1e4);
    ws.on("open", () => {
      clearTimeout(connectionTimeout);
      logger.info("Connected to Figma socket server");
      currentChannel = null;
    });
    ws.on("message", (data) => {
      try {
        const json = JSON.parse(data);
        if (json.type === "progress_update") {
          const progressData = json.message.data;
          const requestId = json.id || "";
          if (requestId && pendingRequests.has(requestId)) {
            const request = pendingRequests.get(requestId);
            request.lastActivity = Date.now();
            clearTimeout(request.timeout);
            request.timeout = setTimeout(() => {
              if (pendingRequests.has(requestId)) {
                logger.error(`Request ${requestId} timed out after extended period of inactivity`);
                pendingRequests.delete(requestId);
                request.reject(new Error("Request to Figma timed out"));
              }
            }, 12e4);
            logger.info(`Progress update for ${progressData.commandType}: ${progressData.progress}% - ${progressData.message}`);
            if (progressData.status === "completed" && progressData.progress === 100) {
              logger.info(`Operation ${progressData.commandType} completed, waiting for final result`);
            }
          }
          return;
        }
        const myResponse = json.message;
        logger.debug(`Received message: ${JSON.stringify(myResponse)}`);
        if (myResponse.command) {
          return;
        }
        if (myResponse.id && pendingRequests.has(myResponse.id)) {
          const request = pendingRequests.get(myResponse.id);
          clearTimeout(request.timeout);
          const error = myResponse.error ?? (myResponse.result && myResponse.result.error);
          if (error) {
            logger.error(`Error from Figma: ${error}`);
            request.reject(new Error(String(error)));
          } else {
            request.resolve(myResponse.result ?? myResponse);
          }
          pendingRequests.delete(myResponse.id);
        } else {
          logger.info(`Received broadcast message: ${JSON.stringify(myResponse)}`);
        }
      } catch (error) {
        logger.error(`Error parsing message: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
    ws.on("error", (error) => {
      logger.error(`Socket error: ${error}`);
    });
    ws.on("close", (code, reason) => {
      clearTimeout(connectionTimeout);
      logger.info(`Disconnected from Figma socket server with code ${code} and reason: ${reason || "No reason provided"}`);
      ws = null;
      for (const [id, request] of pendingRequests.entries()) {
        clearTimeout(request.timeout);
        request.reject(new Error(`Connection closed with code ${code}: ${reason || "No reason provided"}`));
        pendingRequests.delete(id);
      }
      const backoff = Math.min(3e4, reconnectInterval * Math.pow(1.5, Math.floor(Math.random() * 5)));
      logger.info(`Attempting to reconnect in ${backoff / 1e3} seconds...`);
      setTimeout(() => connectToFigma(port), backoff);
    });
  } catch (error) {
    logger.error(`Failed to create WebSocket connection: ${error instanceof Error ? error.message : String(error)}`);
    setTimeout(() => connectToFigma(port), reconnectInterval);
  }
}
async function joinChannel(channelName) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    throw new Error("Not connected to Figma");
  }
  try {
    await sendCommandToFigma("join", { channel: channelName });
    currentChannel = channelName;
    try {
      await sendCommandToFigma("ping", {}, 12e3);
      logger.info(`Joined channel: ${channelName}`);
    } catch (verificationError) {
      currentChannel = null;
      const errorMsg = verificationError instanceof Error ? verificationError.message : String(verificationError);
      logger.error(`Failed to verify channel ${channelName}: ${errorMsg}`);
      throw new Error(`Failed to verify connection to channel "${channelName}". The Figma plugin may not be connected to this channel.`);
    }
  } catch (error) {
    logger.error(`Failed to join channel: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}
function sendCommandToFigma(command, params = {}, timeoutMs = 6e4) {
  return new Promise((resolve, reject) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      connectToFigma();
      reject(new Error("Not connected to Figma. Attempting to connect..."));
      return;
    }
    const requiresChannel = command !== "join";
    if (requiresChannel && !currentChannel) {
      reject(new Error("Must join a channel before sending commands"));
      return;
    }
    const id = uuidv4();
    const request = {
      id,
      type: command === "join" ? "join" : "message",
      ...command === "join" ? { channel: params.channel } : { channel: currentChannel },
      message: {
        id,
        command,
        params: {
          ...params,
          commandId: id
          // Include the command ID in params
        }
      }
    };
    const timeout = setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id);
        logger.error(`Request ${id} to Figma timed out after ${timeoutMs / 1e3} seconds`);
        reject(new Error("Request to Figma timed out"));
      }
    }, timeoutMs);
    pendingRequests.set(id, {
      resolve,
      reject,
      timeout,
      lastActivity: Date.now()
    });
    logger.info(`Sending command to Figma: ${command}`);
    logger.debug(`Request details: ${JSON.stringify(request)}`);
    ws.send(JSON.stringify(request));
  });
}

// src/talk_to_figma_mcp/tools/document-tools.ts
import { z } from "zod";

// src/talk_to_figma_mcp/utils/figma-helpers.ts
function rgbaToHex(color) {
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  const a = Math.round(color.a * 255);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}${a === 255 ? "" : a.toString(16).padStart(2, "0")}`;
}
function filterFigmaNode(node) {
  if (node.type === "VECTOR") {
    return null;
  }
  const filtered = {
    id: node.id,
    name: node.name,
    type: node.type
  };
  if (node.fills && node.fills.length > 0) {
    filtered.fills = node.fills.map((fill) => {
      const processedFill = { ...fill };
      delete processedFill.boundVariables;
      delete processedFill.imageRef;
      if (processedFill.gradientStops) {
        processedFill.gradientStops = processedFill.gradientStops.map((stop) => {
          const processedStop = { ...stop };
          if (processedStop.color) {
            processedStop.color = rgbaToHex(processedStop.color);
          }
          delete processedStop.boundVariables;
          return processedStop;
        });
      }
      if (processedFill.color) {
        processedFill.color = rgbaToHex(processedFill.color);
      }
      return processedFill;
    });
  }
  if (node.strokes && node.strokes.length > 0) {
    filtered.strokes = node.strokes.map((stroke) => {
      const processedStroke = { ...stroke };
      delete processedStroke.boundVariables;
      if (processedStroke.color) {
        processedStroke.color = rgbaToHex(processedStroke.color);
      }
      return processedStroke;
    });
  }
  if (node.cornerRadius !== void 0) {
    filtered.cornerRadius = node.cornerRadius;
  }
  if (node.absoluteBoundingBox) {
    filtered.absoluteBoundingBox = node.absoluteBoundingBox;
  }
  if (node.localPosition) {
    filtered.localPosition = node.localPosition;
  }
  if (node.characters) {
    filtered.characters = node.characters;
  }
  if (node.style) {
    filtered.style = {
      fontFamily: node.style.fontFamily,
      fontStyle: node.style.fontStyle,
      fontWeight: node.style.fontWeight,
      fontSize: node.style.fontSize,
      textAlignHorizontal: node.style.textAlignHorizontal,
      letterSpacing: node.style.letterSpacing,
      lineHeightPx: node.style.lineHeightPx
    };
  }
  if (node.children) {
    filtered.children = node.children.map((child) => filterFigmaNode(child)).filter((child) => child !== null);
  }
  return filtered;
}

// src/talk_to_figma_mcp/tools/document-tools.ts
function registerDocumentTools(server) {
  server.tool(
    "get_document_info",
    "Get detailed information about the current Figma document",
    {},
    async () => {
      try {
        const result = await sendCommandToFigma("get_document_info");
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result)
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error getting document info: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );
  server.tool(
    "get_selection",
    "Get information about the current selection in Figma",
    {},
    async () => {
      try {
        const result = await sendCommandToFigma("get_selection");
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result)
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error getting selection: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );
  server.tool(
    "get_node_info",
    "Get detailed information about a specific node in Figma",
    {
      nodeId: z.string().describe("The ID of the node to get information about")
    },
    async ({ nodeId }) => {
      try {
        const result = await sendCommandToFigma("get_node_info", { nodeId });
        const filtered = filterFigmaNode(result);
        const coordinateNote = filtered.absoluteBoundingBox && filtered.localPosition ? "absoluteBoundingBox contains global coordinates (relative to canvas). localPosition contains local coordinates (relative to parent, use these for move_node)." : void 0;
        const payload = coordinateNote ? { ...filtered, _note: coordinateNote } : filtered;
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(payload)
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error getting node info: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );
  server.tool(
    "get_nodes_info",
    "Get detailed information about multiple nodes in Figma",
    {
      nodeIds: z.array(z.string()).describe("Array of node IDs to get information about")
    },
    async ({ nodeIds }) => {
      try {
        const results = await sendCommandToFigma("get_nodes_info", { nodeIds });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(results.map((result) => filterFigmaNode(result.document || result.info)))
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error getting nodes info: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );
  server.tool(
    "get_styles",
    "Get all styles from the current Figma document",
    {},
    async () => {
      try {
        const result = await sendCommandToFigma("get_styles");
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result)
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error getting styles: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );
  server.tool(
    "get_local_components",
    "Get all local components from the Figma document",
    {},
    async () => {
      try {
        const result = await sendCommandToFigma("get_local_components");
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result)
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error getting local components: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );
  server.tool(
    "get_remote_components",
    "Get available components from team libraries in Figma",
    {},
    async () => {
      try {
        const result = await sendCommandToFigma("get_remote_components");
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error getting remote components: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );
  server.tool(
    "scan_text_nodes",
    "Scan all text nodes in the selected Figma node",
    {
      nodeId: z.string().describe("ID of the node to scan")
    },
    async ({ nodeId }) => {
      try {
        const initialStatus = {
          type: "text",
          text: "Starting text node scanning. This may take a moment for large designs..."
        };
        const result = await sendCommandToFigma("scan_text_nodes", {
          nodeId,
          useChunking: true,
          // Enable chunking on the plugin side
          chunkSize: 10
          // Process 10 nodes at a time
        });
        if (result && typeof result === "object" && "chunks" in result) {
          const typedResult = result;
          const summaryText = `
          Scan completed:
          - Found ${typedResult.totalNodes} text nodes
          - Processed in ${typedResult.chunks} chunks
          `;
          return {
            content: [
              initialStatus,
              {
                type: "text",
                text: summaryText
              },
              {
                type: "text",
                text: JSON.stringify(typedResult.textNodes, null, 2)
              }
            ]
          };
        }
        return {
          content: [
            initialStatus,
            {
              type: "text",
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error scanning text nodes: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );
  server.tool(
    "join_channel",
    "Join a specific channel to communicate with Figma",
    {
      channel: z.string().describe("The name of the channel to join")
    },
    async ({ channel }) => {
      try {
        if (!channel) {
          return {
            content: [
              {
                type: "text",
                text: "Please provide a channel name to join:"
              }
            ],
            followUp: {
              tool: "join_channel",
              description: "Join the specified channel"
            }
          };
        }
        await joinChannel(channel);
        return {
          content: [
            {
              type: "text",
              text: `Successfully joined channel: ${channel}`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error joining channel: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );
  server.tool(
    "export_node_as_image",
    "Export a node as an image from Figma",
    {
      nodeId: z.string().describe("The ID of the node to export"),
      format: z.enum(["PNG", "JPG", "SVG", "PDF"]).optional().describe("Export format"),
      scale: z.number().positive().optional().describe("Export scale")
    },
    async ({ nodeId, format, scale }) => {
      try {
        const result = await sendCommandToFigma("export_node_as_image", {
          nodeId,
          format: format || "PNG",
          scale: scale || 1
        }, 12e4);
        const typedResult = result;
        return {
          content: [
            {
              type: "image",
              data: typedResult.imageData,
              mimeType: typedResult.mimeType || "image/png"
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error exporting node as image: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );
  server.tool(
    "create_page",
    "Create a new page in the current Figma document",
    {
      name: z.string().describe("Name for the new page")
    },
    async ({ name }) => {
      try {
        const result = await sendCommandToFigma("create_page", { name });
        const typedResult = result;
        return {
          content: [
            {
              type: "text",
              text: `Created page "${typedResult.name}" with ID: ${typedResult.id}`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error creating page: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );
  server.tool(
    "delete_page",
    "Delete a page from the current Figma document",
    {
      pageId: z.string().describe("ID of the page to delete")
    },
    async ({ pageId }) => {
      try {
        const result = await sendCommandToFigma("delete_page", { pageId });
        const typedResult = result;
        return {
          content: [
            {
              type: "text",
              text: `Deleted page "${typedResult.name}" successfully`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error deleting page: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );
  server.tool(
    "rename_page",
    "Rename an existing page in the Figma document",
    {
      pageId: z.string().describe("ID of the page to rename"),
      name: z.string().describe("New name for the page")
    },
    async ({ pageId, name }) => {
      try {
        const result = await sendCommandToFigma("rename_page", { pageId, name });
        const typedResult = result;
        return {
          content: [
            {
              type: "text",
              text: `Renamed page from "${typedResult.oldName}" to "${typedResult.name}"`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error renaming page: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );
  server.tool(
    "get_pages",
    "Get all pages in the current Figma document",
    {},
    async () => {
      try {
        const result = await sendCommandToFigma("get_pages");
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result)
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error getting pages: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );
  server.tool(
    "set_current_page",
    "Switch to a specific page in the Figma document",
    {
      pageId: z.string().describe("ID of the page to switch to")
    },
    async ({ pageId }) => {
      try {
        const result = await sendCommandToFigma("set_current_page", { pageId });
        const typedResult = result;
        return {
          content: [
            {
              type: "text",
              text: `Switched to page "${typedResult.name}"`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error switching page: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );
  server.tool(
    "duplicate_page",
    "Duplicate an existing page in the Figma document, creating a complete copy of all its contents",
    {
      pageId: z.string().describe("ID of the page to duplicate"),
      name: z.string().optional().describe("Optional name for the duplicated page (defaults to 'Original Name (Copy)')")
    },
    async ({ pageId, name }) => {
      try {
        const result = await sendCommandToFigma("duplicate_page", { pageId, name });
        const typedResult = result;
        return {
          content: [
            {
              type: "text",
              text: `Duplicated page "${typedResult.originalName}" \u2192 "${typedResult.name}" with ID: ${typedResult.id}`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error duplicating page: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );
}

// src/talk_to_figma_mcp/tools/creation-tools.ts
import { z as z2 } from "zod";
function registerCreationTools(server) {
  server.tool(
    "create_rectangle",
    "Create a new rectangle in Figma",
    {
      x: z2.number().describe("X position (local coordinates, relative to parent)"),
      y: z2.number().describe("Y position (local coordinates, relative to parent)"),
      width: z2.number().describe("Width of the rectangle"),
      height: z2.number().describe("Height of the rectangle"),
      name: z2.string().optional().describe("Optional name for the rectangle"),
      parentId: z2.string().optional().describe("Optional parent node ID to append the rectangle to")
    },
    async ({ x, y, width, height, name, parentId }) => {
      try {
        const result = await sendCommandToFigma("create_rectangle", {
          x,
          y,
          width,
          height,
          name: name || "Rectangle",
          parentId
        });
        return {
          content: [
            {
              type: "text",
              text: `Created rectangle "${JSON.stringify(result)}"`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error creating rectangle: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );
  server.tool(
    "create_frame",
    "Create a new frame in Figma",
    {
      x: z2.number().describe("X position (local coordinates, relative to parent)"),
      y: z2.number().describe("Y position (local coordinates, relative to parent)"),
      width: z2.number().describe("Width of the frame"),
      height: z2.number().describe("Height of the frame"),
      name: z2.string().optional().describe("Optional name for the frame"),
      parentId: z2.string().optional().describe("Optional parent node ID to append the frame to"),
      fillColor: z2.object({
        r: z2.number().min(0).max(1).describe("Red component (0-1)"),
        g: z2.number().min(0).max(1).describe("Green component (0-1)"),
        b: z2.number().min(0).max(1).describe("Blue component (0-1)"),
        a: z2.number().min(0).max(1).optional().describe("Alpha component (0-1)")
      }).optional().describe("Fill color in RGBA format"),
      strokeColor: z2.object({
        r: z2.number().min(0).max(1).describe("Red component (0-1)"),
        g: z2.number().min(0).max(1).describe("Green component (0-1)"),
        b: z2.number().min(0).max(1).describe("Blue component (0-1)"),
        a: z2.number().min(0).max(1).optional().describe("Alpha component (0-1)")
      }).optional().describe("Stroke color in RGBA format"),
      strokeWeight: z2.number().positive().optional().describe("Stroke weight")
    },
    async ({
      x,
      y,
      width,
      height,
      name,
      parentId,
      fillColor,
      strokeColor,
      strokeWeight
    }) => {
      try {
        const result = await sendCommandToFigma("create_frame", {
          x,
          y,
          width,
          height,
          name: name || "Frame",
          parentId,
          fillColor: fillColor || { r: 1, g: 1, b: 1, a: 1 },
          strokeColor,
          strokeWeight
        });
        const typedResult = result;
        return {
          content: [
            {
              type: "text",
              text: `Created frame "${typedResult.name}" with ID: ${typedResult.id}. Use the ID as the parentId to appendChild inside this frame.`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error creating frame: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );
  server.tool(
    "create_text",
    "Create a new text element in Figma",
    {
      x: z2.number().describe("X position (local coordinates, relative to parent)"),
      y: z2.number().describe("Y position (local coordinates, relative to parent)"),
      text: z2.string().describe("Text content"),
      fontSize: z2.number().optional().describe("Font size (default: 14)"),
      fontWeight: z2.number().optional().describe("Font weight (e.g., 400 for Regular, 700 for Bold)"),
      fontColor: z2.object({
        r: z2.number().min(0).max(1).describe("Red component (0-1)"),
        g: z2.number().min(0).max(1).describe("Green component (0-1)"),
        b: z2.number().min(0).max(1).describe("Blue component (0-1)"),
        a: z2.number().min(0).max(1).optional().describe("Alpha component (0-1)")
      }).optional().describe("Font color in RGBA format"),
      name: z2.string().optional().describe("Optional name for the text node by default following text"),
      parentId: z2.string().optional().describe("Optional parent node ID to append the text to"),
      textAlignHorizontal: z2.enum(["LEFT", "CENTER", "RIGHT", "JUSTIFIED"]).optional().describe("Horizontal text alignment. Use RIGHT for Arabic/RTL text."),
      textAutoResize: z2.enum(["WIDTH_AND_HEIGHT", "HEIGHT", "NONE", "TRUNCATE"]).optional().describe("Text resize behavior. Use HEIGHT for fixed-width text that wraps."),
      width: z2.number().positive().optional().describe("Fixed width for the text node. Use with textAutoResize HEIGHT for wrapping text within a specific width.")
    },
    async ({ x, y, text, fontSize, fontWeight, fontColor, name, parentId, textAlignHorizontal, textAutoResize, width }) => {
      try {
        const result = await sendCommandToFigma("create_text", {
          x,
          y,
          text,
          fontSize: fontSize || 14,
          fontWeight: fontWeight || 400,
          fontColor: fontColor || { r: 0, g: 0, b: 0, a: 1 },
          name: name || "Text",
          parentId,
          textAlignHorizontal,
          textAutoResize,
          width
        });
        const typedResult = result;
        return {
          content: [
            {
              type: "text",
              text: `Created text "${typedResult.name}" with ID: ${typedResult.id}`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error creating text: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );
  server.tool(
    "create_ellipse",
    "Create a new ellipse in Figma",
    {
      x: z2.number().describe("X position (local coordinates, relative to parent)"),
      y: z2.number().describe("Y position (local coordinates, relative to parent)"),
      width: z2.number().describe("Width of the ellipse"),
      height: z2.number().describe("Height of the ellipse"),
      name: z2.string().optional().describe("Optional name for the ellipse"),
      parentId: z2.string().optional().describe("Optional parent node ID to append the ellipse to"),
      fillColor: z2.object({
        r: z2.number().min(0).max(1).describe("Red component (0-1)"),
        g: z2.number().min(0).max(1).describe("Green component (0-1)"),
        b: z2.number().min(0).max(1).describe("Blue component (0-1)"),
        a: z2.number().min(0).max(1).optional().describe("Alpha component (0-1)")
      }).optional().describe("Fill color in RGBA format"),
      strokeColor: z2.object({
        r: z2.number().min(0).max(1).describe("Red component (0-1)"),
        g: z2.number().min(0).max(1).describe("Green component (0-1)"),
        b: z2.number().min(0).max(1).describe("Blue component (0-1)"),
        a: z2.number().min(0).max(1).optional().describe("Alpha component (0-1)")
      }).optional().describe("Stroke color in RGBA format"),
      strokeWeight: z2.number().positive().optional().describe("Stroke weight")
    },
    async ({ x, y, width, height, name, parentId, fillColor, strokeColor, strokeWeight }) => {
      try {
        const result = await sendCommandToFigma("create_ellipse", {
          x,
          y,
          width,
          height,
          name: name || "Ellipse",
          parentId,
          fillColor,
          strokeColor,
          strokeWeight
        });
        const typedResult = result;
        return {
          content: [
            {
              type: "text",
              text: `Created ellipse with ID: ${typedResult.id}`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error creating ellipse: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );
  server.tool(
    "create_polygon",
    "Create a new polygon in Figma",
    {
      x: z2.number().describe("X position (local coordinates, relative to parent)"),
      y: z2.number().describe("Y position (local coordinates, relative to parent)"),
      width: z2.number().describe("Width of the polygon"),
      height: z2.number().describe("Height of the polygon"),
      sides: z2.number().min(3).optional().describe("Number of sides (default: 6)"),
      name: z2.string().optional().describe("Optional name for the polygon"),
      parentId: z2.string().optional().describe("Optional parent node ID to append the polygon to"),
      fillColor: z2.object({
        r: z2.number().min(0).max(1).describe("Red component (0-1)"),
        g: z2.number().min(0).max(1).describe("Green component (0-1)"),
        b: z2.number().min(0).max(1).describe("Blue component (0-1)"),
        a: z2.number().min(0).max(1).optional().describe("Alpha component (0-1)")
      }).optional().describe("Fill color in RGBA format"),
      strokeColor: z2.object({
        r: z2.number().min(0).max(1).describe("Red component (0-1)"),
        g: z2.number().min(0).max(1).describe("Green component (0-1)"),
        b: z2.number().min(0).max(1).describe("Blue component (0-1)"),
        a: z2.number().min(0).max(1).optional().describe("Alpha component (0-1)")
      }).optional().describe("Stroke color in RGBA format"),
      strokeWeight: z2.number().positive().optional().describe("Stroke weight")
    },
    async ({ x, y, width, height, sides, name, parentId, fillColor, strokeColor, strokeWeight }) => {
      try {
        const result = await sendCommandToFigma("create_polygon", {
          x,
          y,
          width,
          height,
          sides: sides || 6,
          name: name || "Polygon",
          parentId,
          fillColor,
          strokeColor,
          strokeWeight
        });
        const typedResult = result;
        return {
          content: [
            {
              type: "text",
              text: `Created polygon with ID: ${typedResult.id} and ${sides || 6} sides`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error creating polygon: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );
  server.tool(
    "create_star",
    "Create a new star in Figma",
    {
      x: z2.number().describe("X position (local coordinates, relative to parent)"),
      y: z2.number().describe("Y position (local coordinates, relative to parent)"),
      width: z2.number().describe("Width of the star"),
      height: z2.number().describe("Height of the star"),
      points: z2.number().min(3).optional().describe("Number of points (default: 5)"),
      innerRadius: z2.number().min(0.01).max(0.99).optional().describe("Inner radius ratio (0.01-0.99, default: 0.5)"),
      name: z2.string().optional().describe("Optional name for the star"),
      parentId: z2.string().optional().describe("Optional parent node ID to append the star to"),
      fillColor: z2.object({
        r: z2.number().min(0).max(1).describe("Red component (0-1)"),
        g: z2.number().min(0).max(1).describe("Green component (0-1)"),
        b: z2.number().min(0).max(1).describe("Blue component (0-1)"),
        a: z2.number().min(0).max(1).optional().describe("Alpha component (0-1)")
      }).optional().describe("Fill color in RGBA format"),
      strokeColor: z2.object({
        r: z2.number().min(0).max(1).describe("Red component (0-1)"),
        g: z2.number().min(0).max(1).describe("Green component (0-1)"),
        b: z2.number().min(0).max(1).describe("Blue component (0-1)"),
        a: z2.number().min(0).max(1).optional().describe("Alpha component (0-1)")
      }).optional().describe("Stroke color in RGBA format"),
      strokeWeight: z2.number().positive().optional().describe("Stroke weight")
    },
    async ({ x, y, width, height, points, innerRadius, name, parentId, fillColor, strokeColor, strokeWeight }) => {
      try {
        const result = await sendCommandToFigma("create_star", {
          x,
          y,
          width,
          height,
          points: points || 5,
          innerRadius: innerRadius || 0.5,
          name: name || "Star",
          parentId,
          fillColor,
          strokeColor,
          strokeWeight
        });
        const typedResult = result;
        return {
          content: [
            {
              type: "text",
              text: `Created star with ID: ${typedResult.id}, ${points || 5} points, and inner radius ratio of ${innerRadius || 0.5}`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error creating star: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );
  server.tool(
    "group_nodes",
    "Group nodes in Figma",
    {
      nodeIds: z2.array(z2.string()).describe("Array of IDs of the nodes to group"),
      name: z2.string().optional().describe("Optional name for the group")
    },
    async ({ nodeIds, name }) => {
      try {
        const result = await sendCommandToFigma("group_nodes", {
          nodeIds,
          name
        });
        const typedResult = result;
        return {
          content: [
            {
              type: "text",
              text: `Nodes successfully grouped into "${typedResult.name}" with ID: ${typedResult.id}. The group contains ${typedResult.children.length} elements.`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error grouping nodes: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );
  server.tool(
    "ungroup_nodes",
    "Ungroup nodes in Figma",
    {
      nodeId: z2.string().describe("ID of the node (group or frame) to ungroup")
    },
    async ({ nodeId }) => {
      try {
        const result = await sendCommandToFigma("ungroup_nodes", { nodeId });
        const typedResult = result;
        return {
          content: [
            {
              type: "text",
              text: `Node successfully ungrouped. ${typedResult.ungroupedCount} elements were released.`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error ungrouping node: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );
  server.tool(
    "clone_node",
    "Clone an existing node in Figma",
    {
      nodeId: z2.string().describe("The ID of the node to clone"),
      x: z2.number().optional().describe("New X position for the clone (local coordinates, relative to parent)"),
      y: z2.number().optional().describe("New Y position for the clone (local coordinates, relative to parent)")
    },
    async ({ nodeId, x, y }) => {
      try {
        const result = await sendCommandToFigma("clone_node", { nodeId, x, y });
        const typedResult = result;
        return {
          content: [
            {
              type: "text",
              text: `Cloned node "${typedResult.name}" with new ID: ${typedResult.id}${x !== void 0 && y !== void 0 ? ` at position (${x}, ${y})` : ""}`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error cloning node: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );
  server.tool(
    "insert_child",
    "Insert a child node inside a parent node in Figma",
    {
      parentId: z2.string().describe("ID of the parent node where the child will be inserted"),
      childId: z2.string().describe("ID of the child node to insert"),
      index: z2.number().optional().describe("Optional index where to insert the child (if not specified, it will be added at the end)")
    },
    async ({ parentId, childId, index }) => {
      try {
        const result = await sendCommandToFigma("insert_child", {
          parentId,
          childId,
          index
        });
        const typedResult = result;
        return {
          content: [
            {
              type: "text",
              text: `Child node with ID: ${typedResult.childId} successfully inserted into parent node with ID: ${typedResult.parentId}${index !== void 0 ? ` at position ${typedResult.index}` : ""}.`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error inserting child node: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );
  server.tool(
    "flatten_node",
    "Flatten a node in Figma (e.g., for boolean operations or converting to path)",
    {
      nodeId: z2.string().describe("ID of the node to flatten")
    },
    async ({ nodeId }) => {
      try {
        const result = await sendCommandToFigma("flatten_node", { nodeId });
        const typedResult = result;
        return {
          content: [
            {
              type: "text",
              text: `Node "${typedResult.name}" flattened successfully. The new node has ID: ${typedResult.id} and is of type ${typedResult.type}.`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error flattening node: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );
  server.tool(
    "boolean_operation",
    "Perform a boolean operation (union, subtract, intersect, exclude) on two or more nodes. All nodes must share the same parent.",
    {
      nodeIds: z2.array(z2.string()).min(2).describe("Array of node IDs to combine (minimum 2). Order matters for SUBTRACT."),
      operation: z2.enum(["UNION", "SUBTRACT", "INTERSECT", "EXCLUDE"]).describe("Boolean operation type"),
      name: z2.string().optional().describe("Optional name for the resulting node")
    },
    async ({ nodeIds, operation, name }) => {
      try {
        const result = await sendCommandToFigma("boolean_operation", {
          nodeIds,
          operation,
          name
        });
        const typedResult = result;
        return {
          content: [
            {
              type: "text",
              text: `Created ${operation} boolean operation "${typedResult.name}" with ID: ${typedResult.id}`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error performing boolean operation: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );
}

// src/talk_to_figma_mcp/tools/modification-tools.ts
import { z as z3 } from "zod";

// src/talk_to_figma_mcp/utils/defaults.ts
var FIGMA_DEFAULTS = {
  color: {
    opacity: 1
  },
  stroke: {
    weight: 1
  }
};
function applyDefault(value, defaultValue) {
  return value !== void 0 ? value : defaultValue;
}
function applyColorDefaults(color) {
  return {
    r: color.r,
    g: color.g,
    b: color.b,
    a: applyDefault(color.a, FIGMA_DEFAULTS.color.opacity)
  };
}

// src/talk_to_figma_mcp/tools/modification-tools.ts
function registerModificationTools(server) {
  server.tool(
    "set_fill_color",
    "Set the fill color of a node in Figma. Alpha component defaults to 1 (fully opaque) if not specified. Use alpha 0 for fully transparent.",
    {
      nodeId: z3.string().describe("The ID of the node to modify"),
      r: z3.number().min(0).max(1).describe("Red component (0-1)"),
      g: z3.number().min(0).max(1).describe("Green component (0-1)"),
      b: z3.number().min(0).max(1).describe("Blue component (0-1)"),
      a: z3.number().min(0).max(1).optional().describe("Alpha component (0-1, defaults to 1 if not specified)")
    },
    async ({ nodeId, r, g, b, a }) => {
      try {
        if (r === void 0 || g === void 0 || b === void 0) {
          throw new Error("RGB components (r, g, b) are required and cannot be undefined");
        }
        const colorInput = { r, g, b, a };
        const colorWithDefaults = applyColorDefaults(colorInput);
        const result = await sendCommandToFigma("set_fill_color", {
          nodeId,
          color: colorWithDefaults
        });
        const typedResult = result;
        return {
          content: [
            {
              type: "text",
              text: `Set fill color of node "${typedResult.name}" to RGBA(${r}, ${g}, ${b}, ${colorWithDefaults.a})`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error setting fill color: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );
  server.tool(
    "set_stroke_color",
    "Set the stroke color of a node in Figma (defaults: opacity 1, weight 1)",
    {
      nodeId: z3.string().describe("The ID of the node to modify"),
      r: z3.number().min(0).max(1).describe("Red component (0-1)"),
      g: z3.number().min(0).max(1).describe("Green component (0-1)"),
      b: z3.number().min(0).max(1).describe("Blue component (0-1)"),
      a: z3.number().min(0).max(1).optional().describe("Alpha component (0-1)"),
      strokeWeight: z3.number().min(0).optional().describe("Stroke weight >= 0)")
    },
    async ({ nodeId, r, g, b, a, strokeWeight }) => {
      try {
        if (r === void 0 || g === void 0 || b === void 0) {
          throw new Error("RGB components (r, g, b) are required and cannot be undefined");
        }
        const colorInput = { r, g, b, a };
        const colorWithDefaults = applyColorDefaults(colorInput);
        const strokeWeightWithDefault = applyDefault(strokeWeight, FIGMA_DEFAULTS.stroke.weight);
        const result = await sendCommandToFigma("set_stroke_color", {
          nodeId,
          color: colorWithDefaults,
          strokeWeight: strokeWeightWithDefault
        });
        const typedResult = result;
        return {
          content: [
            {
              type: "text",
              text: `Set stroke color of node "${typedResult.name}" to RGBA(${r}, ${g}, ${b}, ${colorWithDefaults.a}) with weight ${strokeWeightWithDefault}`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error setting stroke color: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );
  server.tool(
    "set_selection_colors",
    "Recursively change all stroke and fill colors of a node and all its descendants. Works like Figma's 'Selection colors' feature - perfect for recoloring icon instances.",
    {
      nodeId: z3.string().describe("The ID of the node to modify (typically an icon instance)"),
      r: z3.number().min(0).max(1).describe("Red component (0-1)"),
      g: z3.number().min(0).max(1).describe("Green component (0-1)"),
      b: z3.number().min(0).max(1).describe("Blue component (0-1)"),
      a: z3.number().min(0).max(1).optional().describe("Alpha component (0-1, defaults to 1)")
    },
    async ({ nodeId, r, g, b, a }) => {
      try {
        if (r === void 0 || g === void 0 || b === void 0) {
          throw new Error("RGB components (r, g, b) are required");
        }
        const colorWithDefaults = applyColorDefaults({ r, g, b, a });
        const result = await sendCommandToFigma("set_selection_colors", {
          nodeId,
          r: colorWithDefaults.r,
          g: colorWithDefaults.g,
          b: colorWithDefaults.b,
          a: colorWithDefaults.a
        });
        const typedResult = result;
        return {
          content: [
            {
              type: "text",
              text: `Changed selection colors of "${typedResult.name}" and descendants (${typedResult.nodesChanged} paint(s) updated) to RGBA(${r}, ${g}, ${b}, ${colorWithDefaults.a})`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error setting selection colors: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );
  server.tool(
    "move_node",
    "Move a node to a new position in Figma",
    {
      nodeId: z3.string().describe("The ID of the node to move"),
      x: z3.number().describe("New X position (local coordinates, relative to parent)"),
      y: z3.number().describe("New Y position (local coordinates, relative to parent)")
    },
    async ({ nodeId, x, y }) => {
      try {
        const result = await sendCommandToFigma("move_node", { nodeId, x, y });
        const typedResult = result;
        return {
          content: [
            {
              type: "text",
              text: `Moved node "${typedResult.name}" to position (${x}, ${y})`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error moving node: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );
  server.tool(
    "resize_node",
    "Resize a node in Figma",
    {
      nodeId: z3.string().describe("The ID of the node to resize"),
      width: z3.number().positive().describe("New width"),
      height: z3.number().positive().describe("New height")
    },
    async ({ nodeId, width, height }) => {
      try {
        const result = await sendCommandToFigma("resize_node", {
          nodeId,
          width,
          height
        });
        const typedResult = result;
        return {
          content: [
            {
              type: "text",
              text: `Resized node "${typedResult.name}" to width ${width} and height ${height}`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error resizing node: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );
  server.tool(
    "delete_node",
    "Delete a node from Figma",
    {
      nodeId: z3.string().describe("The ID of the node to delete")
    },
    async ({ nodeId }) => {
      try {
        await sendCommandToFigma("delete_node", { nodeId });
        return {
          content: [
            {
              type: "text",
              text: `Deleted node with ID: ${nodeId}`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error deleting node: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );
  server.tool(
    "set_corner_radius",
    "Set the corner radius of a node in Figma",
    {
      nodeId: z3.string().describe("The ID of the node to modify"),
      radius: z3.number().min(0).describe("Corner radius value"),
      corners: z3.array(z3.boolean()).length(4).optional().describe(
        "Optional array of 4 booleans to specify which corners to round [topLeft, topRight, bottomRight, bottomLeft]"
      )
    },
    async ({ nodeId, radius, corners }) => {
      try {
        const result = await sendCommandToFigma("set_corner_radius", {
          nodeId,
          radius,
          corners: corners || [true, true, true, true]
        });
        const typedResult = result;
        return {
          content: [
            {
              type: "text",
              text: `Set corner radius of node "${typedResult.name}" to ${radius}px`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error setting corner radius: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );
  server.tool(
    "set_auto_layout",
    "Configure auto layout properties for a node in Figma",
    {
      nodeId: z3.string().describe("The ID of the node to configure auto layout"),
      layoutMode: z3.enum(["HORIZONTAL", "VERTICAL", "NONE"]).describe("Layout direction"),
      paddingTop: z3.number().optional().describe("Top padding in pixels"),
      paddingBottom: z3.number().optional().describe("Bottom padding in pixels"),
      paddingLeft: z3.number().optional().describe("Left padding in pixels"),
      paddingRight: z3.number().optional().describe("Right padding in pixels"),
      itemSpacing: z3.number().optional().describe("Spacing between items in pixels"),
      primaryAxisAlignItems: z3.enum(["MIN", "CENTER", "MAX", "SPACE_BETWEEN"]).optional().describe("Alignment along primary axis"),
      counterAxisAlignItems: z3.enum(["MIN", "CENTER", "MAX"]).optional().describe("Alignment along counter axis"),
      layoutWrap: z3.enum(["WRAP", "NO_WRAP"]).optional().describe("Whether items wrap to new lines"),
      strokesIncludedInLayout: z3.boolean().optional().describe("Whether strokes are included in layout calculations")
    },
    async ({
      nodeId,
      layoutMode,
      paddingTop,
      paddingBottom,
      paddingLeft,
      paddingRight,
      itemSpacing,
      primaryAxisAlignItems,
      counterAxisAlignItems,
      layoutWrap,
      strokesIncludedInLayout
    }) => {
      try {
        const result = await sendCommandToFigma("set_auto_layout", {
          nodeId,
          layoutMode,
          paddingTop,
          paddingBottom,
          paddingLeft,
          paddingRight,
          itemSpacing,
          primaryAxisAlignItems,
          counterAxisAlignItems,
          layoutWrap,
          strokesIncludedInLayout
        });
        const typedResult = result;
        return {
          content: [
            {
              type: "text",
              text: `Applied auto layout to node "${typedResult.name}" with mode: ${layoutMode}`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error setting auto layout: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );
  server.tool(
    "set_effects",
    "Set the visual effects of a node in Figma",
    {
      nodeId: z3.string().describe("The ID of the node to modify"),
      effects: z3.array(
        z3.object({
          type: z3.enum(["DROP_SHADOW", "INNER_SHADOW", "LAYER_BLUR", "BACKGROUND_BLUR"]).describe("Effect type"),
          color: z3.object({
            r: z3.number().min(0).max(1).describe("Red (0-1)"),
            g: z3.number().min(0).max(1).describe("Green (0-1)"),
            b: z3.number().min(0).max(1).describe("Blue (0-1)"),
            a: z3.number().min(0).max(1).describe("Alpha (0-1)")
          }).optional().describe("Effect color (for shadows)"),
          offset: z3.object({
            x: z3.number().describe("X offset"),
            y: z3.number().describe("Y offset")
          }).optional().describe("Offset (for shadows)"),
          radius: z3.number().optional().describe("Effect radius"),
          spread: z3.number().optional().describe("Shadow spread (for shadows)"),
          visible: z3.boolean().optional().describe("Whether the effect is visible"),
          blendMode: z3.string().optional().describe("Blend mode")
        })
      ).describe("Array of effects to apply")
    },
    async ({ nodeId, effects }) => {
      try {
        const result = await sendCommandToFigma("set_effects", {
          nodeId,
          effects
        });
        const typedResult = result;
        return {
          content: [
            {
              type: "text",
              text: `Successfully applied ${effects.length} effect(s) to node "${typedResult.name}"`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error setting effects: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );
  server.tool(
    "set_effect_style_id",
    "Apply an effect style to a node in Figma",
    {
      nodeId: z3.string().describe("The ID of the node to modify"),
      effectStyleId: z3.string().describe("The ID of the effect style to apply")
    },
    async ({ nodeId, effectStyleId }) => {
      try {
        const result = await sendCommandToFigma("set_effect_style_id", {
          nodeId,
          effectStyleId
        });
        const typedResult = result;
        return {
          content: [
            {
              type: "text",
              text: `Successfully applied effect style to node "${typedResult.name}"`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error setting effect style: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );
  server.tool(
    "rotate_node",
    "Rotate a node in Figma by a specified angle in degrees (clockwise). Use relative=true to add to the current rotation instead of setting an absolute value. Note: locked nodes can still be rotated \u2014 the Plugin API bypasses the UI lock by design.",
    {
      nodeId: z3.string().describe("The ID of the node to rotate"),
      angle: z3.number().describe("Rotation angle in degrees (clockwise)"),
      relative: z3.boolean().optional().describe("If true, add angle to current rotation instead of setting absolute value (default: false)")
    },
    async ({ nodeId, angle, relative }) => {
      try {
        const result = await sendCommandToFigma("rotate_node", {
          nodeId,
          angle,
          relative: relative || false
        });
        const typedResult = result;
        return {
          content: [
            {
              type: "text",
              text: `Rotated node "${typedResult.name}" to ${typedResult.rotation}\xB0`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error rotating node: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );
  server.tool(
    "set_node_properties",
    "Set visibility, lock state, and/or opacity of a node in Figma. Only provided properties are changed; omitted properties remain unchanged.",
    {
      nodeId: z3.string().describe("The ID of the node to modify"),
      visible: z3.boolean().optional().describe("Set node visibility (true = visible, false = hidden)"),
      locked: z3.boolean().optional().describe("Set node lock state (true = locked, false = unlocked)"),
      opacity: z3.number().min(0).max(1).optional().describe("Set node opacity (0 = fully transparent, 1 = fully opaque)")
    },
    async ({ nodeId, visible, locked, opacity }) => {
      try {
        const result = await sendCommandToFigma("set_node_properties", {
          nodeId,
          visible,
          locked,
          opacity
        });
        const typedResult = result;
        const changes = [];
        if (visible !== void 0) changes.push(`visible=${typedResult.visible}`);
        if (locked !== void 0) changes.push(`locked=${typedResult.locked}`);
        if (opacity !== void 0) changes.push(`opacity=${typedResult.opacity}`);
        return {
          content: [
            {
              type: "text",
              text: `Updated node "${typedResult.name}": ${changes.join(", ")}`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error setting node properties: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );
  server.tool(
    "reorder_node",
    "Change the z-order (layer order) of a node within its parent. Distinct from insert_child which re-parents a node \u2014 reorder_node changes position within the same parent.",
    {
      nodeId: z3.string().describe("The ID of the node to reorder"),
      position: z3.enum(["front", "back", "forward", "backward"]).optional().describe("Move to front/back or one step forward/backward"),
      index: z3.number().optional().describe("Direct index position within parent's children (0 = bottom). Overrides position if both provided.")
    },
    async ({ nodeId, position, index }) => {
      try {
        const result = await sendCommandToFigma("reorder_node", {
          nodeId,
          position,
          index
        });
        const typedResult = result;
        return {
          content: [
            {
              type: "text",
              text: `Reordered node "${typedResult.name}" to index ${typedResult.newIndex} of ${typedResult.parentChildCount} siblings`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error reordering node: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );
  server.tool(
    "convert_to_frame",
    "Convert a group or shape node into a frame in Figma. Preserves position, size, visual properties, and children. Useful for converting groups into auto-layout-capable frames.",
    {
      nodeId: z3.string().describe("The ID of the node to convert to a frame")
    },
    async ({ nodeId }) => {
      try {
        const result = await sendCommandToFigma("convert_to_frame", { nodeId });
        const typedResult = result;
        return {
          content: [
            {
              type: "text",
              text: `Converted ${typedResult.originalType} "${typedResult.name}" to FRAME with ID: ${typedResult.id} (${typedResult.childCount} children preserved)`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error converting to frame: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );
  server.tool(
    "set_gradient",
    "Set a gradient fill on a node in Figma. Supports linear, radial, angular, and diamond gradients. Replaces all existing fills (same behavior as set_fill_color).",
    {
      nodeId: z3.string().describe("The ID of the node to modify"),
      type: z3.enum(["GRADIENT_LINEAR", "GRADIENT_RADIAL", "GRADIENT_ANGULAR", "GRADIENT_DIAMOND"]).describe("Gradient type"),
      stops: z3.array(z3.object({
        position: z3.number().min(0).max(1).describe("Stop position (0-1, where 0 is start and 1 is end)"),
        color: z3.object({
          r: z3.number().min(0).max(1).describe("Red (0-1)"),
          g: z3.number().min(0).max(1).describe("Green (0-1)"),
          b: z3.number().min(0).max(1).describe("Blue (0-1)"),
          a: z3.number().min(0).max(1).optional().describe("Alpha (0-1, defaults to 1)")
        })
      })).min(2).describe("Array of gradient color stops (minimum 2)"),
      gradientTransform: z3.array(z3.array(z3.number())).optional().describe("2x3 affine transform matrix [[a,b,tx],[c,d,ty]]. Defaults to left-to-right linear: [[1,0,0],[0,1,0]]")
    },
    async ({ nodeId, type, stops, gradientTransform }) => {
      try {
        const result = await sendCommandToFigma("set_gradient", {
          nodeId,
          type,
          stops: stops.map((s) => ({
            position: s.position,
            color: { r: s.color.r, g: s.color.g, b: s.color.b, a: s.color.a ?? 1 }
          })),
          gradientTransform: gradientTransform || [[1, 0, 0], [0, 1, 0]]
        });
        const typedResult = result;
        return {
          content: [
            {
              type: "text",
              text: `Applied ${type} gradient with ${stops.length} stops to node "${typedResult.name}"`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error setting gradient: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );
  server.tool(
    "set_image",
    "Set an image fill on a node from base64-encoded image data. Supports PNG, JPEG, GIF, WebP. Max ~5MB after decode.",
    {
      nodeId: z3.string().describe("The ID of the node to apply the image fill to"),
      imageData: z3.string().max(7e6).describe("Base64-encoded image data (PNG, JPEG, GIF, or WebP). Max ~5MB after decode."),
      scaleMode: z3.enum(["FILL", "FIT", "CROP", "TILE"]).optional().describe("How the image is scaled within the node (default: FILL)")
    },
    async ({ nodeId, imageData, scaleMode }) => {
      try {
        const result = await sendCommandToFigma("set_image", {
          nodeId,
          imageData,
          scaleMode: scaleMode || "FILL"
        });
        const typedResult = result;
        return {
          content: [
            {
              type: "text",
              text: `Set image fill on node "${typedResult.name}" with scale mode ${scaleMode || "FILL"} (hash: ${typedResult.imageHash})`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error setting image fill: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );
  server.tool(
    "set_grid",
    "Apply layout grids to a frame node in Figma. Supports columns, rows, and grid patterns.",
    {
      nodeId: z3.string().describe("The ID of the frame node to apply grids to"),
      grids: z3.array(
        z3.object({
          pattern: z3.enum(["COLUMNS", "ROWS", "GRID"]).describe("Grid pattern type"),
          count: z3.number().optional().describe("Number of columns/rows (ignored for GRID)"),
          sectionSize: z3.number().optional().describe("Size of each section in pixels"),
          gutterSize: z3.number().optional().describe("Gutter size between sections in pixels"),
          offset: z3.number().optional().describe("Offset from the edge in pixels"),
          alignment: z3.enum(["MIN", "CENTER", "MAX", "STRETCH"]).optional().describe("Grid alignment"),
          visible: z3.boolean().optional().describe("Whether the grid is visible (default: true)"),
          color: z3.object({
            r: z3.number().min(0).max(1).describe("Red (0-1)"),
            g: z3.number().min(0).max(1).describe("Green (0-1)"),
            b: z3.number().min(0).max(1).describe("Blue (0-1)"),
            a: z3.number().min(0).max(1).describe("Alpha (0-1)")
          }).optional().describe("Grid color")
        })
      ).describe("Array of layout grids to apply")
    },
    async ({ nodeId, grids }) => {
      try {
        const result = await sendCommandToFigma("set_grid", { nodeId, grids });
        const typedResult = result;
        return {
          content: [
            {
              type: "text",
              text: `Applied ${typedResult.gridCount} layout grid(s) to frame "${typedResult.name}"`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error setting layout grids: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );
  server.tool(
    "get_grid",
    "Read layout grids from a frame node in Figma",
    {
      nodeId: z3.string().describe("The ID of the frame node to read grids from")
    },
    async ({ nodeId }) => {
      try {
        const result = await sendCommandToFigma("get_grid", { nodeId });
        const typedResult = result;
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ name: typedResult.name, grids: typedResult.grids }, null, 2)
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error getting layout grids: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );
  server.tool(
    "set_guide",
    "Set guides on a page in Figma. Replaces all existing guides on the page.",
    {
      pageId: z3.string().describe("The ID of the page to add guides to"),
      guides: z3.array(
        z3.object({
          axis: z3.enum(["X", "Y"]).describe("Guide axis: X for vertical, Y for horizontal"),
          offset: z3.number().describe("Offset position of the guide in pixels")
        })
      ).describe("Array of guides to set on the page")
    },
    async ({ pageId, guides }) => {
      try {
        const result = await sendCommandToFigma("set_guide", { pageId, guides });
        const typedResult = result;
        return {
          content: [
            {
              type: "text",
              text: `Set ${typedResult.guideCount} guide(s) on page "${typedResult.name}"`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error setting guides: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );
  server.tool(
    "get_guide",
    "Read guides from a page in Figma",
    {
      pageId: z3.string().describe("The ID of the page to read guides from")
    },
    async ({ pageId }) => {
      try {
        const result = await sendCommandToFigma("get_guide", { pageId });
        const typedResult = result;
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ name: typedResult.name, guides: typedResult.guides }, null, 2)
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error getting guides: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );
  server.tool(
    "set_annotation",
    "Add an annotation label to a node in Figma. Uses the proposed Annotations API \u2014 requires Figma Desktop with enableProposedApi.",
    {
      nodeId: z3.string().describe("The ID of the node to annotate"),
      label: z3.string().describe("The annotation label text")
    },
    async ({ nodeId, label }) => {
      try {
        const result = await sendCommandToFigma("set_annotation", { nodeId, label });
        const typedResult = result;
        return {
          content: [
            {
              type: "text",
              text: `Added annotation "${label}" to node "${typedResult.name}" (${typedResult.annotationCount} total annotations)`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error setting annotation: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );
  server.tool(
    "get_annotation",
    "Read annotations from a node in Figma. Uses the proposed Annotations API.",
    {
      nodeId: z3.string().describe("The ID of the node to read annotations from")
    },
    async ({ nodeId }) => {
      try {
        const result = await sendCommandToFigma("get_annotation", { nodeId });
        const typedResult = result;
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ name: typedResult.name, annotations: typedResult.annotations }, null, 2)
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error getting annotations: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );
  server.tool(
    "rename_node",
    "Rename a node (frame, component, group, etc.) in Figma",
    {
      nodeId: z3.string().describe("The ID of the node to rename"),
      name: z3.string().describe("The new name for the node")
    },
    async ({ nodeId, name }) => {
      try {
        const result = await sendCommandToFigma("rename_node", {
          nodeId,
          name
        });
        const typedResult = result;
        return {
          content: [
            {
              type: "text",
              text: `Renamed ${typedResult.type} from "${typedResult.oldName}" to "${typedResult.name}"`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error renaming node: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );
}

// src/talk_to_figma_mcp/tools/text-tools.ts
import { z as z4 } from "zod";
function registerTextTools(server) {
  server.tool(
    "set_text_content",
    "Set the text content of an existing text node in Figma",
    {
      nodeId: z4.string().describe("The ID of the text node to modify"),
      text: z4.string().describe("New text content")
    },
    async ({ nodeId, text }) => {
      try {
        const result = await sendCommandToFigma("set_text_content", {
          nodeId,
          text
        });
        const typedResult = result;
        return {
          content: [
            {
              type: "text",
              text: `Updated text content of node "${typedResult.name}" to "${text}"`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error setting text content: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );
  server.tool(
    "set_multiple_text_contents",
    "Set multiple text contents parallelly in a node",
    {
      nodeId: z4.string().describe("The ID of the node containing the text nodes to replace"),
      text: z4.array(
        z4.object({
          nodeId: z4.string().describe("The ID of the text node"),
          text: z4.string().describe("The replacement text")
        })
      ).describe("Array of text node IDs and their replacement texts")
    },
    async ({ nodeId, text }, extra) => {
      try {
        if (!text || text.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: "No text provided"
              }
            ]
          };
        }
        const initialStatus = {
          type: "text",
          text: `Starting text replacement for ${text.length} nodes. This will be processed in batches of 5...`
        };
        let totalProcessed = 0;
        const totalToProcess = text.length;
        const result = await sendCommandToFigma("set_multiple_text_contents", {
          nodeId,
          text
        });
        const typedResult = result;
        const success = typedResult.replacementsApplied && typedResult.replacementsApplied > 0;
        const progressText = `
        Text replacement completed:
        - ${typedResult.replacementsApplied || 0} of ${totalToProcess} successfully updated
        - ${typedResult.replacementsFailed || 0} failed
        - Processed in ${typedResult.completedInChunks || 1} batches
        `;
        const detailedResults = typedResult.results || [];
        const failedResults = detailedResults.filter((item) => !item.success);
        let detailedResponse = "";
        if (failedResults.length > 0) {
          detailedResponse = `

Nodes that failed:
${failedResults.map(
            (item) => `- ${item.nodeId}: ${item.error || "Unknown error"}`
          ).join("\n")}`;
        }
        return {
          content: [
            initialStatus,
            {
              type: "text",
              text: progressText + detailedResponse
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error setting multiple text contents: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );
  server.tool(
    "set_font_name",
    "Set the font name and style of a text node in Figma",
    {
      nodeId: z4.string().describe("The ID of the text node to modify"),
      family: z4.string().describe("Font family name"),
      style: z4.string().optional().describe("Font style (e.g., 'Regular', 'Bold', 'Italic')")
    },
    async ({ nodeId, family, style }) => {
      try {
        const result = await sendCommandToFigma("set_font_name", {
          nodeId,
          family,
          style
        });
        const typedResult = result;
        return {
          content: [
            {
              type: "text",
              text: `Updated font of node "${typedResult.name}" to ${typedResult.fontName.family} ${typedResult.fontName.style}`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error setting font name: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );
  server.tool(
    "set_font_size",
    "Set the font size of a text node in Figma",
    {
      nodeId: z4.string().describe("The ID of the text node to modify"),
      fontSize: z4.number().positive().describe("Font size in pixels")
    },
    async ({ nodeId, fontSize }) => {
      try {
        const result = await sendCommandToFigma("set_font_size", {
          nodeId,
          fontSize
        });
        const typedResult = result;
        return {
          content: [
            {
              type: "text",
              text: `Updated font size of node "${typedResult.name}" to ${typedResult.fontSize}px`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error setting font size: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );
  server.tool(
    "set_font_weight",
    "Set the font weight of a text node in Figma",
    {
      nodeId: z4.string().describe("The ID of the text node to modify"),
      weight: z4.number().describe("Font weight (100, 200, 300, 400, 500, 600, 700, 800, 900)")
    },
    async ({ nodeId, weight }) => {
      try {
        const result = await sendCommandToFigma("set_font_weight", {
          nodeId,
          weight
        });
        const typedResult = result;
        return {
          content: [
            {
              type: "text",
              text: `Updated font weight of node "${typedResult.name}" to ${typedResult.weight} (${typedResult.fontName.style})`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error setting font weight: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );
  server.tool(
    "set_letter_spacing",
    "Set the letter spacing of a text node in Figma",
    {
      nodeId: z4.string().describe("The ID of the text node to modify"),
      letterSpacing: z4.number().describe("Letter spacing value"),
      unit: z4.enum(["PIXELS", "PERCENT"]).optional().describe("Unit type (PIXELS or PERCENT)")
    },
    async ({ nodeId, letterSpacing, unit }) => {
      try {
        const result = await sendCommandToFigma("set_letter_spacing", {
          nodeId,
          letterSpacing,
          unit: unit || "PIXELS"
        });
        const typedResult = result;
        return {
          content: [
            {
              type: "text",
              text: `Updated letter spacing of node "${typedResult.name}" to ${typedResult.letterSpacing.value} ${typedResult.letterSpacing.unit}`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error setting letter spacing: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );
  server.tool(
    "set_line_height",
    "Set the line height of a text node in Figma",
    {
      nodeId: z4.string().describe("The ID of the text node to modify"),
      lineHeight: z4.number().describe("Line height value"),
      unit: z4.enum(["PIXELS", "PERCENT", "AUTO"]).optional().describe("Unit type (PIXELS, PERCENT, or AUTO)")
    },
    async ({ nodeId, lineHeight, unit }) => {
      try {
        const result = await sendCommandToFigma("set_line_height", {
          nodeId,
          lineHeight,
          unit: unit || "PIXELS"
        });
        const typedResult = result;
        return {
          content: [
            {
              type: "text",
              text: `Updated line height of node "${typedResult.name}" to ${typedResult.lineHeight.value} ${typedResult.lineHeight.unit}`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error setting line height: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );
  server.tool(
    "set_paragraph_spacing",
    "Set the paragraph spacing of a text node in Figma",
    {
      nodeId: z4.string().describe("The ID of the text node to modify"),
      paragraphSpacing: z4.number().describe("Paragraph spacing value in pixels")
    },
    async ({ nodeId, paragraphSpacing }) => {
      try {
        const result = await sendCommandToFigma("set_paragraph_spacing", {
          nodeId,
          paragraphSpacing
        });
        const typedResult = result;
        return {
          content: [
            {
              type: "text",
              text: `Updated paragraph spacing of node "${typedResult.name}" to ${typedResult.paragraphSpacing}px`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error setting paragraph spacing: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );
  server.tool(
    "set_text_case",
    "Set the text case of a text node in Figma",
    {
      nodeId: z4.string().describe("The ID of the text node to modify"),
      textCase: z4.enum(["ORIGINAL", "UPPER", "LOWER", "TITLE"]).describe("Text case type")
    },
    async ({ nodeId, textCase }) => {
      try {
        const result = await sendCommandToFigma("set_text_case", {
          nodeId,
          textCase
        });
        const typedResult = result;
        return {
          content: [
            {
              type: "text",
              text: `Updated text case of node "${typedResult.name}" to ${typedResult.textCase}`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error setting text case: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );
  server.tool(
    "set_text_decoration",
    "Set the text decoration of a text node in Figma",
    {
      nodeId: z4.string().describe("The ID of the text node to modify"),
      textDecoration: z4.enum(["NONE", "UNDERLINE", "STRIKETHROUGH"]).describe("Text decoration type")
    },
    async ({ nodeId, textDecoration }) => {
      try {
        const result = await sendCommandToFigma("set_text_decoration", {
          nodeId,
          textDecoration
        });
        const typedResult = result;
        return {
          content: [
            {
              type: "text",
              text: `Updated text decoration of node "${typedResult.name}" to ${typedResult.textDecoration}`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error setting text decoration: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );
  server.tool(
    "get_styled_text_segments",
    "Get text segments with specific styling in a text node",
    {
      nodeId: z4.string().describe("The ID of the text node to analyze"),
      property: z4.enum([
        "fillStyleId",
        "fontName",
        "fontSize",
        "textCase",
        "textDecoration",
        "textStyleId",
        "fills",
        "letterSpacing",
        "lineHeight",
        "fontWeight"
      ]).describe("The style property to analyze segments by")
    },
    async ({ nodeId, property }) => {
      try {
        const result = await sendCommandToFigma("get_styled_text_segments", {
          nodeId,
          property
        });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error getting styled text segments: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );
  server.tool(
    "set_text_style_id",
    "Apply a text style to a text node in Figma",
    {
      nodeId: z4.string().describe("The ID of the text node to modify"),
      textStyleId: z4.string().describe("The ID of the text style to apply")
    },
    async ({ nodeId, textStyleId }) => {
      try {
        const result = await sendCommandToFigma("set_text_style_id", {
          nodeId,
          textStyleId
        });
        const typedResult = result;
        return {
          content: [
            {
              type: "text",
              text: `Applied text style "${typedResult.styleName}" to node "${typedResult.name}"`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error setting text style: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );
  server.tool(
    "load_font_async",
    "Load a font asynchronously in Figma",
    {
      family: z4.string().describe("Font family name"),
      style: z4.string().optional().describe("Font style (e.g., 'Regular', 'Bold', 'Italic')")
    },
    async ({ family, style }) => {
      try {
        const result = await sendCommandToFigma("load_font_async", {
          family,
          style: style || "Regular"
        });
        const typedResult = result;
        return {
          content: [
            {
              type: "text",
              text: typedResult.message || `Loaded font ${family} ${style || "Regular"}`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error loading font: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );
  server.tool(
    "set_text_align",
    "Set the text alignment of a text node in Figma. Use textAlignHorizontal RIGHT for RTL/Arabic text.",
    {
      nodeId: z4.string().describe("The ID of the text node to modify"),
      textAlignHorizontal: z4.enum(["LEFT", "CENTER", "RIGHT", "JUSTIFIED"]).optional().describe("Horizontal text alignment (LEFT, CENTER, RIGHT, JUSTIFIED). Use RIGHT for Arabic/RTL text."),
      textAlignVertical: z4.enum(["TOP", "CENTER", "BOTTOM"]).optional().describe("Vertical text alignment (TOP, CENTER, BOTTOM)")
    },
    async ({ nodeId, textAlignHorizontal, textAlignVertical }) => {
      try {
        const result = await sendCommandToFigma("set_text_align", {
          nodeId,
          textAlignHorizontal,
          textAlignVertical
        });
        const typedResult = result;
        return {
          content: [
            {
              type: "text",
              text: `Updated text alignment of node "${typedResult.name}" to horizontal: ${typedResult.textAlignHorizontal}, vertical: ${typedResult.textAlignVertical}`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error setting text alignment: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );
}

// src/talk_to_figma_mcp/tools/component-tools.ts
import { z as z5 } from "zod";
function registerComponentTools(server) {
  server.tool(
    "create_component_instance",
    "Create an instance of a component in Figma",
    {
      componentKey: z5.string().describe("Key of the component to instantiate"),
      x: z5.number().describe("X position (local coordinates, relative to parent)"),
      y: z5.number().describe("Y position (local coordinates, relative to parent)")
    },
    async ({ componentKey, x, y }) => {
      try {
        const result = await sendCommandToFigma("create_component_instance", {
          componentKey,
          x,
          y
        });
        const typedResult = result;
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(typedResult)
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error creating component instance: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );
  server.tool(
    "create_component_from_node",
    "Convert an existing node (frame, group, etc.) into a reusable component in Figma",
    {
      nodeId: z5.string().describe("The ID of the node to convert into a component"),
      name: z5.string().optional().describe("Optional new name for the component")
    },
    async ({ nodeId, name }) => {
      try {
        const result = await sendCommandToFigma("create_component_from_node", {
          nodeId,
          name
        });
        const typedResult = result;
        return {
          content: [
            {
              type: "text",
              text: `Created component "${typedResult.name}" with ID: ${typedResult.id} and key: ${typedResult.key}. You can now create instances of this component using the key.`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error creating component from node: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );
  server.tool(
    "create_component_set",
    "Create a component set (variants) from multiple component nodes in Figma",
    {
      componentIds: z5.array(z5.string()).describe("Array of component node IDs to combine into a component set"),
      name: z5.string().optional().describe("Optional name for the component set")
    },
    async ({ componentIds, name }) => {
      try {
        const result = await sendCommandToFigma("create_component_set", {
          componentIds,
          name
        });
        const typedResult = result;
        return {
          content: [
            {
              type: "text",
              text: `Created component set "${typedResult.name}" with ID: ${typedResult.id}, key: ${typedResult.key}, containing ${typedResult.variantCount} variants.`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error creating component set: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );
  server.tool(
    "set_instance_variant",
    "Change the variant properties of a component instance without recreating it. This preserves instance overrides and is more efficient than delete + create workflow.",
    {
      nodeId: z5.string().describe("The ID of the instance node to modify"),
      properties: z5.record(z5.string()).describe('Variant properties to set as key-value pairs (e.g., { "State": "Hover", "Size": "Large" })')
    },
    async ({ nodeId, properties }) => {
      try {
        const result = await sendCommandToFigma("set_instance_variant", {
          nodeId,
          properties
        });
        const typedResult = result;
        return {
          content: [
            {
              type: "text",
              text: `Successfully changed variant properties of instance "${typedResult.name}" (ID: ${typedResult.id}). New properties: ${JSON.stringify(typedResult.properties)}`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error setting instance variant: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );
}

// src/talk_to_figma_mcp/tools/image-tools.ts
import { z as z6 } from "zod";
function registerImageTools(server) {
  server.tool(
    "set_image_fill",
    "Apply image to node from URL or base64 data",
    {
      nodeId: z6.string().describe("The ID of the node to apply image to"),
      imageSource: z6.string().describe("Image URL or base64 data string"),
      sourceType: z6.enum(["url", "base64"]).describe("Source type: 'url' for image URL, 'base64' for base64 encoded data"),
      scaleMode: z6.enum(["FILL", "FIT", "CROP", "TILE"]).optional().describe("Image scaling mode (default: FILL)")
    },
    async ({ nodeId, imageSource, sourceType, scaleMode }) => {
      try {
        const result = await sendCommandToFigma("set_image_fill", {
          nodeId,
          imageSource,
          sourceType,
          scaleMode: scaleMode || "FILL"
        }, 6e4);
        const typedResult = result;
        return {
          content: [
            {
              type: "text",
              text: `Set image fill on node "${typedResult.name}" with scaleMode: ${typedResult.scaleMode}`
            }
          ]
        };
      } catch (error) {
        throw new Error(`Error setting image fill: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  );
  server.tool(
    "get_image_from_node",
    "Extract image metadata from a node",
    {
      nodeId: z6.string().describe("The ID of the node to get image from")
    },
    async ({ nodeId }) => {
      try {
        const result = await sendCommandToFigma("get_image_from_node", { nodeId });
        const typedResult = result;
        if (!typedResult.hasImage) {
          return {
            content: [
              {
                type: "text",
                text: `Node "${typedResult.name}" does not have an image fill`
              }
            ]
          };
        }
        return {
          content: [
            {
              type: "text",
              text: `Image on node "${typedResult.name}":
- Hash: ${typedResult.imageHash}
- Scale Mode: ${typedResult.scaleMode}
- Image Size: ${typedResult.imageSize?.width}x${typedResult.imageSize?.height}
- Rotation: ${typedResult.rotation}\xB0
- Filters: ${typedResult.filters ? JSON.stringify(typedResult.filters) : "none"}`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error getting image from node: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );
  server.tool(
    "replace_image_fill",
    "Replace existing image on node with new image while preserving transform",
    {
      nodeId: z6.string().describe("The ID of the node with image to replace"),
      newImageSource: z6.string().describe("New image URL or base64 data"),
      sourceType: z6.enum(["url", "base64"]).describe("Source type: 'url' or 'base64'"),
      preserveTransform: z6.boolean().optional().describe("Preserve existing image transform (default: true)")
    },
    async ({ nodeId, newImageSource, sourceType, preserveTransform }) => {
      try {
        const result = await sendCommandToFigma("replace_image_fill", {
          nodeId,
          newImageSource,
          sourceType,
          preserveTransform: preserveTransform !== false
        }, 6e4);
        const typedResult = result;
        return {
          content: [
            {
              type: "text",
              text: `Replaced image on node "${typedResult.name}"${typedResult.preserved ? " (transform preserved)" : ""}`
            }
          ]
        };
      } catch (error) {
        throw new Error(`Error replacing image fill: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  );
  server.tool(
    "apply_image_transform",
    "Adjust image position, scale, and rotation within node. Rotates the IMAGE inside the node, not the node itself.",
    {
      nodeId: z6.string().describe("The ID of the node to transform image on"),
      scaleMode: z6.enum(["FILL", "FIT", "CROP", "TILE"]).optional().describe("Change scale mode"),
      rotation: z6.union([z6.literal(0), z6.literal(90), z6.literal(180), z6.literal(270)]).optional().describe("Rotation in 90-degree increments (0, 90, 180, 270). Rotates the IMAGE inside the node, not the node itself."),
      translateX: z6.number().optional().describe("Horizontal translation offset"),
      translateY: z6.number().optional().describe("Vertical translation offset"),
      scale: z6.number().positive().optional().describe("Scale factor (1 = 100%)")
    },
    async ({ nodeId, scaleMode, rotation, translateX, translateY, scale }) => {
      try {
        const result = await sendCommandToFigma("apply_image_transform", {
          nodeId,
          scaleMode,
          rotation,
          translateX,
          translateY,
          scale
        });
        const typedResult = result;
        return {
          content: [
            {
              type: "text",
              text: `Applied image transform to node "${typedResult.name}": ${typedResult.transformApplied.join(", ")}`
            }
          ]
        };
      } catch (error) {
        throw new Error(`Error applying image transform: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  );
  server.tool(
    "set_image_filters",
    "Apply color and light adjustments to image fills",
    {
      nodeId: z6.string().describe("The ID of the node with image fill"),
      exposure: z6.number().min(-1).max(1).optional().describe("Brightness adjustment (-1.0 to 1.0)"),
      contrast: z6.number().min(-1).max(1).optional().describe("Contrast adjustment (-1.0 to 1.0)"),
      saturation: z6.number().min(-1).max(1).optional().describe("Color intensity (-1.0 to 1.0, -1 = grayscale)"),
      temperature: z6.number().min(-1).max(1).optional().describe("Warm/cool tint (-1.0 to 1.0)"),
      tint: z6.number().min(-1).max(1).optional().describe("Green/magenta shift (-1.0 to 1.0)"),
      highlights: z6.number().min(-1).max(1).optional().describe("Bright area adjustment (-1.0 to 1.0)"),
      shadows: z6.number().min(-1).max(1).optional().describe("Dark area adjustment (-1.0 to 1.0)")
    },
    async ({ nodeId, exposure, contrast, saturation, temperature, tint, highlights, shadows }) => {
      try {
        const filters = {};
        if (exposure !== void 0) filters.exposure = exposure;
        if (contrast !== void 0) filters.contrast = contrast;
        if (saturation !== void 0) filters.saturation = saturation;
        if (temperature !== void 0) filters.temperature = temperature;
        if (tint !== void 0) filters.tint = tint;
        if (highlights !== void 0) filters.highlights = highlights;
        if (shadows !== void 0) filters.shadows = shadows;
        const result = await sendCommandToFigma("set_image_filters", {
          nodeId,
          filters
        });
        const typedResult = result;
        return {
          content: [
            {
              type: "text",
              text: `Applied image filters to node "${typedResult.name}": ${JSON.stringify(typedResult.appliedFilters)}`
            }
          ]
        };
      } catch (error) {
        throw new Error(`Error setting image filters: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  );
}

// src/talk_to_figma_mcp/tools/svg-tools.ts
import { z as z7 } from "zod";
function registerSvgTools(server) {
  server.tool(
    "set_svg",
    "Import an SVG string as a vector node in Figma. The SVG is sanitized (scripts and external resources are stripped) before import. Max 500KB.",
    {
      svgString: z7.string().max(5e5).describe("SVG markup string (max 500KB). Must contain a valid <svg> element."),
      x: z7.number().optional().describe("X position for the imported SVG (default: 0)"),
      y: z7.number().optional().describe("Y position for the imported SVG (default: 0)"),
      name: z7.string().optional().describe("Optional name for the imported node"),
      parentId: z7.string().optional().describe("Optional parent node ID to place the SVG into")
    },
    async ({ svgString, x, y, name, parentId }) => {
      try {
        const result = await sendCommandToFigma("set_svg", {
          svgString,
          x: x || 0,
          y: y || 0,
          name,
          parentId
        });
        const typedResult = result;
        return {
          content: [
            {
              type: "text",
              text: `Imported SVG as "${typedResult.name}" with ID: ${typedResult.id} (${typedResult.width}x${typedResult.height})`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error importing SVG: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );
  server.tool(
    "get_svg",
    "Export a single node as an SVG string from Figma. Returns the SVG markup including all nested children.",
    {
      nodeId: z7.string().describe("The ID of the node to export as SVG")
    },
    async ({ nodeId }) => {
      try {
        const result = await sendCommandToFigma("get_svg", { nodeId }, 12e4);
        const typedResult = result;
        return {
          content: [
            {
              type: "text",
              text: typedResult.svgString
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error exporting SVG: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );
}

// src/talk_to_figma_mcp/tools/variable-tools.ts
import { z as z8 } from "zod";
function registerVariableTools(server) {
  server.tool(
    "get_variables",
    "List all variable collections and their variables in the current Figma file. Returns collections with their modes and variables.",
    {},
    async () => {
      try {
        const result = await sendCommandToFigma("get_variables", {});
        const typedResult = result;
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(typedResult, null, 2)
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error getting variables: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );
  server.tool(
    "set_variable",
    "Create or update a variable in a Figma variable collection. Creates the collection if collectionName is provided and it doesn't exist.",
    {
      collectionId: z8.string().optional().describe("ID of an existing variable collection"),
      collectionName: z8.string().optional().describe("Name for a new collection (used if collectionId not provided)"),
      name: z8.string().describe("Variable name"),
      resolvedType: z8.enum(["COLOR", "FLOAT", "STRING", "BOOLEAN"]).describe("Variable type"),
      value: z8.any().describe("Variable value. COLOR: {r,g,b,a} (0-1). FLOAT: number. STRING: string. BOOLEAN: boolean."),
      modeId: z8.string().optional().describe("Mode ID to set the value for (uses default mode if omitted)")
    },
    async ({ collectionId, collectionName, name, resolvedType, value, modeId }) => {
      try {
        const result = await sendCommandToFigma("set_variable", {
          collectionId,
          collectionName,
          name,
          resolvedType,
          value,
          modeId
        });
        const typedResult = result;
        return {
          content: [
            {
              type: "text",
              text: `Set variable "${typedResult.variableName}" in collection "${typedResult.collectionName}" (ID: ${typedResult.variableId})`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error setting variable: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );
  server.tool(
    "apply_variable_to_node",
    "Bind a variable to a node property in Figma. Call once per field \u2014 for multiple fields, call multiple times.",
    {
      nodeId: z8.string().describe("The ID of the node to bind the variable to"),
      variableId: z8.string().describe("The ID of the variable to bind"),
      field: z8.string().describe("The node property field to bind (e.g., 'fills/0/color', 'opacity', 'width', 'height')")
    },
    async ({ nodeId, variableId, field }) => {
      try {
        const result = await sendCommandToFigma("apply_variable_to_node", {
          nodeId,
          variableId,
          field
        });
        const typedResult = result;
        return {
          content: [
            {
              type: "text",
              text: `Bound variable "${typedResult.variableName}" to field "${typedResult.field}" on node "${typedResult.nodeName}"`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error applying variable to node: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );
  server.tool(
    "switch_variable_mode",
    "Switch the variable mode on a node for a specific collection. This changes which mode's values are used for bound variables.",
    {
      nodeId: z8.string().describe("The ID of the node to switch mode on"),
      collectionId: z8.string().describe("The ID of the variable collection"),
      modeId: z8.string().describe("The ID of the mode to switch to")
    },
    async ({ nodeId, collectionId, modeId }) => {
      try {
        const result = await sendCommandToFigma("switch_variable_mode", {
          nodeId,
          collectionId,
          modeId
        });
        const typedResult = result;
        return {
          content: [
            {
              type: "text",
              text: `Switched to mode "${typedResult.modeName}" for collection "${typedResult.collectionName}" on node "${typedResult.nodeName}"`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error switching variable mode: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );
}

// src/talk_to_figma_mcp/tools/figjam-tools.ts
import { z as z9 } from "zod";
function registerFigJamTools(server) {
  server.tool(
    "get_figjam_elements",
    "Get all FigJam-specific elements (stickies, connectors, shapes with text, sections, stamps) on the current page. Use this to read the contents of a FigJam board.",
    {},
    async () => {
      try {
        const result = await sendCommandToFigma("get_figjam_elements", {});
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error getting FigJam elements: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );
  server.tool(
    "create_sticky",
    "Create a sticky note in a FigJam board. Sticky notes are the primary way to add text content in FigJam.",
    {
      x: z9.number().describe("X position on the canvas"),
      y: z9.number().describe("Y position on the canvas"),
      text: z9.string().describe("Text content of the sticky note"),
      color: z9.enum([
        "yellow",
        "pink",
        "green",
        "blue",
        "purple",
        "red",
        "orange",
        "teal",
        "gray",
        "white"
      ]).optional().describe(
        "Background color of the sticky note (default: yellow). Supported values: yellow, pink, green, blue, purple, red, orange, teal, gray, white."
      ),
      isWide: z9.boolean().optional().describe("Whether the sticky note should be wide format (default: false)"),
      name: z9.string().optional().describe("Optional name/label for the node"),
      parentId: z9.string().optional().describe("Optional parent node ID (e.g. a section) to place the sticky into")
    },
    async ({ x, y, text, color, isWide, name, parentId }) => {
      try {
        const result = await sendCommandToFigma("create_sticky", {
          x,
          y,
          text,
          color: color ?? "yellow",
          isWide: isWide ?? false,
          name,
          parentId
        });
        return {
          content: [
            {
              type: "text",
              text: `Created sticky note: ${JSON.stringify(result)}`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error creating sticky note: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );
  server.tool(
    "set_sticky_text",
    "Update the text content of an existing FigJam sticky note.",
    {
      nodeId: z9.string().describe("The ID of the sticky note node to update"),
      text: z9.string().describe("The new text content")
    },
    async ({ nodeId, text }) => {
      try {
        const result = await sendCommandToFigma("set_sticky_text", {
          nodeId,
          text
        });
        return {
          content: [
            {
              type: "text",
              text: `Updated sticky note text: ${JSON.stringify(result)}`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error updating sticky note text: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );
  server.tool(
    "create_shape_with_text",
    "Create a FigJam shape with text inside. Useful for flowcharts, diagrams, and process maps. Supported shapes: SQUARE, ELLIPSE, ROUNDED_RECTANGLE, DIAMOND, TRIANGLE_UP, TRIANGLE_DOWN, PARALLELOGRAM_RIGHT, PARALLELOGRAM_LEFT.",
    {
      x: z9.number().describe("X position on the canvas"),
      y: z9.number().describe("Y position on the canvas"),
      width: z9.number().optional().describe("Width of the shape (default: 200)"),
      height: z9.number().optional().describe("Height of the shape (default: 200)"),
      shapeType: z9.enum([
        "SQUARE",
        "ELLIPSE",
        "ROUNDED_RECTANGLE",
        "DIAMOND",
        "TRIANGLE_UP",
        "TRIANGLE_DOWN",
        "PARALLELOGRAM_RIGHT",
        "PARALLELOGRAM_LEFT"
      ]).optional().describe("The shape type (default: ROUNDED_RECTANGLE)"),
      text: z9.string().optional().describe("Text to display inside the shape"),
      fillColor: z9.object({
        r: z9.number().min(0).max(1).describe("Red (0-1)"),
        g: z9.number().min(0).max(1).describe("Green (0-1)"),
        b: z9.number().min(0).max(1).describe("Blue (0-1)"),
        a: z9.number().min(0).max(1).optional().describe("Alpha (0-1)")
      }).optional().describe("Fill color in RGBA format (0-1 range each component)"),
      name: z9.string().optional().describe("Optional name for the node"),
      parentId: z9.string().optional().describe("Optional parent node ID to place the shape into")
    },
    async ({ x, y, width, height, shapeType, text, fillColor, name, parentId }) => {
      try {
        const result = await sendCommandToFigma("create_shape_with_text", {
          x,
          y,
          width: width ?? 200,
          height: height ?? 200,
          shapeType: shapeType ?? "ROUNDED_RECTANGLE",
          text: text ?? "",
          fillColor,
          name,
          parentId
        });
        return {
          content: [
            {
              type: "text",
              text: `Created shape with text: ${JSON.stringify(result)}`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error creating shape with text: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );
  server.tool(
    "create_connector",
    "Create a connector (arrow or line) in FigJam. Connectors can link two existing nodes by ID, or connect arbitrary canvas positions. Use this to draw flow arrows between stickies, shapes, etc.",
    {
      startNodeId: z9.string().optional().describe("ID of the node where the connector starts (omit to use startX/startY)"),
      startX: z9.number().optional().describe("X position of the connector start point (used when startNodeId is not provided)"),
      startY: z9.number().optional().describe("Y position of the connector start point (used when startNodeId is not provided)"),
      endNodeId: z9.string().optional().describe("ID of the node where the connector ends (omit to use endX/endY)"),
      endX: z9.number().optional().describe("X position of the connector end point (used when endNodeId is not provided)"),
      endY: z9.number().optional().describe("Y position of the connector end point (used when endNodeId is not provided)"),
      connectorLineType: z9.enum(["ELBOWED", "STRAIGHT", "CURVED"]).optional().describe("Line routing style (default: ELBOWED)"),
      startStrokeCap: z9.enum(["NONE", "ARROW", "ARROW_EQUILATERAL", "CIRCLE_FILLED", "DIAMOND_FILLED"]).optional().describe("Arrowhead at the start (default: NONE)"),
      endStrokeCap: z9.enum(["NONE", "ARROW", "ARROW_EQUILATERAL", "CIRCLE_FILLED", "DIAMOND_FILLED"]).optional().describe("Arrowhead at the end (default: ARROW)"),
      strokeColor: z9.object({
        r: z9.number().min(0).max(1),
        g: z9.number().min(0).max(1),
        b: z9.number().min(0).max(1),
        a: z9.number().min(0).max(1).optional()
      }).optional().describe("Stroke color in RGBA format"),
      strokeWeight: z9.number().positive().optional().describe("Stroke weight / line thickness"),
      name: z9.string().optional().describe("Optional name for the connector node")
    },
    async ({
      startNodeId,
      startX,
      startY,
      endNodeId,
      endX,
      endY,
      connectorLineType,
      startStrokeCap,
      endStrokeCap,
      strokeColor,
      strokeWeight,
      name
    }) => {
      try {
        const result = await sendCommandToFigma("create_connector", {
          startNodeId,
          startX,
          startY,
          endNodeId,
          endX,
          endY,
          connectorLineType: connectorLineType ?? "ELBOWED",
          startStrokeCap: startStrokeCap ?? "NONE",
          endStrokeCap: endStrokeCap ?? "ARROW",
          strokeColor,
          strokeWeight,
          name
        });
        return {
          content: [
            {
              type: "text",
              text: `Created connector: ${JSON.stringify(result)}`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error creating connector: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );
  server.tool(
    "create_section",
    "Create a FigJam section. Sections are used to group and organise content on the FigJam board. They appear as labelled coloured regions.",
    {
      x: z9.number().describe("X position on the canvas"),
      y: z9.number().describe("Y position on the canvas"),
      width: z9.number().optional().describe("Width of the section (default: 800)"),
      height: z9.number().optional().describe("Height of the section (default: 600)"),
      name: z9.string().optional().describe("Label / name for the section"),
      fillColor: z9.object({
        r: z9.number().min(0).max(1),
        g: z9.number().min(0).max(1),
        b: z9.number().min(0).max(1),
        a: z9.number().min(0).max(1).optional()
      }).optional().describe("Background fill color in RGBA format")
    },
    async ({ x, y, width, height, name, fillColor }) => {
      try {
        const result = await sendCommandToFigma("create_section", {
          x,
          y,
          width: width ?? 800,
          height: height ?? 600,
          name: name ?? "Section",
          fillColor
        });
        return {
          content: [
            {
              type: "text",
              text: `Created section: ${JSON.stringify(result)}`
            }
          ]
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error creating section: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
  );
}

// src/talk_to_figma_mcp/tools/index.ts
function registerTools(server) {
  registerDocumentTools(server);
  registerCreationTools(server);
  registerModificationTools(server);
  registerTextTools(server);
  registerComponentTools(server);
  registerImageTools(server);
  registerSvgTools(server);
  registerVariableTools(server);
  registerFigJamTools(server);
}

// src/talk_to_figma_mcp/prompts/index.ts
function registerPrompts(server) {
  server.prompt(
    "design_strategy",
    "Best practices for working with Figma designs",
    (extra) => {
      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: `When working with Figma designs, follow these best practices:

1. Start with Document Structure:
   - First use get_document_info() to understand the current document
   - Plan your layout hierarchy before creating elements
   - Create a main container frame for each screen/section

2. Naming Conventions:
   - Use descriptive, semantic names for all elements
   - Follow a consistent naming pattern (e.g., "Login Screen", "Logo Container", "Email Input")
   - Group related elements with meaningful names

3. Layout Hierarchy:
   - Create parent frames first, then add child elements
   - For forms/login screens:
     * Start with the main screen container frame
     * Create a logo container at the top
     * Group input fields in their own containers
     * Place action buttons (login, submit) after inputs
     * Add secondary elements (forgot password, signup links) last

4. Input Fields Structure:
   - Create a container frame for each input field
   - Include a label text above or inside the input
   - Group related inputs (e.g., username/password) together

5. Element Creation:
   - Use create_frame() for containers and input fields
   - Use create_text() for labels, buttons text, and links
   - Set appropriate colors and styles:
     * Use fillColor for backgrounds
     * Use strokeColor for borders
     * Set proper fontWeight for different text elements

6. Mofifying existing elements:
  - use set_text_content() to modify text content.

7. Visual Hierarchy:
   - Position elements in logical reading order (top to bottom)
   - Maintain consistent spacing between elements
   - Use appropriate font sizes for different text types:
     * Larger for headings/welcome text
     * Medium for input labels
     * Standard for button text
     * Smaller for helper text/links

8. Best Practices:
   - Verify each creation with get_node_info()
   - Use parentId to maintain proper hierarchy
   - Group related elements together in frames
   - Keep consistent spacing and alignment

Example Login Screen Structure:
- Login Screen (main frame)
  - Logo Container (frame)
    - Logo (image/text)
  - Welcome Text (text)
  - Input Container (frame)
    - Email Input (frame)
      - Email Label (text)
      - Email Field (frame)
    - Password Input (frame)
      - Password Label (text)
      - Password Field (frame)
  - Login Button (frame)
    - Button Text (text)
  - Helper Links (frame)
    - Forgot Password (text)
    - Don't have account (text)`
            }
          }
        ],
        description: "Best practices for working with Figma designs"
      };
    }
  );
  server.prompt(
    "read_design_strategy",
    "Best practices for reading Figma designs",
    (extra) => {
      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: `When reading Figma designs, follow these best practices:

1. Start with selection:
   - First use get_selection() to understand the current selection
   - If no selection ask user to select single or multiple nodes

2. Get node infos of the selected nodes:
   - Use get_nodes_info() to get the information of the selected nodes
   - If no selection ask user to select single or multiple nodes
`
            }
          }
        ],
        description: "Best practices for reading Figma designs"
      };
    }
  );
  server.prompt(
    "text_replacement_strategy",
    "Systematic approach for replacing text in Figma designs",
    (extra) => {
      return {
        messages: [
          {
            role: "assistant",
            content: {
              type: "text",
              text: `# Intelligent Text Replacement Strategy

## 1. Analyze Design & Identify Structure
- Scan text nodes to understand the overall structure of the design
- Use AI pattern recognition to identify logical groupings:
  * Tables (rows, columns, headers, cells)
  * Lists (items, headers, nested lists)
  * Card groups (similar cards with recurring text fields)
  * Forms (labels, input fields, validation text)
  * Navigation (menu items, breadcrumbs)
\`\`\`
scan_text_nodes(nodeId: "node-id")
get_node_info(nodeId: "node-id")  // optional
\`\`\`

## 2. Strategic Chunking for Complex Designs
- Divide replacement tasks into logical content chunks based on design structure
- Use one of these chunking strategies that best fits the design:
  * **Structural Chunking**: Table rows/columns, list sections, card groups
  * **Spatial Chunking**: Top-to-bottom, left-to-right in screen areas
  * **Semantic Chunking**: Content related to the same topic or functionality
  * **Component-Based Chunking**: Process similar component instances together

## 3. Progressive Replacement with Verification
- Create a safe copy of the node for text replacement
- Replace text chunk by chunk with continuous progress updates
- After each chunk is processed:
  * Export that section as a small, manageable image
  * Verify text fits properly and maintain design integrity
  * Fix issues before proceeding to the next chunk

\`\`\`
// Clone the node to create a safe copy
clone_node(nodeId: "selected-node-id", x: [new-x], y: [new-y])

// Replace text chunk by chunk
set_multiple_text_contents(
  nodeId: "parent-node-id", 
  text: [
    { nodeId: "node-id-1", text: "New text 1" },
    // More nodes in this chunk...
  ]
)

// Verify chunk with small, targeted image exports
export_node_as_image(nodeId: "chunk-node-id", format: "PNG", scale: 0.5)
\`\`\`

## 4. Intelligent Handling for Table Data
- For tabular content:
  * Process one row or column at a time
  * Maintain alignment and spacing between cells
  * Consider conditional formatting based on cell content
  * Preserve header/data relationships

## 5. Smart Text Adaptation
- Adaptively handle text based on container constraints:
  * Auto-detect space constraints and adjust text length
  * Apply line breaks at appropriate linguistic points
  * Maintain text hierarchy and emphasis
  * Consider font scaling for critical content that must fit

## 6. Progressive Feedback Loop
- Establish a continuous feedback loop during replacement:
  * Real-time progress updates (0-100%)
  * Small image exports after each chunk for verification
  * Issues identified early and resolved incrementally
  * Quick adjustments applied to subsequent chunks

## 7. Final Verification & Context-Aware QA
- After all chunks are processed:
  * Export the entire design at reduced scale for final verification
  * Check for cross-chunk consistency issues
  * Verify proper text flow between different sections
  * Ensure design harmony across the full composition

## 8. Chunk-Specific Export Scale Guidelines
- Scale exports appropriately based on chunk size:
  * Small chunks (1-5 elements): scale 1.0
  * Medium chunks (6-20 elements): scale 0.7
  * Large chunks (21-50 elements): scale 0.5
  * Very large chunks (50+ elements): scale 0.3
  * Full design verification: scale 0.2

## Sample Chunking Strategy for Common Design Types

### Tables
- Process by logical rows (5-10 rows per chunk)
- Alternative: Process by column for columnar analysis
- Tip: Always include header row in first chunk for reference

### Card Lists
- Group 3-5 similar cards per chunk
- Process entire cards to maintain internal consistency
- Verify text-to-image ratio within cards after each chunk

### Forms
- Group related fields (e.g., "Personal Information", "Payment Details")
- Process labels and input fields together
- Ensure validation messages and hints are updated with their fields

### Navigation & Menus
- Process hierarchical levels together (main menu, submenu)
- Respect information architecture relationships
- Verify menu fit and alignment after replacement

## Best Practices
- **Preserve Design Intent**: Always prioritize design integrity
- **Structural Consistency**: Maintain alignment, spacing, and hierarchy
- **Visual Feedback**: Verify each chunk visually before proceeding
- **Incremental Improvement**: Learn from each chunk to improve subsequent ones
- **Balance Automation & Control**: Let AI handle repetitive replacements but maintain oversight
- **Respect Content Relationships**: Keep related content consistent across chunks

Remember that text is never just text\u2014it's a core design element that must work harmoniously with the overall composition. This chunk-based strategy allows you to methodically transform text while maintaining design integrity.`
            }
          }
        ],
        description: "Systematic approach for replacing text in Figma designs"
      };
    }
  );
}

// src/talk_to_figma_mcp/server.ts
async function main() {
  try {
    const server = new McpServer(SERVER_CONFIG);
    registerTools(server);
    registerPrompts(server);
    try {
      connectToFigma();
    } catch (error) {
      logger.warn(`Could not connect to Figma initially: ${error instanceof Error ? error.message : String(error)}`);
      logger.warn("Will try to connect when the first command is sent");
    }
    const transport = new StdioServerTransport();
    await server.connect(transport);
    logger.info("FigmaMCP server running on stdio");
  } catch (error) {
    logger.error(`Error starting FigmaMCP server: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
main().catch((error) => {
  logger.error(`Error starting FigmaMCP server: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
//# sourceMappingURL=server.js.map