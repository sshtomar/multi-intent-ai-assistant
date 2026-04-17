# Multi-Intent AI Assistant: Project Documentation

## What This Is

A stateful AI chat assistant running on n8n Cloud that authenticates users via a mock database, captures multiple user intents in a single conversation, confirms them before processing, executes them one at a time using real external services, and loops back for follow-up requests until the user is done.

The two supported capabilities are currency conversion (via the Frankfurter API) and natural language date/time computation (via a JavaScript engine). The system enforces a strict six-stage conversation flow: Welcome, Authentication, Intent Capture & Confirmation, Intent Handler, Intent Processors, and Call Wrap-up. No stage can be skipped.

---

## Evaluation

### The constraint

n8n has a built-in evaluation system (Evaluation Trigger + Evaluation nodes) that reads rows from a Data Table, runs the workflow once per row, and records metrics. It works well for single-turn interactions: one input, one output, score the output.

Our workflow requires 3-5 messages per session with the same sessionId maintaining state across turns. The built-in system cannot simulate multi-turn conversations -- each row is an independent execution. This is a documented limitation; a September 2025 community thread describes the exact same problem.

### What we built instead

A bash script (`run_evals.sh`) that sends messages via curl to the production webhook, maintaining the same sessionId across turns within each eval. It applies two layers of checks:

**Code-based checks** for deterministic stages. Welcome, Auth, and Locked are JavaScript Code nodes with exact, predictable outputs. Regex and string matching work perfectly here -- `check_contains "$output" "Devin"` never produces a false result because the Code node returns the same string every time.

**LLM judges** for AI agent stages. Intent Capture, Processing, and Wrap-up are LLM-generated responses that vary in wording across runs. The same correct rejection of an unsupported intent can surface as "I can't do that", "I'm unable to", or "That isn't something I can help with." Regex broke constantly. We built six binary pass/fail judges in `llm_judge.py` using Claude Haiku, each targeting one specific failure mode:

- Does the agent reject unsupported intents and list capabilities?
- Does the agent extract the correct intents without hallucinating extras?
- Does the response contain actual tool results (specific numbers or dates)?
- Does the agent handle tool errors gracefully and continue processing?
- Does the agent avoid inventing intents from vague messages?
- Does the agent end the conversation cleanly without looping?

The first version of the `returns_tool_result` judge was too strict. It failed a response that said "approximately 0.85 EUR" because the word "approximately" suggested fabrication. After one round of calibration against real traces, it became reliable. This is the normal judge development cycle: write the prompt, test against known-good and known-bad examples, tighten or loosen the criteria.

### Coverage

Twelve eval scenarios defined in `evals.json`, nine automated in the runner. They cover: single intent happy flow, multi-intent sequential processing, follow-up intents during wrap-up, three-strike auth lockout, vague messages with no extractable intent, unsupported requests (flight booking), intent list modification during confirmation, API failure with graceful degradation, PIN extraction attempts, duplicate intent prevention, credentials provided prematurely in the first message, and nonexistent user IDs.

Eight of nine automated evals pass consistently. The one failure is a genuine agent behavior issue: when the currency API returns an error for an invalid currency code (XYZ), the agent asks the user for timezone clarification on the date intent instead of using the default timezone and returning the date. This is a system prompt fix, not an eval problem.

### What an audit found

We ran Hamel Husain's `eval-audit` skill against the pipeline. The main finding: our failure categories are spec-driven (we test what the system should do per the assignment) rather than observation-driven (what it actually gets wrong in production). The evals are scenario definitions, not labeled traces. Building a corpus of labeled production traces would enable judge validation and surface failure modes we haven't anticipated.

---

## Architecture

### The flowchart contract

The assignment included a flowchart with three swim lanes: AI Agent, JavaScript Tool(s), and API Tool(s). The entire conversation flow lives in the AI Agent lane. The JavaScript lane contains Validate PIN and Generate Requested Date & Time. The API lane contains Fetch Requested Data (currency).

The critical architectural interpretation: the flowchart shows a linear agent flow where Welcome, Authenticate, Intent Capture, Intent Handler, and Wrap-up are sequential steps within one agent's conversation. PIN validation is a tool called by the agent, not a separate pre-processing gate.

However, the requirement that authentication be deterministic (not dependent on LLM reasoning) means the agent cannot be trusted to always call the auth tool first. A prompt injection in the first message could skip it. OWASP, Google Cloud, and Microsoft Azure all agree: authentication must be enforced by deterministic infrastructure, not by probabilistic LLM reasoning.

### The implementation

The workflow splits into a deterministic pre-auth gate and an AI agent post-auth:

```
Chat Trigger -> Prepare Chat Input -> Ensure Session Row (Data Table)
  -> Get Session State (Data Table) -> Resolve Session State
  -> Route by Stage (Switch: welcome / auth / ready / locked)
      welcome -> Welcome (Code) -> Persist stage=auth (Data Table) -> Response
      auth    -> Mock Auth Tool (Code) -> Persist stage=ready or locked (Data Table)
                 -> Auth Check (IF) -> Success or Failure (Code)
      ready   -> AI Agent (LLM + 3 Tools)
      locked  -> Session Locked (Code)
```

Welcome and Authentication are Code nodes. No LLM, no tools, no prompt. The Welcome node returns a hardcoded greeting and writes `stage=auth` to the Data Table. The Mock Auth Tool extracts user ID and PIN via regex, validates against the mock database, and writes `stage=ready` or increments `authAttempts`. After three failures, it writes `stage=locked`.

