import Anthropic from "@anthropic-ai/sdk";
import { handleTaken } from "./customAgents.js";
import { aad, openField, sealField } from "./secrets.js";

// AI teammates: Claude working in the workspace's channels the way Claude Tag
// works in Slack. An admin sets it up once, with an API key from an account
// made for it; anyone then writes "@claude" in a channel and it takes the
// thread as its task, works in a sandbox of its own (the team's repositories
// cloned in, the team's tools reached through keys it cannot read), and
// answers in the thread. What it spends is capped by the month.
//
// Claude runs on Anthropic's Managed Agents: one agent, one environment and
// one vault per workspace, made at launch; one session per thread. Devin,
// Cursor and Codex are to come on the same table.

export const PROVIDERS = {
  claude: {
    name: "Claude", handle: "claude", emoji: "✳️",
    models: ["claude-opus-5-5", "claude-sonnet-5-5"],
    defaultModel: "claude-opus-5-5",
  },
};

const ENV_NAME = /^[A-Z][A-Z0-9_]{1,63}$/;
const HOST = /^(\*\.)?([a-z0-9-]+\.)+[a-z]{2,}$/;
const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const MAX_TOOLS = 20;
const MAX_REPOS = 10;
/// A run that has said nothing for this long is given up on.
const STALE_MS = 6 * 60 * 60 * 1000;

const parse = (text, fallback) => { try { return text ? JSON.parse(text) : fallback; } catch { return fallback; } };

export async function loadTeammate(db, orgId, provider) {
  const row = await db.prepare("SELECT * FROM ai_teammates WHERE org_id = ?1 AND provider = ?2").bind(orgId, provider).first().catch(() => null);
  if (!row) return null;
  return {
    orgId: row.org_id, provider: row.provider, enabled: Boolean(row.enabled),
    apiKey: (await openField(row.api_key, aad.teammate(orgId, provider, "api_key"))) || null,
    githubToken: (await openField(row.github_token, aad.teammate(orgId, provider, "github_token"))) || null,
    repos: parse(row.repos, []), model: row.model || PROVIDERS[provider]?.defaultModel || null,
    instructions: row.instructions || "", channels: parse(row.channels, null),
    monthlyLimitCents: row.monthly_limit_cents == null ? null : Number(row.monthly_limit_cents),
    tools: parse(row.tools, []), remote: parse(row.remote, {}), agentId: row.agent_id || null,
    updatedBy: row.updated_by || null, updatedAt: row.updated_at || null,
  };
}

/// What it has spent this month (UTC), in cents: every run's list cost.
export async function spentThisMonth(db, orgId, provider, now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const row = await db.prepare("SELECT COALESCE(SUM(cost_cents), 0) AS c FROM ai_teammate_runs WHERE org_id = ?1 AND provider = ?2 AND created_at >= ?3")
    .bind(orgId, provider, start).first().catch(() => null);
  return Number(row?.c || 0);
}

/// A teammate as the setup screen sees it: never a key, only whether one is set.
export function toClientTeammate(t, provider, spentCents = 0) {
  const p = PROVIDERS[provider];
  return {
    provider, name: p.name, handle: p.handle, models: p.models,
    enabled: Boolean(t?.enabled), hasApiKey: Boolean(t?.apiKey), hasGithubToken: Boolean(t?.githubToken),
    repos: t?.repos || [], model: t?.model || p.defaultModel, instructions: t?.instructions || "",
    channels: t?.channels ?? null,
    monthlyLimitUsd: t?.monthlyLimitCents == null ? null : t.monthlyLimitCents / 100,
    spentThisMonthUsd: spentCents / 100,
    tools: (t?.tools || []).map((x) => ({ name: x.name, secretName: x.secretName, host: x.host })),
    ready: Boolean(t?.enabled && t?.agentId && t?.remote?.agentId),
    updatedAt: t?.updatedAt || null,
  };
}

function client(apiKey) {
  return new Anthropic({ apiKey, maxRetries: 1 });
}

