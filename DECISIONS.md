# Project Decisions

How this project was built, what tradeoffs were made, and why.

---

## Evaluation

### Why a bash script instead of n8n's built-in evaluations

n8n ships a first-party evaluation system (Evaluation Trigger + Evaluation nodes, visible in the Evaluations tab). It reads rows from a Data Table or Google Sheet and runs the workflow once per row, recording metrics like Correctness, Helpfulness, and String Similarity.

The problem: **it only supports single-turn interactions.** Each row sends one input and evaluates one output. Our workflow requires 3-5 messages per session (welcome, auth, intent capture, processing, wrap-up) with the same sessionId persisting state across turns. The Evaluation Trigger replaces the Chat Trigger, so nodes that depend on chat session continuity break.

We use a bash script (`run_evals.sh`) that sends messages via curl to the production webhook, maintaining the same sessionId across turns. This is the only way to test the full stateful conversation flow.

### Why a hybrid eval strategy (regex + LLM judge)

The workflow has two types of stages with fundamentally different output characteristics:

**Deterministic stages** (Welcome, Auth, Locked) produce identical output every run. These are JavaScript Code nodes returning hardcoded strings. Regex works perfectly -- `check_contains "$output" "user ID"` never fails.

**AI agent stages** (Intent Capture, Processing, Wrap-up) produce different wording every run. The same correct behavior can be expressed as "I can't do that", "I'm unable to", "That's not something I can help with", or "flight booking isn't available." Regex broke constantly -- a check that passed on one run would fail on the next.

We added an LLM judge (`llm_judge.py`) using Claude Haiku for the AI stages. Six binary pass/fail judges, each targeting one failure mode. Claude Haiku is cheap enough (~$0.001 per judge call) to run on every eval.

The first judge version was too strict -- `returns_tool_result` failed responses that said "approximately 0.85 EUR" because the word "approximately" suggested uncertainty. After one calibration round against real traces, it became reliable.

### What the audit found

We ran Hamel Husain's `eval-audit` skill against our eval pipeline. Key findings:

1. **Failure categories were spec-driven, not observation-driven.** We tested what the system *should* do (from the assignment spec) rather than what it *actually* gets wrong. Real error analysis on production traces would surface failure modes we haven't thought of.

2. **Zero labeled data.** The eval scenarios are definitions, not labeled traces. Building a corpus of ~100 labeled traces (input/output pairs with human pass/fail verdicts) would enable judge validation.

3. **No regression testing.** The workflow architecture changed 10+ times during development. Evals should run after every deployment.

### Current eval results

8/9 evals pass consistently. The one failure (Eval 08: API Failure Handling) is a genuine agent behavior issue -- the agent asks for timezone clarification instead of using a default when the currency tool fails. This is a prompt fix, not an eval problem.

---

## Architecture

### Why deterministic auth before the AI agent

The original flowchart shows authentication in the AI Agent lane with PIN validation in the JavaScript Tools lane. We interpreted this as: **auth validation must be deterministic code, not LLM reasoning.**

We researched this against OWASP, Google Cloud, and Microsoft Azure guidance. The consensus: authentication is a security concern that must be enforced by deterministic, non-bypassable infrastructure. If auth is an AI tool, a prompt injection in the first message could trick the agent into skipping it. With Code nodes, unauthenticated users never reach the agent.

The implementation: Chat Trigger -> Session Manager -> Switch (4-way: welcome/auth/ready/locked) -> deterministic Code nodes for welcome and auth -> AI Agent only when stage=ready.

### Why Data Table instead of $getWorkflowStaticData

We initially used `$getWorkflowStaticData('global')` for session state. It worked in production mode (webhook executions) but **silently failed in test mode** (manual executions from the n8n editor). The n8n source code explicitly skips static data saving when `mode === 'manual'`.

This meant every message in the editor's test chat started fresh at `stage=welcome`, making the auth flow untestable during development. We confirmed this by reading the n8n source: the `workflowExecuteAfter` lifecycle hook checks `!isManualMode` before saving.

We switched to an n8n Data Table (`assistant_sessions`) which persists via database writes regardless of execution mode. The `Manage Intents` tool still uses `$getWorkflowStaticData` for the short-lived intent queue during agent processing -- that's fine because intents are created and consumed within a single execution.

### Why the Switch node needs looseTypeValidation