The AI Agent is only reached when `stage=ready`. It handles Intent Capture, Processing, and Wrap-up via a system prompt that defines the three stages and rules. It has three tools: Convert Currency (HTTP Request to frankfurter.app), Get Date Time (JavaScript computation), and Manage Intents (stateless queue tracker).

### Session persistence

Session state -- stage, userName, userId, authAttempts -- is stored in an n8n Data Table named `assistant_sessions`. Each message reads the session, routes by stage, and writes back any state changes.

We initially used `$getWorkflowStaticData('global')`, which stores data in memory and persists to the database after execution. It worked in production (webhook mode) but silently failed in the n8n editor's test chat (manual mode). The n8n source code explicitly checks `!isManualMode` before saving static data. Every test message started fresh at `stage=welcome`, making the auth flow untestable during development.

Data Tables persist via direct database writes regardless of execution mode. The switch solved the problem completely.

The `Manage Intents` tool still uses in-memory state for the intent queue (save, get_next, mark_done). This is fine because intents are created and consumed within a single agent execution -- they don't need to survive across messages.

### The Switch node

The Route by Stage node is an n8n Switch v3.4 with four outputs. Two issues surfaced during deployment:

The Switch requires `options.caseSensitive` and `options.typeValidation` inside each condition group. Without them, it throws `Cannot read properties of undefined (reading 'caseSensitive')`. The n8n SDK didn't generate these fields automatically; we had to add them manually.

The IF node for Auth Check requires `looseTypeValidation: true`. With strict validation, checking a boolean field against an empty string `rightValue` throws `Wrong type: '' is a string but was expecting a boolean`. Loose validation resolves this.

Both were discovered through production execution errors and fixed by reading the error stack traces.

---

## Tools

### Currency Converter

An HTTP Request Tool (`n8n-nodes-base.httpRequestTool` v4.4) calling `https://api.frankfurter.app/{date}` with query parameters `amount`, `from`, and `to`. The agent provides values via `$fromAI()` expressions.

This was originally a Code Tool using `fetch()`. It worked locally but failed on n8n Cloud because the Code node sandbox blocks outbound HTTP requests. The HTTP Request Tool uses n8n's native HTTP engine, which bypasses the sandbox.

The API also moved from `api.frankfurter.dev` to `api.frankfurter.app` during development, causing 404 errors until we updated the URL. The tool has retry-on-fail (3 attempts, 1s backoff) and `neverError: true` so the agent can handle failures gracefully instead of the workflow crashing.

### Date/Time Generator

A Code Tool that computes dates from natural language queries. Supports: today, tomorrow, yesterday, day after tomorrow, next/last [weekday], N hours/minutes/days/weeks/months from now, N hours/minutes/days/weeks/months ago.

Uses `Intl.DateTimeFormat` with timezone support (defaulting to `Asia/Kolkata`). Accepts a `baseDate` parameter so the agent can pass today's date explicitly, avoiding drift from the server's clock.

### Manage Intents

A stateless Code Tool that tracks the intent queue through a save -> get_next -> mark_done cycle. The agent passes the queue array in every call; the tool returns the updated queue. No persistent storage needed.

Supports action aliases (add/create/set -> save, next/fetch/pop -> get_next, done/complete -> mark_done). Accepts intents as JSON strings or native objects. Deduplicates via canonical key (type + description + params). Assigns unique IDs and tracks status (pending -> in_progress -> done).

---

## LLM

The workflow is LLM-agnostic. The language model is a sub-node of the AI Agent; swapping it requires changing one node and its credentials.

We started with GPT-4.1 (per the spec) using n8n's free OpenAI credits. The credits ran out mid-testing. We switched to Claude Haiku 4.5 (Anthropic). The system prompt, tools, and conversation flow work identically with both models. Temperature is set to 0.2 for reduced variability.

The system prompt uses a structured format: Role, Context (today's date, user's name, sessionId), Stage definitions with explicit rules, a worked example showing the full conversation flow, and a Rules section. Critical instructions are placed at the top and bottom of the prompt (not buried in the middle) to avoid the "lost in the middle" effect.

---

## Deployment

### n8n MCP integration

The workflow was built and deployed programmatically using the n8n MCP server (`n8n-mcp` by czlonkowski). Claude Code connected to the n8n instance via MCP, enabling: workflow creation and updates via the n8n Workflow SDK, workflow publishing and activation, execution triggering and result inspection, and node type discovery with TypeScript definitions.

The SDK validates workflow code before deployment, catching parameter errors, missing connections, and invalid node configurations. This prevented dozens of manual debugging cycles in the n8n editor.

### Production URL

The Chat Trigger is set to `public: true` with `mode: "hostedChat"`. This serves an HTML chat widget at the production webhook URL. The widget maintains the same sessionId across messages, enabling the full multi-turn conversation flow.

Streaming (`responseMode: "streaming"`) was attempted but doesn't work because intermediate Code nodes (Session Manager, Switch, Welcome, Auth) between the Chat Trigger and AI Agent break the streaming pipeline. The workflow uses `responseMode: "lastNode"` instead.

---

## Files

```
workflow.json    n8n workflow definition (22 nodes)
evals.json       12 evaluation scenario definitions
llm_judge.py     6 binary pass/fail LLM judges (Claude Haiku)
run_evals.sh     Multi-turn eval runner (bash + curl + LLM judge)
README.md        Quick start and reference
DECISIONS.md     Architecture and design tradeoffs
PROJECT.md       This document
```
