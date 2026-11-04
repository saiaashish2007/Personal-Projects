#!/usr/bin/env node
import { detectDrifts, getDecision, loadDecisions } from "./logic.mjs";

/**
 * MCP server over stdio. Reads data/northline.json. Does not start HTTP.
 * Run: node mcp/server.mjs
 */

const TOOLS = [
  {
    name: "list_decisions",
    description: "List Northline decisions in record order, with quotes and sources.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "list_drifts",
    description: "List decisions that reverse an earlier commitment, with both quotes.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "get_decision",
    description: "Fetch one decision by id.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Decision id, for example dec_billing_annual" },
      },
      required: ["id"],
      additionalProperties: false,
    },
  },
];

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function toolResult(id, payload, isError = false) {
  send({
    jsonrpc: "2.0",
    id,
    result: {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      isError,
    },
  });
}

function callTool(name, args) {
  if (name === "list_decisions") return { decisions: loadDecisions() };
  if (name === "list_drifts") return { drifts: detectDrifts() };
  if (name === "get_decision") {
    const id = typeof args?.id === "string" ? args.id : "";
    const decision = getDecision(id);
    if (!decision) return { error: `No decision with id ${id || "(missing)"}` };
    return { decision };
  }
  return null;
}

function handle(message) {
  if (!message || message.jsonrpc !== "2.0" || typeof message.method !== "string") return;
  const { id, method, params } = message;
  const isNotification = id === undefined || method.startsWith("notifications/");
  if (isNotification) return;

  if (method === "initialize") {
    send({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: params?.protocolVersion || "2024-11-05",
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "decision-drift", version: "1.0.0" },
      },
    });
    return;
  }

  if (method === "ping") {
    send({ jsonrpc: "2.0", id, result: {} });
    return;
  }

  if (method === "tools/list") {
    send({ jsonrpc: "2.0", id, result: { tools: TOOLS } });
    return;
  }

  if (method === "tools/call") {
    const name = params?.name;
    const args = params?.arguments ?? {};
    const payload = callTool(name, args);
    if (!payload) {
      toolResult(id, { error: `Unknown tool ${name}` }, true);
      return;
    }
    if (payload.error) {
      toolResult(id, payload, true);
      return;
    }
    toolResult(id, payload);
    return;
  }

  send({
    jsonrpc: "2.0",
    id,
    error: { code: -32601, message: `Method not found: ${method}` },
  });
}

let buffer = "";

function consume() {
  while (buffer.length > 0) {
    if (/^content-length:/i.test(buffer)) {
      const headerEnd = buffer.indexOf("\r\n\r\n");
      const looseEnd = buffer.indexOf("\n\n");
      let sep = -1;
      let sepLen = 4;
      if (headerEnd !== -1 && (looseEnd === -1 || headerEnd <= looseEnd)) {
        sep = headerEnd;
        sepLen = 4;
      } else if (looseEnd !== -1) {
        sep = looseEnd;
        sepLen = 2;
      } else {
        return;
      }
      const match = /content-length:\s*(\d+)/i.exec(buffer.slice(0, sep));
      if (!match) {
        buffer = buffer.slice(sep + sepLen);
        continue;
      }
      const length = Number(match[1]);
      const start = sep + sepLen;
      if (buffer.length < start + length) return;
      const body = buffer.slice(start, start + length);
      buffer = buffer.slice(start + length);
      try {
        handle(JSON.parse(body));
      } catch {
        send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
      }
      continue;
    }

    const newline = buffer.indexOf("\n");
    if (newline === -1) return;
    const line = buffer.slice(0, newline).replace(/\r$/, "");
    buffer = buffer.slice(newline + 1);
    if (!line.trim()) continue;
    try {
      handle(JSON.parse(line));
    } catch {
      send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
    }
  }
}

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  consume();
});
process.stdin.on("end", () => {
  consume();
  setTimeout(() => process.exit(0), 15);
});

console.error("decision-drift MCP server on stdio. Tools: list_decisions, list_drifts, get_decision");
