const { spawn } = require("node:child_process");
const { mkdir, writeFile } = require("node:fs/promises");

const PORT = 3199;
const BASE_URL = `http://127.0.0.1:${PORT}`;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(pathname, timeoutMs = 180000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${BASE_URL}${pathname}`, { signal: controller.signal });
    if (!response.ok) throw new Error(`${pathname} HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function waitForServer() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      return await fetchJson("/api/health", 5000);
    } catch {
      await wait(1000);
    }
  }
  throw new Error("Local export server did not start");
}

async function main() {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(PORT) },
    stdio: "inherit",
  });

  try {
    await waitForServer();
    const [health, market, backtest] = await Promise.all([
      fetchJson("/api/health"),
      fetchJson("/api/market"),
      fetchJson("/api/backtest"),
    ]);
    await mkdir("public/data", { recursive: true });
    await writeFile("public/data/health.json", JSON.stringify(health), "utf8");
    await writeFile("public/data/market.json", JSON.stringify(market), "utf8");
    await writeFile("public/data/backtest.json", JSON.stringify(backtest), "utf8");
    console.log("Static GitHub Pages data exported.");
  } finally {
    child.kill();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
