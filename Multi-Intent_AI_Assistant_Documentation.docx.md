**Multi-Intent AI Assistant**

Workflow Documentation

n8n Stateful Chat Assistant

Currency Conversion | Date/Time Queries | Shubham Tomar

April 2026

# **1. Overview**

A stateful chat assistant on n8n Cloud that authenticates users, captures multiple intents per conversation, confirms them, processes them one at a time using external APIs, and loops back for follow-ups until the user is done.

2 supported capabilities: currency conversion (Frankfurter API) and natural language date/time computation (JavaScript). The conversation follows 6 mandatory stages. No stage can be skipped.

| Property | Value |
| :---- | :---- |
| Platform | n8n Cloud |
| LLM | Claude Haiku 4.5 (Anthropic); GPT-4.1 also tested |
| Workflow ID | [XCZkiE8adVsIRp0B](https://sshtomar.app.n8n.cloud/workflow/XCZkiE8adVsIRp0B) |
| Production Chat URL | https://sshtomar.app.n8n.cloud/webhook/multi-intent-assistant/chat |
| Triggers | 1 (Chat Trigger, public hosted chat) |
| Intent Processors | Currency Converter (Frankfurter API), Date/Time Generator (JavaScript) |
| Session Store | n8n Data Table (`assistant_sessions`) |
| Eval Runner | Bash + curl + LLM judge (Claude Haiku) |

# **2. Architecture**

## **2.1 Three-Layer Design**

**Layer 1: Deterministic Pre-Auth Gate**

Welcome and Authentication run in JavaScript Code nodes. No LLM touches them. PIN validation is exact string matching against a mock database. Unauthenticated users never reach the AI Agent, so a prompt injection in the first message can't skip auth. This follows OWASP, Google Cloud, and Microsoft Azure guidance: authentication belongs in deterministic code, not probabilistic LLM reasoning.

**Layer 2: AI Agent (Post-Auth)**

Only reached when stage=ready. Handles intent capture, confirmation, processing, and wrap-up via the LLM with 3 connected tools.

**Layer 3: Tools**

3 AI-connected tools: Convert Currency (HTTP Request), Get Date Time (Code Tool), Manage Intents (Code Tool).

## **2.2 Swim Lane Mapping**

| Flowchart Lane | n8n Implementation |
| :---- | :---- |
| AI Agent | Session pipeline (Prepare, Ensure, Get, Resolve, Switch), Welcome, Auth nodes, AI Agent |
| JavaScript Tool(s) | Mock Auth Tool (Code), Get Date Time (Code Tool), Manage Intents (Code Tool) |
| API Tool(s) | Convert Currency (HTTP Request Tool -> frankfurter.app) |

## **2.3 Workflow Diagram**

```
Chat Trigger
  -> Prepare Chat Input (Code)
  -> Ensure Session Row (Data Table)
  -> Get Session State (Data Table)
  -> Resolve Session State (Code)
  -> Route by Stage (Switch: welcome / auth / ready / locked)
      |welcome -> Welcome (Code) -> Persist stage=auth (Data Table) -> Welcome Response (Code)
      |auth    -> Mock Auth Tool (Code) -> Persist Auth (Data Table)
      |            -> Restore Auth Result (Code) -> Auth Check (IF)
      |                                               -> Auth Success (Code)
      |                                               -> Auth Failure (Code)
      |ready   -> AI Agent (LLM + Memory + 3 Tools)
      |locked  -> Session Locked (Code)
```

AI Agent sub-nodes:

```
AI Agent
  <- LLM (Claude Haiku 4.5 / GPT-4.1)       [ai_languageModel]
  <- Window Buffer Memory (30 messages)       [ai_memory]
  <- Convert Currency (HTTP Request Tool)     [ai_tool]
  <- Get Date Time (Code Tool)                [ai_tool]
  <- Manage Intents (Code Tool)               [ai_tool]
```

# **3. Stage-by-Stage Flow**

## **3.1 Welcome**

**Node:** Welcome (Code)

First message from any new session triggers a hardcoded greeting asking for credentials. Writes stage=auth to the Data Table. No LLM.

## **3.2 Authentication**

**Nodes:** Mock Auth Tool -> Persist Auth -> Restore Auth Result -> Auth Check (IF) -> Auth Success / Auth Failure

The Mock Auth Tool pulls user ID and PIN from free-form text using regex, then checks them against the mock database:

| User ID | Name | PIN | Notes |
| :---- | :---- | :---- | :---- |
| 5673 | Devin | 1234 | Primary test user |
| 8421 | Sarah | 5678 | |
| 3019 | Alex | 9012 | |
| 7745 | Jordan | 3456 | |
| 1298 | Maya | 7890 | |

On success: writes stage=ready, stores userName/userId, returns personalized greeting.
On failure: increments authAttempts, returns a generic error. Never reveals whether the user ID or PIN was wrong.
After 3 failures: writes stage=locked.

## **3.3 Intent Capture and Confirmation**

**Node:** AI Agent

The agent extracts intents from the user's message. 2 supported types: `currency_conversion` and `date_time`. It confirms the intent list before processing. The user can add, remove, or confirm. Duplicates are blocked via canonical key deduplication in the Manage Intents tool.

## **3.4 Intent Handler**

Calls `manage_intents` with action `get_next` to fetch the next unprocessed intent. If none remain, the agent moves to wrap-up. 1 intent per cycle.

## **3.5 Intent Processors**

Each intent follows a 5-step cycle:

1. **Declare** what's being checked.
2. **Process** by calling the right tool.
3. **Answer** with 1 concise sentence.
4. **Update** by calling `mark_done` with the intentId.
5. **Next** by fetching the next intent.

If the API fails, the agent acknowledges the error and continues to the next intent.

## **3.6 Wrap-up**

Asks if the user needs anything else. Yes returns to intent capture. No ends the conversation. No looping after the user declines.

# **4. State Management**

## **4.1 Session State**

Session state (stage, userName, userId, authAttempts) lives in an n8n Data Table called `assistant_sessions`. Each message reads the session, routes by stage, and writes back changes through dedicated Persist (Upsert) nodes.

Data Tables persist via direct database writes regardless of execution mode.

**Why not `$getWorkflowStaticData`?** The first implementation used static data. It worked in production (webhook mode) but silently dropped writes in n8n's manual (test) mode. The n8n source code skips static data saving when `mode === 'manual'`, so every editor test message started fresh at stage=welcome. The auth flow was untestable during development.

## **4.2 Intent Queue**

The Manage Intents tool is stateless. The agent passes the full queue array in every call; the tool returns the updated array. Intents are created and consumed within a single agent execution, so they don't need to survive across messages.

## **4.3 Conversation Memory**

A Window Buffer Memory node keeps the last 30 messages. The agent can reference earlier turns during intent capture, processing, and wrap-up.

# **5. Tools**

## **5.1 Convert Currency (HTTP Request Tool)**

| Property | Value |
| :---- | :---- |
| Type | n8n-nodes-base.httpRequestTool v4.4 |
| API | https://api.frankfurter.app/{date} |
| Method | GET |
| Query Params | amount, from, to (via `$fromAI()`) |
| Retry | 3 attempts, 1s backoff |
| Error Handling | `neverError: true`, 10s timeout |

The agent fills in the date (YYYY-MM-DD or "latest"), amount (default 1), from_currency, and to_currency dynamically via `$fromAI()` expressions.

Originally a Code Tool using `fetch()`. That failed on n8n Cloud because the Code node sandbox blocks outbound HTTP. The HTTP Request Tool uses n8n's native HTTP engine, bypassing the sandbox.

## **5.2 Get Date Time (Code Tool)**

| Property | Value |
| :---- | :---- |
| Type | @n8n/n8n-nodes-langchain.toolCode v1.1 |
| Inputs | query, baseDate (YYYY-MM-DD), timezone |
| Supports | today, tomorrow, yesterday, day after tomorrow, next/last [weekday], N hours/minutes/days/weeks/months from now/ago |
| Formatting | `Intl.DateTimeFormat` with timezone support (default: Asia/Kolkata) |
| Output | JSON: success, intentType, query, result, resultType, isoDate, timezone |

Accepts a `baseDate` parameter so the agent passes today's date explicitly, sidestepping timezone drift in the `Date()` constructor.

## **5.3 Manage Intents (Code Tool)**

| Property | Value |
| :---- | :---- |
| Type | @n8n/n8n-nodes-langchain.toolCode v1.1 |
| Actions | save, get_next, mark_done, count, clear |
| Aliases | add/create/set -> save; next/fetch/pop -> get_next; done/complete -> mark_done |
| Input Format | JSON strings or native arrays/objects |
| Deduplication | Canonical key (type + description + params) |
| Intent ID Format | intent-TIMESTAMP-INDEX |
| Status Tracking | pending -> in_progress -> done |

Stateless: the agent passes the queue in every call, gets back the updated queue.

# **6. Node Inventory**

22 nodes total.

| # | Node | Type | Purpose |
| :---- | :---- | :---- | :---- |
| 1 | When chat message received | chatTrigger v1.1 | Entry point (public hosted chat) |
| 2 | Prepare Chat Input | code v2 | Extract sessionId, chatInput, timestamp |
| 3 | Ensure Session Row | dataTable v1.1 | Upsert initial session row |
| 4 | Get Session State | dataTable v1.1 | Read current stage |
| 5 | Resolve Session State | code v2 | Validate and normalize stage |
| 6 | Route by Stage | switch v3 | 4-way: welcome / auth / ready / locked |
| 7 | Welcome | code v2 | Hardcoded greeting |
| 8 | Persist Welcome Session | dataTable v1.1 | Write stage=auth |
| 9 | Welcome Response | code v2 | Output welcome message |
| 10 | Mock Auth Tool | code v2 | Regex extraction + mock DB check |
| 11 | Persist Auth Session | dataTable v1.1 | Write stage=ready or locked |
| 12 | Restore Auth Result | code v2 | Restore result after Data Table write |
| 13 | Auth Check | if v2 | Route on authenticated boolean |
| 14 | Auth Success | code v2 | Personalized greeting |
| 15 | Auth Failure | code v2 | Generic error or lockout |
| 16 | Session Locked | code v2 | Lockout message |
| 17 | AI Agent | agent v1.7 | Intent capture, processing, wrap-up |
| 18 | LLM | lmChatOpenAi v1.3 | Language model (temp 0.2) |
| 19 | Window Buffer Memory | memoryBufferWindow v1.3 | 30-message context |
| 20 | Convert Currency | httpRequestTool v4.4 | Frankfurter API |
| 21 | Get Date Time | toolCode v1.1 | JavaScript date/time computation |
| 22 | Manage Intents | toolCode v1.1 | Stateless intent queue |

Breakdown: 9 Code nodes, 4 Data Table nodes, 2 routing nodes (Switch + IF), 1 Chat Trigger, 1 Agent, 1 LLM, 1 Memory, 3 Tools.

# **7. LLM Configuration**

The workflow is LLM-agnostic. Swap 1 node and its credentials.

| Property | Value |
| :---- | :---- |
| Current LLM | Claude Haiku 4.5 (Anthropic) |
| Alternate Tested | GPT-4.1 (OpenAI) |
| Temperature | 0.2 |
| Max Agent Iterations | 30 |

The system prompt is structured in 5 sections: role, context (today's date, user name, sessionId), stage definitions with rules, a worked example of the full conversation, and a rules section. Critical instructions sit at the top and bottom of the prompt, not the middle, to avoid recall degradation.

The project started with GPT-4.1 per the spec, using n8n's free OpenAI credits. Those credits ran out mid-testing. Claude Haiku 4.5 dropped in with no prompt or tool changes.

# **8. Evaluation**

## **8.1 Why Custom Evals**

n8n's built-in eval system only supports single-turn interactions: 1 input, 1 output, score. Our workflow needs 3 to 5 messages per session with the same sessionId carrying state across turns. The built-in system can't simulate that.

## **8.2 Eval Infrastructure**

`run_evals.sh` sends messages via curl to the production webhook, holding the same sessionId across turns within each scenario.

`llm_judge.py` runs 6 binary pass/fail judges using Claude Haiku, each targeting 1 failure mode:

| Judge | What it checks |
| :---- | :---- |
| rejects_unsupported_intent | Agent rejected an unsupported request and listed its actual capabilities |
| extracts_correct_intents | Correct intents captured, none hallucinated, types match |
| returns_tool_result | Response contains specific numbers or dates from actual tool calls |
| handles_error_gracefully | Error acknowledged without jargon, processing continues |
| no_hallucinated_intent | No intent fabricated from a vague message |
| ends_cleanly | Brief goodbye, no follow-up questions after user declines |

**Hybrid strategy.** Regex and string matching for deterministic stages (Welcome, Auth, Locked) where output is identical every run. LLM judges for AI agent stages (Intent Capture, Processing, Wrap-up) where wording varies.

The first version of the `returns_tool_result` judge was too strict: it failed a response saying "approximately 0.85 EUR" because "approximately" suggested fabrication. 1 calibration round against real traces fixed it.

## **8.3 Scenarios**

12 scenarios defined in `evals.json`, 9 automated in the runner:

| # | Scenario | Coverage |
| :---- | :---- | :---- |
| 1 | Happy Flow (Single Intent) | Full flow, 1 currency query |
| 2 | Sequential Processing (Multi-Intent) | 2 intents processed one at a time |
| 3 | Follow-up Intents | New intents added during wrap-up |
| 4 | Authentication Failure | 3 wrong PINs, lockout |
| 5 | No Intent Detected | Vague message, re-prompt |
| 6 | Invalid Intent | Unsupported request (flight booking) |
| 7 | Intent Modification | Add/remove intents during confirmation |
| 8 | API Failure Handling | Invalid currency code, graceful error |
| 9 | PIN Security | Attempts to extract PINs/user data |
| 10 | Duplicate Intent Prevention | Same intent requested twice |
| 11 | Credentials in First Message | Early credential provision |
| 12 | Nonexistent User ID | Unknown user ID handling |

## **8.4 Results**

8 of 9 automated evals pass consistently. The 1 failure (Eval 08) is a genuine agent issue: when the currency API errors on an invalid code (XYZ), the agent asks for timezone clarification on the date intent instead of using the default. That's a system prompt fix.

## **8.5 Audit Findings**

An audit (Hamel Husain's eval-audit skill) surfaced 3 gaps:

1. **Spec-driven, not observation-driven.** Failure categories come from the assignment spec, not from production traces. Real error analysis would surface failure modes we haven't anticipated.
2. **No labeled data.** The scenarios are definitions, not labeled traces. A corpus of ~100 labeled input/output pairs would let us validate the judges themselves.
3. **No regression testing.** The workflow architecture changed 10+ times during development. Evals should run after every deployment.

# **9. Sample Conversation**

```
Agent: Hi, can you please provide your user ID and 4-digit PIN to continue?

User:  user id 5673 and pin 1234

Agent: Hi Devin, how can I help you today?

User:  I need to know the USD to INR conversion for yesterday and the date
       on the coming Sunday.

Agent: Sure, I can help you with:
       1) USD to INR conversion for yesterday
       2) Date on the coming Sunday
       Anything else, or shall I proceed?

User:  No, that's it for now.

Agent: Checking currency conversion...
       Yesterday, 1 USD was approximately 93.44 INR.

       Checking the date on this coming Sunday...
       The coming Sunday is Sunday, 19 April 2026.

       Anything else I can help you with?

User:  No, that's it, thank you.

Agent: Thank you Devin. Have a nice day!
```

# **10. Testing**

**Use the production URL.** The n8n editor's test chat runs in manual mode, which doesn't persist session state across messages. The full state machine (welcome -> auth -> ready) only works via the production webhook.

**Steps:**

1. Activate the workflow in n8n.
2. Open https://sshtomar.app.n8n.cloud/webhook/multi-intent-assistant/chat
3. Test the full conversation in the hosted chat widget.
4. Use credentials from the mock user table (e.g., user ID 5673, PIN 1234).

**Run evals:**

```bash
ANTHROPIC_API_KEY=sk-... bash run_evals.sh
```

# **11. Design Decisions**

| Decision | Why |
| :---- | :---- |
| Deterministic pre-auth gate | Auth enforced by code, not LLM. Blocks prompt injection bypass. |
| Data Table over staticData | staticData silently fails in n8n's manual/test mode. Data Tables persist in all modes. |
| HTTP Request Tool for currency | Code Tool sandbox on n8n Cloud blocks outbound HTTP. HTTP Request Tool bypasses it. |
| Stateless Manage Intents | Avoids staticData persistence bugs. Agent carries the queue in every call. |
| No streaming | Intermediate Code nodes between Chat Trigger and AI Agent break the streaming pipeline. |
| LLM judge for AI stages | Regex breaks on natural language variation. LLM judges are reliable after calibration. |
| Hybrid eval runner | n8n's built-in evals can't do multi-turn. Bash + curl holds sessionId across messages. |
| Temperature 0.2 | Low enough for predictable behavior, non-zero for natural phrasing. |
| Switch looseTypeValidation | Switch v3.4 and IF v2.3 throw type errors with strict validation. |

# **12. Project Files**

| File | Description |
| :---- | :---- |
| workflow.json | n8n workflow (22 nodes) |
| evals.json | 12 eval scenarios with steps and pass criteria |
| run_evals.sh | Multi-turn eval runner (bash + curl + LLM judge) |
| llm_judge.py | 6 binary pass/fail judges (Claude Haiku) |
| eval_results.json | Latest eval results |
| README.md | Quick start and reference |
| PROJECT.md | Narrative project documentation |
| DECISIONS.md | Architecture and design tradeoffs |
| .mcp.json | n8n MCP server connection config |

# **13. Deployment**

## **13.1 MCP Integration**

The workflow was built and deployed programmatically via the n8n MCP server. Claude Code connected to the n8n instance through MCP for workflow creation, updates, publishing, activation, execution, and node type discovery. The SDK validates workflow code before deployment, catching parameter errors and missing connections before they reach the editor.

## **13.2 Setup from Scratch**

1. Import `workflow.json` into n8n.
2. Create a Data Table named `assistant_sessions` with columns: sessionId (string), stage (string), userName (string), userId (string), authAttempts (number).
3. Set your LLM credential on the AI Agent's language model sub-node.
4. Activate the workflow.
5. Open the Chat Trigger's production URL.
