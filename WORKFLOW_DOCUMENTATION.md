# Multi-Intent AI Assistant -- Workflow Documentation

## 1. Overview

A stateful AI chat assistant built in n8n that handles multiple user intents within a single conversation. The system implements a mandatory six-stage flow: Welcome, Authentication, Intent Capture & Confirmation, Intent Handler, Intent Processors, and Call Wrap-up.

**Spec reference:** `AI Workflow Agent _ Shubham _ 14 April 2026.md`

| Property | Value |
|----------|-------|
| Platform | n8n Cloud |
| LLM | GPT-4.1 (OpenAI) |
| Workflow ID | `XCZkiE8adVsIRp0B` |
| Node count | 15 |
| Triggers | 1 (Chat Trigger, public hosted chat) |
| Intent processors | Currency Converter (Frankfurter API), Date/Time Generator (JavaScript) |

---

## 2. Architecture

```
Chat Trigger -> Session Manager -> Route by Stage (Switch)
                                     |         |         |         |
                                  Welcome    Mock Auth   AI Agent  Session
                                  (Code)     Tool(Code)           Locked
                                                |                 (Code)
                                            Auth Check (IF)
                                             /       \
                                       Auth         Auth
                                       Success      Failure
                                       (Code)       (Code)
```

### Swim Lane Mapping (per flowchart)

| Flowchart Lane | n8n Implementation |
|----------------|--------------------|
| AI Agent | Session Manager, Switch, Welcome, Auth nodes, AI Agent |
| JavaScript Tool(s) | Mock Auth Tool (Code), Get Date Time (Code Tool) |
| API Tool(s) | Convert Currency (HTTP Request Tool -> frankfurter.app) |

### Three-Layer Design

1. **Deterministic pre-auth gate** (Code nodes) -- Welcome and Authentication are handled entirely by JavaScript Code nodes. No LLM is involved. PIN validation is exact string matching.
2. **AI Agent** (post-auth) -- Only reached after successful authentication (`stage=ready`). Handles intent capture, processing, and wrap-up via GPT-4.1 with tools.
3. **Tools** -- Three AI-connected tools: Convert Currency (HTTP Request), Get Date Time (Code Tool), Manage Intents (Code Tool).

---

## 3. Stage-by-Stage Flow

### Stage 1: Welcome

**Node:** `Welcome` (Code)
**Trigger:** First message from any new session (`stage=welcome`)

- Returns: `"Hi, can you please provide your user ID and 4-digit PIN to continue?"`
- Sets `stage` to `auth` in `$getWorkflowStaticData('global')`
- No LLM involved -- pure deterministic response

### Stage 2: Authentication

**Nodes:** `Mock Auth Tool` (Code) -> `Auth Check` (IF) -> `Auth Success` / `Auth Failure` (Code)
**Trigger:** Second message (`stage=auth`)

- `Mock Auth Tool` extracts user ID and PIN from free-form text using regex
- Validates against mock user database:

| User ID | Name | PIN |
|---------|------|-----|
| 5673 | Devin | 1234 |
| 8421 | Sarah | 5678 |
| 3019 | Alex | 9012 |
| 7745 | Jordan | 3456 |
| 1298 | Maya | 7890 |

- On success: sets `stage=ready`, stores `userName` and `userId`, returns greeting by name
- On failure: increments `authAttempts`, returns generic error (never reveals which field was wrong)
- After 3 failures: sets `stage=locked`
- Malformed input (missing ID or PIN): returns specific prompt for both fields
- PIN is never revealed, echoed, or exposed in any response

### Stage 3: Intent Capture & Confirmation

**Node:** `AI Agent` (GPT-4.1)
**Trigger:** Any message after auth (`stage=ready`)

- Agent extracts intents from user message
- Supported intent types: `currency_conversion`, `date_time`
- If no valid intent: explains capabilities, asks again
- If unsupported intent: states it is unavailable, lists capabilities
- Prevents duplicate intents (same type + same parameters)
- Confirms intent list with user before processing
- Allows user to add, remove, or confirm intents
- On confirmation: calls `manage_intents` tool with `action: "save"` and structured intent objects

