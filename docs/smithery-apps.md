# Smithery: HonmaruAI listed there, and apps connected through it

Two separate things, both optional:

- **A. HonmaruAI as an MCP server on Smithery's registry**, so an agent in Claude, Cursor or ChatGPT can find it and ask a teammate for a decision.
- **B. Apps through Smithery Connect**: each person connects their own Linear, Jira, HubSpot and so on, and only their own conversation with their AI reads it.

Nothing about B is on until an operator sets two secrets **and** an owner allows an app.

---

## A. Listing HonmaruAI on Smithery

HonmaruAI already speaks MCP at `POST /mcp` (`worker/src/mcp.js`: `request_decision`, `get_decision`, `list_pending`, `search_decisions`, `list_members`, `get_playbook`). A person makes a token under You → Tools → Connect an agent (`hm_…`), scoped to one workspace.

What was added for Smithery:

- **The token in its own header.** Smithery keeps `Authorization` for its own sign-in, so `/mcp` also accepts `x-honmaru-token: hm_…`.
- **A static server card** at `/.well-known/mcp/server-card.json`: the server's name, that it needs a token, and the tools with their schemas. Nothing about any workspace is in it. Smithery reads it when its scanner cannot sign in.

### Publishing (an owner of the Smithery account does this once)

```bash
npx @smithery/cli auth login
npx @smithery/cli mcp publish "https://<your-worker-host>/mcp" -n @honmaru/honmaru \
  --config-schema '{"type":"object","properties":{"token":{"type":"string","title":"Honmaru access token (hm_…)","x-from":{"header":"x-honmaru-token"}}},"required":["token"]}'
```

Or at [smithery.ai/new](https://smithery.ai/new), enter the same URL and the same config schema. Publishing a server that is hosted elsewhere is free on every plan.

After it is listed, a person who adds HonmaruAI in Smithery enters their own `hm_…` token. Their agent's calls go through Smithery's gateway to `/mcp`. The token is theirs, scoped to one workspace, and revocable in HonmaruAI at any time.

---

## B. Apps through Smithery Connect

### Setting it up (operator)

```bash
wrangler secret put SMITHERY_API_KEY     # smithery.ai/account/api-keys
# and in wrangler.toml [vars], one namespace per environment:
SMITHERY_NAMESPACE = "honmaru-prod"
```

Without both, the Apps section says "Not set up on this server yet." and nothing connects.

### Who does what

| | Owner | Admin | Member | Guest |
|---|---|---|---|---|
| Search Smithery's registry, allow or take away an app | ✓ (fresh sign-in) | | | |
| See which apps are allowed | ✓ | ✓ | ✓ | ✓ |
| Connect their own account to an allowed app | ✓ | ✓ | ✓ | — |

Taking an app away ends **every** connection to it, at once.

### Keeping one person's data theirs

These layers each stop a leak by themselves. A bug in one is caught by the next.

1. **Nothing until an owner allows it.** A workspace allows no apps by default. Only apps that run as a service (`remote`) can be allowed, not local ones.
2. **Our own row, found only by who asks.** `app_connections` is keyed by workspace and person, with a random ID (`hm-` + 96 bits) that is never sent to a browser or the phone. Every route takes an app's name and finds the row by the caller's session. No route accepts a connection ID.
3. **A token that can only be theirs.** Smithery is never read, and no tool is ever run, with the API key. Each time, the Worker mints a service token for ten minutes, scoped to `resources: connections`, `operations: read, execute`, and `metadata: {hmOrg, hmUser}`:
   - The tags are hashes of the workspace and the workspace + person. The same person in two workspaces is two people to Smithery.
   - Neither tag is an address or a login.
   - Even a row pointing at someone else's connection reads nothing: Smithery refuses that token. `test/smithery-apps.test.js` checks this with a fake Smithery that enforces scoping.
   - The API key is used only to create a connection, delete one, search the registry, and mint these tokens.
4. **Only in their own conversation with an agent.** The apps' tools are added only when `personal` is set. That is the person's own direct conversation with an agent (`ag:<id>|<login>`, one reader). Channels, group DMs, routines and anyone else's conversation never get them.
5. **Reading, not writing, by default.** A tool is offered when it says it only reads (`readOnlyHint`), or says nothing and its name is a reading word (`get_`, `list_`, `search_` …). A tool marked destructive never is.
   - An owner may allow writing for an app.
   - Even then, the write tools are offered only when every agent answering is one the person wrote themselves. A teammate's agent's instructions never steer a write.
6. **No link out after an app has answered.** Once any app tool has run, `read_url` refuses for the rest of that answer. Nothing the app returned can leave hidden in a URL.
7. **What an app says is data, not instructions.** Results come back inside `<app_result>`, cut at 12,000 characters, and the tool description says so.
8. **Nothing kept that was said.** The audit log records `apps.tool_called` with the app, the tool and whether it worked, never the arguments or the result. Our logs never print them either.
9. **Ended when they leave.**
   - Removing a person (by hand, SCIM, the admin API) ends their connections in that workspace.
   - Deleting an account ends them in every workspace.
   - The 15-minute cron sweeps up any connection whose person left, became a guest, or whose app was taken away.
   - A deletion Smithery did not confirm leaves a tombstone that the sweep retries. Our row is deleted first, so the connection is never used again meanwhile.

### What the owner is told

The allow form says that what the AI reads from an app passes through Smithery (smithery.ai), a company in the United States. It also says that the workspace's data rules and audit log do not see inside it. Enterprise customers who cannot accept that should not allow any app. The default already allows none.

### Tables

- `org_apps`: allowed apps per workspace (`allow_writes`, `verified`).
- `app_connections`: one row per workspace × person × app.
- `app_connection_tombstones`: deletions to retry at Smithery.

### Audit actions

- `apps.allowed` (critical)
- `apps.removed`
- `apps.connected`
- `apps.disconnected`
- `apps.connection_removed`
- `apps.tool_called`

### Routes

| Route | Who |
|---|---|
| `GET /orgs/apps?orgId=` | members; each sees only their own connection state |
| `GET /orgs/apps/registry?orgId=&q=` | owners |
| `POST /orgs/apps` `{orgId, server, allowWrites}` | owners, fresh sign-in |
| `DELETE /orgs/apps?orgId=&server=` | owners, fresh sign-in |
| `POST /apps/connect` `{orgId, server}` → `{state, setupUrl}` | members (not guests) |
| `DELETE /apps/connect?orgId=&server=` | the person |

---

## Replies in each reader's language

This is a separate change that landed alongside B.

An agent's or the AI's reply is written in the asker's language. Everyone else in the conversation now reads it in their own:

- `message_translations` keeps a reply's translation per language, with a hash of the words it was made from. An edited reply is translated again rather than shown stale.
- After a reply is posted, `translateForReaders` translates it into each distinct language of the people in that conversation, up to four. It is charged to the asker's allowance.
- A message shown to someone carries `lang` (the language it is written in) and, when theirs differs and is ready, `translation`.
- `POST /channels/messages/translate {orgId, channel, messageId, locale}` makes one on demand. It only works for a reply the caller can see.
- Web and iOS show the translation, with "Translated · Show original" to switch back.
