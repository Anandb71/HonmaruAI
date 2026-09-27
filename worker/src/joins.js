/// "Mika joined": a line in the team's first public channel when somebody
/// new comes in, the way Slack says it in #general. The row carries only who
/// (its author) and the kind; each reader's screen writes the words in its
/// own language. Never for a guest, who sees only the channels they were
/// given; never twice for one arrival; and not where an invitation that
/// named this channel already introduced them (welcome.js).

import { postMessage } from "./channels.js";

const RECENT_MS = 60 * 60 * 1000;

export async function announceJoin(env, orgId, login) {
  const db = env?.DB;
  if (!db || !orgId || !login) return null;
  const who = await db.prepare(
    `SELECT u.login, u.name, m.role FROM users u JOIN memberships m ON m.user_github_id = u.github_id AND m.org_id = ?1 WHERE u.login = ?2`
  ).bind(orgId, login).first().catch(() => null);
  if (!who || String(who.role || "").toLowerCase() === "guest") return null;
  const room = await db.prepare(
    "SELECT slug FROM businesses WHERE org_id = ?1 AND archived_at IS NULL AND COALESCE(private, 0) = 0 ORDER BY created_at LIMIT 1"
  ).bind(orgId).first().catch(() => null);
  if (!room) return null;
  const key = `b:${room.slug}`;
  const since = new Date(Date.now() - RECENT_MS).toISOString();
  const said = await db.prepare(
    "SELECT 1 FROM channel_messages WHERE org_id = ?1 AND kind = 'joined' AND author_login = ?2 AND created_at >= ?3 LIMIT 1"
  ).bind(orgId, login, since).first().catch(() => null);
  if (said) return null;
  const introduced = who.name ? await db.prepare(
    "SELECT 1 FROM channel_messages WHERE org_id = ?1 AND channel = ?2 AND kind = 'ai' AND created_at >= ?3 AND instr(body, ?4) > 0 LIMIT 1"
  ).bind(orgId, key, new Date(Date.now() - 5 * 60 * 1000).toISOString(), who.name).first().catch(() => null) : null;
  if (introduced) return null;
  const out = await postMessage(db, { orgId, key, authorLogin: login, body: "joined", kind: "joined" });
  if (!out.row) return null;
  const { broadcastStored } = await import("./channelRoutes.js");
  await broadcastStored(env, orgId, key, out.row).catch(() => {});
  return out.row;
}