### Stage 4: Intent Handler

**Node:** `AI Agent` (via `manage_intents` tool)

- Calls `manage_intents` with `action: "get_next"` to fetch the next unprocessed intent
- If `intent` is `null` (all done): moves to Stage 6 (Wrap-up)
- Processes exactly ONE intent per cycle

### Stage 5: Intent Processors

**Node:** `AI Agent` calling the appropriate tool

For each intent:
1. **DECLARE** -- announces what is being checked
2. **PROCESS** -- calls the appropriate tool:
   - `currency_conversion`: resolves relative dates to YYYY-MM-DD, defaults amount to 1, calls `Convert Currency` (HTTP Request to `api.frankfurter.app`)
   - `date_time`: calls `Get Date Time` (Code Tool) with natural language query, baseDate, and timezone
3. **ANSWER** -- presents result in one concise sentence
4. **UPDATE** -- calls `manage_intents` with `action: "mark_done"`, `sessionId`, and `intentId`
5. **NEXT** -- returns to Stage 4 to fetch next intent

API failures are handled gracefully -- the user is informed and processing continues with the next intent.

### Stage 6: Call Wrap-up

**Node:** `AI Agent`

- Asks if the user needs anything else
- If yes: returns to Stage 3 for new intent capture
- If no: thanks the user and ends cleanly
- Does NOT loop or re-ask after the user declines

---

## 4. State Management

Session state is persisted via `$getWorkflowStaticData('global')`, keyed by `sessionId`.

**Per-session state:**
```json
{
  "stage": "welcome | auth | ready | locked",
  "userName": "Devin",
  "userId": "5673",
  "authAttempts": 0,
  "createdAt": "2026-04-16T09:00:00.000Z",
  "lastSeenAt": "2026-04-16T09:05:00.000Z"
}
```

**Important:** `$getWorkflowStaticData` only persists in production mode (active workflow, webhook execution). It does NOT persist in the n8n editor's test chat (manual mode). All testing must be done via the production chat URL.

---

## 5. Tools

### Convert Currency (HTTP Request Tool)

| Property | Value |
|----------|-------|
| Type | `n8n-nodes-base.httpRequestTool` v4.4 |
| API | `https://api.frankfurter.app/{date}` |
| Method | GET |
| Query params | `amount`, `from`, `to` (via `$fromAI()`) |
| Retry | 3 attempts, 1s backoff |
| Error handling | `neverError: true`, 10s timeout |

### Get Date Time (Code Tool)

| Property | Value |
|----------|-------|
| Type | `@n8n/n8n-nodes-langchain.toolCode` v1.3 |
| Inputs | `query`, `baseDate` (YYYY-MM-DD), `timezone` |
| Supports | today, tomorrow, yesterday, next/last [weekday], N hours/days/weeks from now/ago |
| Formatting | `Intl.DateTimeFormat` with timezone support |
| Output | Structured JSON with `result`, `isoDate`, `resultType` |

### Manage Intents (Code Tool)

| Property | Value |
|----------|-------|
| Type | `@n8n/n8n-nodes-langchain.toolCode` v1.3 |
| Storage | `$getWorkflowStaticData('global')` keyed by sessionId |
| Actions | `save`, `get_next`, `mark_done`, `count`, `clear` |

**Intent structure:**
```json
{
  "id": "intent-1713254400000-0",
  "type": "currency_conversion",
  "description": "100 USD to INR for yesterday",
  "params": { "amount": 100, "from_currency": "USD", "to_currency": "INR", "date": "2026-04-15" },
  "status": "pending | in_progress | done"
}
```

- Deduplication via canonical key (type + description + params)
- `intentId`-based `mark_done` for precise tracking
- `in_progress` status prevents re-fetching the same intent

---

## 6. Node Inventory (15 nodes)