/// What the admin sent, checked; secrets passed through untouched.
function cleanInput(input, current, provider) {
  const p = PROVIDERS[provider];
  const out = {};
  if (typeof input.apiKey === "string") out.apiKey = input.apiKey.trim() || null;
  if (typeof input.githubToken === "string") out.githubToken = input.githubToken.trim() || null;
  if (input.model !== undefined) {
    if (!p.models.includes(input.model)) return { error: "Pick one of the models offered." };
    out.model = input.model;
  }
  if (typeof input.instructions === "string") out.instructions = input.instructions.slice(0, 8000);
  if (input.repos !== undefined) {
    if (!Array.isArray(input.repos) || input.repos.length > MAX_REPOS) return { error: `Up to ${MAX_REPOS} repositories.` };
    const repos = [...new Set(input.repos.map((r) => String(r).trim().replace(/^https:\/\/github\.com\//, "").replace(/\.git$/, "")).filter(Boolean))];
    if (repos.some((r) => !REPO.test(r))) return { error: "Write each repository as owner/name." };
    out.repos = repos;
  }
  if (input.channels !== undefined) {
    if (input.channels === null) out.channels = null;
    else if (Array.isArray(input.channels)) out.channels = [...new Set(input.channels.map(String).filter((c) => /^[bg]:/.test(c)))].slice(0, 200);
    else return { error: "Channels are a list, or everywhere." };
  }
  if (input.monthlyLimitUsd !== undefined) {
    if (input.monthlyLimitUsd === null) out.monthlyLimitCents = null;
    else {
      const usd = Number(input.monthlyLimitUsd);
      if (!Number.isFinite(usd) || usd < 1 || usd > 1000000) return { error: "A monthly limit is between $1 and $1,000,000, or none." };
      out.monthlyLimitCents = Math.round(usd * 100);
    }
  }
  if (input.tools !== undefined) {
    if (!Array.isArray(input.tools) || input.tools.length > MAX_TOOLS) return { error: `Up to ${MAX_TOOLS} tools.` };
    const tools = [];
    for (const t of input.tools) {
      const name = String(t?.name || "").trim().slice(0, 60);
      const secretName = String(t?.secretName || "").trim().toUpperCase();
      const host = String(t?.host || "").trim().toLowerCase();
      if (!name || !ENV_NAME.test(secretName) || !HOST.test(host)) return { error: "Each tool needs a name, a variable name like LINEAR_API_KEY and the host it is sent to, like api.linear.app." };
      const before = (current?.tools || []).find((x) => x.secretName === secretName);
      const secretValue = typeof t.secretValue === "string" && t.secretValue.trim() ? t.secretValue.trim() : null;
      if (!before && !secretValue) return { error: `Paste the key for ${name}.` };
      tools.push({ name, secretName, host, secretValue, credentialId: before?.credentialId || null, before });
    }
    if (new Set(tools.map((t) => t.secretName)).size !== tools.length) return { error: "Each tool needs its own variable name." };
    out.tools = tools;
  }
  if (input.enabled !== undefined) out.enabled = Boolean(input.enabled);
  return { out };
}

function systemPrompt(t, workspaceName) {
  const tools = (t.tools || []).map((x) => `- ${x.name}: $${x.secretName} (for ${x.host})`).join("\n");
  const repos = (t.repos || []).map((r) => `- ${r} at /workspace/${r.split("/")[1]}`).join("\n");
  return [
    `You are Claude, a teammate in the "${workspaceName}" workspace of HonmaruAI, a team chat. People write @claude in a channel or a thread to hand you work, and what you write back is posted into that thread.`,
    "You work in a sandbox of your own. Do the work, then answer: say briefly what you did or found, and link anything you made. Write in the language the request was written in, in plain chat text: short paragraphs or a few bullets, no headings.",
    repos ? `The team's repositories are cloned here:\n${repos}\nFor a code change, work on a new branch, push it, and open a pull request with the GitHub REST API; git and GitHub API calls to these repositories are already authorised. Never push to the default branch.` : "No repository is attached. If a request needs code, say that an admin can grant one in HonmaruAI's Studio.",
    tools ? `These team tools are reachable with the keys in these environment variables (the values are placeholders the network fills in; never print or share them):\n${tools}` : "",
    "Ask one short question instead of guessing when the request is unclear.",
    t.instructions ? `The workspace's own instructions:\n${t.instructions}` : "",
  ].filter(Boolean).join("\n\n");
}

/// The agent, environment and vault behind a teammate, made or brought up
/// to date; the tools' keys moved into the vault. Keys never stay here.
async function provision(t, workspaceName, toolChanges) {
  const api = client(t.apiKey);
  const remote = { ...(t.remote || {}) };
  if (!remote.environmentId) {
    const env = await api.beta.environments.create({ name: `honmaru-${t.orgId}`.slice(0, 60), config: { type: "cloud", networking: { type: "unrestricted" } } });
    remote.environmentId = env.id;
  }
  if (!remote.vaultId) {
    const vault = await api.beta.vaults.create({ display_name: `HonmaruAI ${workspaceName}`.slice(0, 255), metadata: { org: String(t.orgId).slice(0, 512) } });
    remote.vaultId = vault.id;
  }
  const tools = [];
  for (const tool of toolChanges.kept) tools.push(tool);
  for (const tool of toolChanges.removed) {
    if (tool.credentialId) await api.beta.vaults.credentials.delete(tool.credentialId, { vault_id: remote.vaultId }).catch(() => {});
  }
  for (const tool of toolChanges.written) {
    if (tool.credentialId) await api.beta.vaults.credentials.delete(tool.credentialId, { vault_id: remote.vaultId }).catch(() => {});
    const cred = await api.beta.vaults.credentials.create(remote.vaultId, {
      display_name: tool.name,
      auth: {
        type: "environment_variable", secret_name: tool.secretName, secret_value: tool.secretValue,
        networking: { type: "limited", allowed_hosts: [tool.host] }, injection_location: { header: true },
      },
    });
    tools.push({ name: tool.name, secretName: tool.secretName, host: tool.host, credentialId: cred.id });
  }
  const config = {
    name: `Claude · ${workspaceName}`.slice(0, 100),
    model: t.model,
    system: systemPrompt({ ...t, tools }, workspaceName),
    tools: [{ type: "agent_toolset_20260401", default_config: { enabled: true } }],
  };
  if (remote.agentId) {
    const agent = await api.beta.agents.update(remote.agentId, config);
    remote.agentVersion = agent.version;
  } else {
    const agent = await api.beta.agents.create(config);
    remote.agentId = agent.id;
    remote.agentVersion = agent.version;
  }
  return { remote, tools };
}

/// The one custom agent that answers to @claude here, made or hidden.
async function ensureAgentRow(db, orgId, provider, login, on, existingId, members = []) {
  const p = PROVIDERS[provider];
  const now = new Date().toISOString();
  if (!on) {
    if (existingId) await db.prepare("UPDATE custom_agents SET deleted_at = ?3 WHERE org_id = ?1 AND id = ?2").bind(orgId, existingId, now).run();
    return existingId;
  }
  // A person or agent already called @claude keeps the name: this one is
  // then @claude-ai, never silently taking over.
  const id = existingId || `tm-${provider}-${crypto.randomUUID().slice(0, 8)}`;
  if (existingId) {
    await db.prepare("UPDATE custom_agents SET deleted_at = NULL, updated_at = ?3 WHERE org_id = ?1 AND id = ?2").bind(orgId, id, now).run();
  } else {
    const handle = (await handleTaken(db, orgId, p.handle, { members, scope: "team", ownerLogin: login })) ? `${p.handle}-ai` : p.handle;
    await db.prepare(
      `INSERT INTO custom_agents (org_id, id, handle, name, emoji, description, instructions, scope, owner_login, preset, provider, created_at, updated_by, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, '', 'team', ?7, NULL, ?8, ?9, ?7, ?9)`
    ).bind(orgId, id, handle, p.name, p.emoji, `Works on what you hand it in a thread, with the team's repositories and tools.`, login, provider, now).run();
  }
  return id;
}

/// Setup, saved: checked, the Anthropic side made or updated when it is on,
/// and the agent that answers to @claude made or hidden.
export async function saveTeammate(env, orgId, provider, input, { login, workspaceName, members = [] }) {
  if (!PROVIDERS[provider]) return { error: "Unknown teammate." };
  const current = await loadTeammate(env.DB, orgId, provider);
  const { out, error } = cleanInput(input || {}, current, provider);
  if (error) return { error };
  const next = {
    orgId, provider, enabled: current?.enabled || false, apiKey: current?.apiKey || null, githubToken: current?.githubToken || null,
    repos: current?.repos || [], model: current?.model || PROVIDERS[provider].defaultModel, instructions: current?.instructions || "",
    channels: current ? current.channels : null, monthlyLimitCents: current ? current.monthlyLimitCents : 50000,
    tools: current?.tools || [], remote: current?.remote || {}, agentId: current?.agentId || null,
    ...Object.fromEntries(Object.entries(out).filter(([k]) => k !== "tools")),
  };
  if (next.repos.length && !next.githubToken) return { error: "Add a GitHub token so Claude can reach the repositories." };
  let toolChanges = { kept: next.tools, written: [], removed: [] };
  if (out.tools) {
    const keep = new Set(out.tools.map((t) => t.secretName));
    toolChanges = {
      kept: out.tools.filter((t) => !t.secretValue && t.before).map((t) => ({ name: t.name, secretName: t.secretName, host: t.host, credentialId: t.credentialId })),
      written: out.tools.filter((t) => t.secretValue),
      removed: (current?.tools || []).filter((t) => !keep.has(t.secretName)),
    };
  }
  if (next.enabled) {
    if (!next.apiKey) return { error: "Paste an API key from the Claude Console first." };
    try {
      const made = await provision(next, workspaceName, toolChanges);
      next.remote = made.remote;
      next.tools = made.tools;
    } catch (err) {
      const status = err?.status || 0;
      if (status === 401 || status === 403) return { error: "Anthropic did not accept that API key." };
      return { error: `Anthropic could not set Claude up: ${String(err?.message || "unknown error").slice(0, 200)}` };
    }
  } else if (out.tools) {
    // Off: tool edits wait for the next launch; new keys are not kept.
    if (toolChanges.written.length) return { error: "Turn Claude on to add tool keys; they go straight to Anthropic's vault." };
    next.tools = toolChanges.kept;
  }
  next.agentId = await ensureAgentRow(env.DB, orgId, provider, login, next.enabled, next.agentId, members);
  await env.DB.prepare(
    `INSERT INTO ai_teammates (org_id, provider, enabled, api_key, github_token, repos, model, instructions, channels, monthly_limit_cents, tools, remote, agent_id, updated_by, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)
     ON CONFLICT(org_id, provider) DO UPDATE SET enabled = excluded.enabled, api_key = excluded.api_key, github_token = excluded.github_token,
       repos = excluded.repos, model = excluded.model, instructions = excluded.instructions, channels = excluded.channels,
       monthly_limit_cents = excluded.monthly_limit_cents, tools = excluded.tools, remote = excluded.remote, agent_id = excluded.agent_id,
       updated_by = excluded.updated_by, updated_at = excluded.updated_at`
  ).bind(
    orgId, provider, next.enabled ? 1 : 0,
    await sealField(next.apiKey, aad.teammate(orgId, provider, "api_key")), await sealField(next.githubToken, aad.teammate(orgId, provider, "github_token")), JSON.stringify(next.repos), next.model, next.instructions,
    next.channels === null ? null : JSON.stringify(next.channels), next.monthlyLimitCents, JSON.stringify(next.tools), JSON.stringify(next.remote),
    next.agentId, login, new Date().toISOString(),
  ).run();
  return { teammate: await loadTeammate(env.DB, orgId, provider) };
}

/// The teammate behind a custom agent row, when it is one.
export async function teammateForAgent(db, orgId, agent) {
  const provider = agent?.provider;
  if (!provider || !PROVIDERS[provider]) return null;
  const t = await loadTeammate(db, orgId, provider);
  return t && t.enabled && t.agentId === agent.id ? t : null;
}

/// What the thread says, for a new session: where, who asked, what came before.
function taskText({ where, askedBy, transcript, request }) {
  return [
    `Where: ${where}`,
    `Asked by: ${askedBy}`,
    transcript.length ? `The conversation so far:\n${transcript.join("\n")}` : "",
    `The request:\n${request}`,
  ].filter(Boolean).join("\n\n");
}

/// @claude in a thread: a new session for a new thread, the same session for
/// a follow-up. Returns what to post now, and the run to watch.
export async function startTeammateRun(env, { orgId, t, key, threadId, where, askedBy, transcript, request, login, now = new Date() }) {
  if (t.channels && key.startsWith("b:") && !t.channels.includes(key)) return { refused: "notHere" };
  const spent = await spentThisMonth(env.DB, orgId, t.provider, now);
  const remaining = t.monthlyLimitCents == null ? null : t.monthlyLimitCents - spent;
  if (remaining != null && remaining < 50) return { refused: "limit" };
  const api = client(t.apiKey);
  const existing = await env.DB.prepare(
    "SELECT * FROM ai_teammate_runs WHERE org_id = ?1 AND provider = ?2 AND channel = ?3 AND thread_id = ?4 ORDER BY created_at DESC LIMIT 1"
  ).bind(orgId, t.provider, key, threadId).first().catch(() => null);
  const stamp = now.toISOString();
  if (existing && existing.status !== "failed" && existing.status !== "budget") {
    await api.beta.sessions.events.send(existing.remote_id, { events: [{ type: "user.message", content: [{ type: "text", text: `${askedBy}: ${request}` }] }] });
    await env.DB.prepare("UPDATE ai_teammate_runs SET status = 'running', updated_at = ?2 WHERE id = ?1").bind(existing.id, stamp).run();
    return { run: { ...existing, status: "running" }, continued: true };
  }
  const resources = (t.repos || []).map((r) => ({ type: "github_repository", url: `https://github.com/${r}`, authorization_token: t.githubToken || undefined }));
  const session = await api.beta.sessions.create({
    agent: t.remote.agentId,
    environment_id: t.remote.environmentId,
    ...(t.remote.vaultId ? { vault_ids: [t.remote.vaultId] } : {}),
    ...(resources.length ? { resources } : {}),
    ...(remaining != null ? { budget: { type: "limit", max_list_cost: { amount: String(Math.max(1, remaining)), currency: "USD" } } } : {}),
    title: `${where}: ${request}`.slice(0, 200),
    metadata: { org: String(orgId).slice(0, 512), channel: key.slice(0, 512), thread: String(threadId) },
    initial_events: [{ type: "user.message", content: [{ type: "text", text: taskText({ where, askedBy, transcript, request }) }] }],
  });
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO ai_teammate_runs (id, org_id, provider, channel, thread_id, remote_id, status, cost_cents, last_event_at, started_by, created_at, updated_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'running', 0, NULL, ?7, ?8, ?8)`
  ).bind(id, orgId, t.provider, key, threadId, session.id, login, stamp).run();
  return { run: { id, org_id: orgId, provider: t.provider, channel: key, thread_id: threadId, remote_id: session.id, status: "running", last_event_at: null } };
}

const textOf = (event) => (event.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();

/// What a run has done since it was last looked at: the agent's words since
/// the last hand-off, and whether it has stopped, and why.
export async function readRun(env, t, run) {
  const api = client(t.apiKey);
  const query = { order: "asc", limit: 200, ...(run.last_event_at ? { "created_at[gt]": run.last_event_at } : {}) };
  const texts = [];
  let stop = null;
  let last = run.last_event_at;
  let error = null;
  for await (const event of api.beta.sessions.events.list(run.remote_id, query)) {
    last = event.processed_at || last;
    if (event.type === "agent.message") { const text = textOf(event); if (text) texts.push(text); }
    else if (event.type === "user.message") texts.length = 0;
    else if (event.type === "session.error") error = event.error?.message || event.error?.type || "error";
    else if (event.type === "session.status_idle") stop = event.stop_reason?.type || "end_turn";
    else if (event.type === "session.status_terminated") stop = "terminated";
    else if (event.type === "session.status_running") stop = null;
  }
  let costCents = null;
  if (stop) {
    const session = await api.beta.sessions.retrieve(run.remote_id).catch(() => null);
    const amount = Number(session?.usage?.list_cost?.amount);
    if (Number.isFinite(amount)) costCents = amount;
  }
  return { texts, stop, last, error, costCents };
}

/// Runs still working, oldest first: what the minute cron looks in on.
export async function openRuns(db, { limit = 25, ids = null } = {}) {
  if (ids) {
    if (!ids.length) return [];
    const marks = ids.map((_, i) => `?${i + 1}`).join(",");
    const { results } = await db.prepare(`SELECT * FROM ai_teammate_runs WHERE id IN (${marks}) AND status = 'running'`).bind(...ids).all();
    return results || [];
  }
  const { results } = await db.prepare("SELECT * FROM ai_teammate_runs WHERE status = 'running' ORDER BY updated_at LIMIT ?1").bind(limit).all();
  return results || [];
}

/// A run's state after a look. While it works nothing moves: the next look
/// reads from the same place, so nothing it said is lost. When it stops, the
/// one look that marks it so (a second one racing it changes nothing) is the
/// one to post its answer. Returns the new status, or null when there is
/// nothing to post.
export async function settleRun(db, run, read, now = new Date()) {
  let status = null;
  if (read.stop === "end_turn" || read.stop === "requires_action" || read.stop === "retries_exhausted") status = "idle";
  else if (read.stop === "budget_reached") status = "budget";
  else if (read.stop === "terminated") status = "failed";
  else if (!read.stop && now - new Date(run.updated_at) > STALE_MS) status = "failed";
  if (!status) return null;
  const out = await db.prepare(
    "UPDATE ai_teammate_runs SET status = ?2, last_event_at = COALESCE(?3, last_event_at), cost_cents = COALESCE(?4, cost_cents) WHERE id = ?1 AND status = 'running'"
  ).bind(run.id, status, read.last || null, read.costCents).run();
  return Number(out?.meta?.changes || 0) > 0 ? status : null;
}
