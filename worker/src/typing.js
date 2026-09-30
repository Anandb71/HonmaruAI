import { listMembers } from "./team.js";
import { resolveChannel, viewOf } from "./channels.js";
import { audienceOf } from "./access.js";
import { custom as customEvent } from "./agui/events.js";
import { safe } from "./log.js";

// Somebody typing: "Aki is typing…" in a conversation, or in a thread in
// one, for the people who can read it, as Discord shows it. Nothing is
// stored. A browser says so every few seconds while its person types and
// once more when they stop, and a line nobody refreshes goes by itself.
//
// Who hears it is decided the way a Jam's news is (jam.js): the channel as
// the typist named it, resolved against what they may read, then everyone
// who can read it, each told under the name they give it. Never the typist
// themselves: none of their own tabs needs telling.

export const TYPING_TYPES = new Set(["typing", "typing_stop"]);
/// A browser says it at most every three seconds per box and stops when it
/// is done: thirty in ten seconds is several tabs' worth, and a loop is cut
/// off long before it costs anything.
export const TYPING_BUDGET = 30;
/// A thread is named by the id of the message it hangs off.
const MESSAGE_ID = /^[\w-]{1,80}$/;

/// One `typing` or `typing_stop` from a browser. `att` is the socket's
/// attachment, already signed in. Never throws: a typing line is not worth
/// an error on anybody's screen.
export async function handleTyping(relay, att, type, payload) {
  const orgId = att.orgId;
  const parentId = payload.parentId == null || payload.parentId === "" ? null : payload.parentId;
  // A thread named wrongly is dropped, not turned into the conversation.
  if (parentId !== null && (typeof parentId !== "string" || !MESSAGE_ID.test(parentId))) return;
  try {
    const members = await listMembers(relay.db, orgId, att.githubId);
    const resolved = await resolveChannel(relay.db, orgId, { login: att.userId, github_id: att.githubId }, payload.channel, members);
    // Nothing the typist may read — or a conversation with an agent, which
    // has nobody else in it.
    if (!resolved || resolved.kind === "agent") return;
    const me = members.find((m) => m.login === att.userId);
    if (!me) return;
    const event = (view) => customEvent("typing", {
      channel: view, parentId, who: { ref: me.ref, name: me.name },
      ...(type === "typing_stop" ? { stop: true } : {}),
    });
    // Everyone who can read it, each under their name for it — or null for a
    // public channel in a workspace without guests: everyone here but a
    // guest, as the room's own events go.
    const logins = await audienceOf(relay.db, orgId, resolved.key);
    const views = logins && new Map();
    for (const login of logins || []) {
      const view = viewOf(resolved.key, login, members);
      if (view) views.set(login, view);
    }
    // One pass over the sockets rather than one per reader: this runs every
    // few seconds for everyone typing. Only sockets that have joined.
    const texts = new Map();
    for (const ws of relay.state.getWebSockets()) {
      const other = ws.deserializeAttachment?.();
      if (other?.orgId !== orgId || !other.authed || other.userId === att.userId) continue;
      const view = views ? views.get(other.userId) : (other.guest ? null : resolved.key);
      if (!view) continue;
      if (!texts.has(view)) texts.set(view, JSON.stringify(event(view)));
      relay.constructor.deliver(ws, texts.get(view));
    }
  } catch (err) {
    console.warn("typing relay failed", safe(err?.message));
  }
}