| # | Node | Type | Purpose |
|---|------|------|---------|
| 1 | When chat message received | chatTrigger | Entry point (public hosted chat) |
| 2 | Session Manager | Code | Load/create session from staticData |
| 3 | Route by Stage | Switch | 4-way routing: welcome/auth/ready/locked |
| 4 | Welcome | Code | Deterministic greeting, sets stage to auth |
| 5 | Mock Auth Tool | Code | Regex credential extraction + mock DB validation |
| 6 | Auth Check | IF | Routes on `authenticated` boolean |
| 7 | Auth Success | Code | Personalized greeting, sets stage to ready |
| 8 | Auth Failure | Code | Generic error or lockout message |
| 9 | Session Locked | Code | Lockout message for 3+ failures |
| 10 | AI Agent | Agent v3.1 | Intent capture, processing, wrap-up (GPT-4.1) |
| 11 | GPT 4.1 | lmChatOpenAi | Language model (temperature 0.2) |
| 12 | Window Buffer Memory | memoryBufferWindow | 30-message conversation memory |
| 13 | Convert Currency | httpRequestTool | Frankfurter API (GET with $fromAI params) |
| 14 | Get Date Time | toolCode | JavaScript date/time computation |
| 15 | Manage Intents | toolCode | Intent queue (save/get_next/mark_done/count/clear) |

---

## 7. Evaluation Scenarios

12 eval scenarios are defined in `evals.json`:

| # | Eval | Coverage |
|---|------|----------|
| 1 | Happy Flow (Single Intent) | Full flow with one currency query |
| 2 | Sequential Processing (Multi-Intent) | Two intents processed one at a time |
| 3 | Follow-up Intents | New intents added during wrap-up |
| 4 | Authentication Failure | 3 wrong PINs -> lockout |
| 5 | No Intent Detected | Vague message -> re-prompt |
| 6 | Invalid Intent | Unsupported request (flight booking) |
| 7 | Intent Modification | Add/remove intents during confirmation |
| 8 | API Failure Handling | Invalid currency code -> graceful error |
| 9 | PIN Security | Attempts to leak PINs/user data |
| 10 | Duplicate Intent Prevention | Same intent type requested twice |
| 11 | Credentials in First Message | Early credential provision |
| 12 | Nonexistent User ID | Unknown user ID handling |

---

## 8. Sample Conversation

```
Agent: Hi, can you please provide your user ID and 4-digit PIN to continue?
User:  user id 5673 and pin 1234
Agent: Hi Devin, how can I help you today?
User:  I need to know the USD to INR conversion for yesterday and the date on the coming Sunday.
Agent: Sure, I can help you with:
       1) USD to INR conversion for yesterday
       2) Date on the coming Sunday
       Anything else, or shall I proceed?
User:  No, that's it for now.
Agent: Checking currency conversion...
Agent: Yesterday, 1 USD was approximately 93.44 INR.
Agent: Checking the date on this coming Sunday...
Agent: The coming Sunday is Sunday, 19 April 2026.
Agent: Anything else I can help you with?
User:  No, that's it, thank you.
Agent: Thank you Devin. Have a nice day!
```

---

## 9. Testing

**Production URL only.** The editor test chat does not persist `$getWorkflowStaticData` between messages, so the state machine (welcome -> auth -> ready) will not advance.

To test:
1. Open the **When chat message received** node in n8n
2. Click the **Production URL** tab
3. Copy the URL and open in a new browser tab
4. The hosted chat widget loads -- test the full conversation there

---

## 10. Files

| File | Description |
|------|-------------|
| `workflow.json` | n8n workflow (local copy, may be stale -- deployed version is authoritative) |
| `evals.json` | 12 evaluation scenarios with steps and pass criteria |
| `chat-ui.html` | Standalone dark-theme chat UI with mock auth and n8n webhook integration |
| `Multi-Intent AI Assistant - Flowchart.drawio` | Editable flowchart (draw.io format) |
| `Multi-Intent AI Assistant - Flowchart.drawio.png` | Original flowchart image |
| `Multi-Intent AI Assistant - Flowchart.svg` | Vector version of the flowchart |
| `.mcp.json` | n8n MCP server connection config for Claude Code |
