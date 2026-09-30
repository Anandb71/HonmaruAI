#!/usr/bin/env node
// PoC-A load test (docs/architecture/discord-model-platform-plan.md §12):
// posts to one workspace's Durable Object through /v2 and reports latency
// percentiles, throughput, errors and rows written per message.
//
//   API=https://tiktokforwork-staging.<account>.workers.dev \
//   TOKEN=<session token of a member> ORG=<org id> CHANNEL=b:general \
//   RATE=500 SECONDS=600 node scripts/poc-load.mjs
//
// RATE is posts per second, spread over CONCURRENCY connections. Run it from
// more than one machine for rates a single one cannot open.
//
// Pass criteria: p95 < 80 ms, p99 < 200 ms, no errors (in particular no
// "overloaded"), rows written per message ≤ 6.

const API = process.env.API;
const TOKEN = process.env.TOKEN;
const ORG = process.env.ORG;
const CHANNEL = process.env.CHANNEL || "b:general";
const RATE = Number(process.env.RATE || 50);
const SECONDS = Number(process.env.SECONDS || 30);
const CONCURRENCY = Number(process.env.CONCURRENCY || Math.min(256, Math.max(4, RATE / 5)));

if (!API || !TOKEN || !ORG) {
  console.error("Set API, TOKEN and ORG (see the top of this file).");
  process.exit(2);
}

const url = `${API.replace(/\/$/, "")}/v2/w/${encodeURIComponent(ORG)}/channels/${encodeURIComponent(CHANNEL)}/messages`;
const latencies = [];
const errors = new Map();
let rowsWritten = 0;
let sent = 0;
const started = Date.now();
const deadline = started + SECONDS * 1000;
const interval = 1000 / (RATE / CONCURRENCY);

async function worker(n) {
  let next = Date.now() + Math.random() * interval;
  while (Date.now() < deadline) {
    const wait = next - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    next += interval;
    const t0 = performance.now();
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", "x-session-token": TOKEN },
        body: JSON.stringify({ body: `load ${n}-${sent} ${new Date().toISOString()}` }),
      });
      const ms = performance.now() - t0;
      if (res.status === 201) {
        latencies.push(ms);
        rowsWritten += Number(res.headers.get("x-rows-written") || 0);
      } else {
        const text = (await res.text()).slice(0, 120);
        const key = `${res.status} ${text}`;
        errors.set(key, (errors.get(key) || 0) + 1);
      }
    } catch (err) {
      const key = String(err?.message || err).slice(0, 120);
      errors.set(key, (errors.get(key) || 0) + 1);
    }
    sent += 1;
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => worker(i)));

const seconds = (Date.now() - started) / 1000;
latencies.sort((a, b) => a - b);
const pct = (p) => (latencies.length ? latencies[Math.min(latencies.length - 1, Math.floor((p / 100) * latencies.length))].toFixed(1) : "-");
const ok = latencies.length;
const failed = [...errors.values()].reduce((a, b) => a + b, 0);
const perMessage = ok ? rowsWritten / ok : 0;
const result = {
  url, seconds: Number(seconds.toFixed(1)), sent, ok, failed,
  throughput: Number((ok / seconds).toFixed(1)),
  p50: pct(50), p95: pct(95), p99: pct(99),
  rowsWrittenPerMessage: Number(perMessage.toFixed(2)),
  errors: Object.fromEntries(errors),
};
console.log(JSON.stringify(result, null, 2));

const pass = failed === 0 && Number(pct(95)) < 80 && Number(pct(99)) < 200 && perMessage <= 6;
console.log(pass ? "PASS" : "FAIL");
process.exit(pass ? 0 : 1);
