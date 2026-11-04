import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const child = spawn(process.execPath, ["mcp/server.mjs"], {
  cwd: root,
  stdio: ["pipe", "pipe", "pipe"],
});

let out = "";
let err = "";
child.stdout.setEncoding("utf8");
child.stderr.setEncoding("utf8");
child.stdout.on("data", (chunk) => {
  out += chunk;
});
child.stderr.on("data", (chunk) => {
  err += chunk;
});

function rpc(id, method, params) {
  const message = { jsonrpc: "2.0", method };
  if (id !== null) message.id = id;
  if (params) message.params = params;
  child.stdin.write(`${JSON.stringify(message)}\n`);
}

rpc(1, "initialize", {
  protocolVersion: "2024-11-05",
  capabilities: {},
  clientInfo: { name: "verify", version: "0" },
});
rpc(null, "notifications/initialized");
rpc(2, "tools/list");
rpc(3, "tools/call", { name: "list_drifts", arguments: {} });
rpc(4, "tools/call", { name: "list_decisions", arguments: {} });
rpc(5, "tools/call", { name: "get_decision", arguments: { id: "dec_billing_annual" } });
rpc(6, "tools/call", { name: "get_decision", arguments: { id: "missing" } });
child.stdin.end();

const exitCode = await new Promise((resolve) => {
  const timer = setTimeout(() => {
    child.kill();
    resolve("timeout");
  }, 4000);
  child.on("exit", (code) => {
    clearTimeout(timer);
    resolve(code);
  });
});

function fail(message) {
  console.error(message);
  console.error(err);
  console.error(out);
  process.exit(1);
}

if (exitCode !== 0) fail(`mcp server exit ${exitCode}`);

const messages = out
  .split("\n")
  .filter((line) => line.trim())
  .map((line) => JSON.parse(line));

const byId = new Map(messages.map((message) => [message.id, message]));
const tools = byId.get(2)?.result?.tools?.map((tool) => tool.name) ?? [];
for (const name of ["list_decisions", "list_drifts", "get_decision"]) {
  if (!tools.includes(name)) fail(`missing tool ${name}`);
}

const drifts = JSON.parse(byId.get(3).result.content[0].text).drifts;
if (drifts[0]?.summary !== "You decided annual billing on Mar 3, but monthly billing on Mar 17.") {
  fail(`bad drift summary ${drifts[0]?.summary}`);
}
if (!drifts[0].earlier.sourceQuote.includes("annual billing as the default")) fail("missing earlier quote");
if (!drifts[0].later.sourceQuote.includes("monthly billing")) fail("missing later quote");

const decisions = JSON.parse(byId.get(4).result.content[0].text).decisions;
if (decisions.length !== 6) fail(`expected 6 decisions, got ${decisions.length}`);

const annual = JSON.parse(byId.get(5).result.content[0].text).decision;
if (annual.speaker !== "Maya Chen") fail("get_decision speaker");
if (byId.get(6).result.isError !== true) fail("missing id should be an error");

console.log("ok mcp");