The n8n Switch node v3.4 with `typeValidation: "strict"` throws `Cannot read properties of undefined (reading 'caseSensitive')` when the conditions object is missing the `options` field. The n8n IF node v2.3 with `typeValidation: "strict"` throws `Wrong type: '' is a string but was expecting a boolean` when checking a boolean field.

Both were fixed by setting `looseTypeValidation: true` and `typeValidation: "loose"` in the options. This was discovered through production execution errors (executions 8 and 39).

### Why HTTP Request Tool instead of Code Tool for currency

The currency converter was initially a Code Tool using `fetch()` to call the Frankfurter API. This worked locally but **failed on n8n Cloud** because the Code node runs in a sandboxed VM that blocks outbound HTTP requests.

We switched to `n8n-nodes-base.httpRequestTool` which uses n8n's native HTTP engine, bypassing the sandbox. The tool uses `$fromAI()` expressions to let the agent provide the date, amount, from_currency, and to_currency parameters dynamically.

The API also moved from `api.frankfurter.dev` to `api.frankfurter.app` during development, causing 404 errors until we updated the URL.

### Why the Chat Trigger needs public: true

The n8n Chat Trigger has a `public` flag. When false (default), the hosted chat page at the production webhook URL returns 404. When true, it serves an HTML chat widget. We needed this for the production chat URL to work.

The Chat Trigger also supports `mode: "hostedChat"` (n8n-served chat page) vs `mode: "webhook"` (embedded chat via API). We use hosted chat for simplicity.

### Why streaming doesn't work

We enabled `responseMode: "streaming"` on the Chat Trigger for better UX. It broke with the error: "No response received. This could happen if streaming is enabled in the trigger but disabled in agent node(s)."

The reason: streaming requires a direct path from Chat Trigger to AI Agent. Our workflow has Code nodes in between (Session Manager, Switch, Welcome, Auth). These intermediate non-AI nodes break the streaming pipeline. Only the `stage=ready` path goes to the AI Agent; the other 3 paths (welcome, auth, locked) terminate at Code nodes which can't stream.

We reverted to `responseMode: "lastNode"`.

---

## Tools

### Why manage_intents is stateless

The `manage_intents` Code Tool tracks intents through a save -> get_next -> mark_done -> get_next cycle. It was originally stateful (using `$getWorkflowStaticData`), but we made it stateless -- the agent passes the queue array in every call, and the tool returns the updated queue.

This avoids the static data persistence issues entirely. The agent keeps the queue in its conversation context and passes it back and forth. The tradeoff is slightly larger tool call payloads, but it's more reliable.

### Why the date/time tool uses Intl.DateTimeFormat

The initial date formatter used manual string concatenation (`days[date.getDay()] + ', ' + date.getDate() + ...`). We switched to `Intl.DateTimeFormat` with timezone support because:

1. It handles locale-aware formatting automatically
2. It accepts a `timezone` parameter (defaulting to `Asia/Kolkata`)
3. It produces more natural output ("Thursday, 17 April 2026" vs "Thursday, 17 April 2026")

The tool also accepts a `baseDate` parameter so the agent can pass today's date explicitly, avoiding timezone drift in the `new Date()` constructor.

---

## LLM

### Why we switched from GPT-4.1 to Claude Haiku

The spec required GPT-4.1. We used it initially with n8n's free OpenAI credits. The credits ran out mid-testing ("It looks like you've used all your free credits for the n8n"). We switched to Claude Haiku 4.5 (Anthropic) which the user had credentials for. The workflow is LLM-agnostic -- swap the language model node and credentials.

### Why temperature 0.2

Lower temperature reduces response variability, making eval checks more consistent. We use 0.2 rather than 0 to allow some natural variation in phrasing while keeping the agent's behavior predictable.

---

## What we'd do differently

1. **Start with Data Table from day one.** We spent significant time debugging `$getWorkflowStaticData` persistence issues that wouldn't have existed with Data Tables.

2. **Use the HTTP Request Tool from the start** for the currency converter instead of Code Tool with `fetch()`. The sandbox restriction on n8n Cloud was a surprise.

3. **Build evals earlier.** The eval runner was built late in the process. Having it from the start would have caught regressions during the 10+ architecture changes.

4. **Run error analysis on real traces** instead of designing evals purely from the spec. The one genuine eval failure (Eval 08) was a failure mode we didn't anticipate.
