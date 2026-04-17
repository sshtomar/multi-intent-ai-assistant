# Multi-Intent AI Assistant

A stateful AI chat assistant built in [n8n](https://n8n.io) that authenticates users, captures multiple intents in a single conversation, and processes them sequentially using real APIs.

## How It Works

```
User: Hello
Bot:  Hi, can you please provide your user ID and 4-digit PIN to continue?
User: user id 5673 and pin 1234
Bot:  Hi Devin, how can I help you today?
User: I need the USD to INR rate for yesterday and the date on the coming Sunday.
Bot:  You want two things:
      1. USD to INR exchange rate for yesterday
      2. Date of the coming Sunday
      Shall I proceed?
User: Yes
Bot:  Checking currency conversion... Yesterday, 1 USD was 93.24 INR.
      Checking the date... The coming Sunday is 19 April 2026.
      Anything else?
User: No, thanks.
Bot:  Thank you Devin, have a great day!
```

## System Flow

```
Chat Trigger
  -> Prepare Chat Input
  -> Ensure Session Row (Data Table)
  -> Get Session State (Data Table)
  -> Resolve Session State
  -> Route by Stage (Switch)
      |welcome -> Welcome (Code) -> Persist -> Response
      |auth    -> Mock Auth Tool (Code) -> Persist -> Auth Check (IF)
      |                                                 -> Success / Failure
      |ready   -> AI Agent (LLM + Tools)
      |locked  -> Session Locked (Code)
```

**Welcome and Authentication are deterministic** -- handled entirely by JavaScript Code nodes with no LLM involvement. The AI Agent is only reached after successful authentication.

## Stages

| Stage | Handler | Description |
|-------|---------|-------------|
| Welcome | Code node | Greets user, asks for credentials |
| Authentication | Code node | Validates user ID + 4-digit PIN against mock database |
| Intent Capture | AI Agent | Extracts intents, confirms with user before processing |
| Intent Processing | AI Agent + Tools | Processes one intent at a time: declare, call tool, present result |
| Wrap-up | AI Agent | Asks if anything else needed, ends cleanly |

## Intent Processors

**Currency Converter** -- HTTP Request Tool calling [api.frankfurter.app](https://api.frankfurter.app). Supports historical and latest rates for any ISO 4217 currency pair.

**Date/Time Generator** -- JavaScript Code Tool computing dates from natural language. Supports: today, tomorrow, yesterday, next/last [weekday], N hours/days/weeks from now/ago.

## Mock Users

| User ID | Name | PIN |
|---------|------|-----|
| 5673 | Devin | 1234 |
| 8421 | Sarah | 5678 |
| 3019 | Alex | 9012 |
| 7745 | Jordan | 3456 |
| 1298 | Maya | 7890 |

## Session Persistence

Session state (stage, userName, authAttempts) is stored in an **n8n Data Table** named `assistant_sessions`. This persists across messages in both test and production execution modes.

## Evals

12 evaluation scenarios in `evals.json` covering:

- Happy flow (single and multi-intent)
- Follow-up intents during wrap-up
- Authentication failure and lockout
- No intent detected / invalid intent
- Intent modification (add/remove during confirmation)
- API failure graceful handling
- PIN security (no data leakage)
- Duplicate intent prevention
- Edge cases (credentials in first message, nonexistent user)

### Running Evals

```bash
# Hybrid runner: regex for deterministic stages, LLM judge for AI stages
ANTHROPIC_API_KEY=sk-... bash run_evals_v2.sh

# Regex-only runner (no API key needed, less reliable for AI stages)
bash run_evals.sh

# Custom endpoint
bash run_evals_v2.sh https://your-instance.app.n8n.cloud/webhook/multi-intent-assistant/chat
```

### LLM Judge

`llm_judge.py` implements 6 binary pass/fail judges using Claude Haiku for evaluating AI agent responses:

| Judge | Checks |
|-------|--------|
| `rejects_unsupported_intent` | Agent rejected an unsupported request and listed capabilities |
| `extracts_correct_intents` | All intents captured, none hallucinated, correct types |
| `returns_tool_result` | Response contains specific numbers or dates from tool calls |
| `handles_error_gracefully` | Error acknowledged without jargon, processing continues |
| `no_hallucinated_intent` | No intent invented from a vague message |
| `ends_cleanly` | Brief goodbye, no follow-up questions |

## Setup

1. Import `workflow.json` into n8n
2. Create a Data Table named `assistant_sessions` with columns: `sessionId` (string), `stage` (string), `userName` (string), `userId` (string), `authAttempts` (number)
3. Set your LLM credential on the AI Agent's language model node
4. Activate the workflow
5. Open the Chat Trigger's production URL to test

## Tech Stack

- **Platform:** n8n Cloud
- **LLM:** Claude Haiku 4.5 (Anthropic) or GPT-4.1 (OpenAI)
- **Currency API:** [Frankfurter](https://frankfurter.app)
- **Session Store:** n8n Data Table
- **Eval Judge:** Claude Haiku 4.5
