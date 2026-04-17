# Multi-Intent AI Assistant -- Evals Documentation

## 1. Eval Design Process

### Starting Point: Spec-Driven Scenarios

The initial 12 eval scenarios were derived directly from the assignment spec (`AI Workflow Agent _ Shubham _ 14 April 2026.md`), which mandated 7 evals:

1. Happy Flow (Single Intent)
2. Sequential Processing (Multi-Intent)
3. Follow-up Intents
4. Authentication Failure
5. No Intent Detected
6. Invalid Intent
7. Intent Modification

We added 5 more to cover edge cases: API Failure Handling, PIN Security, Duplicate Intent Prevention, Credentials in First Message, and Nonexistent User ID. All 12 are defined in `evals.json` as multi-turn conversation scripts with `user` messages, `expected_behavior` descriptions, `stage` labels, and `pass_criteria` checklists.

### Audit Against Hamel's Eval Framework

We ran Hamel Husain's `eval-audit` skill against our eval pipeline and identified 7 findings:

| # | Finding | Severity |
|---|---------|----------|
| 1 | No automated evaluators -- only human-readable descriptions | High |
| 2 | Pass criteria not machine-checkable (vague wording like "ends cleanly") | High |
| 3 | No error analysis on real production traces | High |
| 4 | Zero labeled data (scenarios are definitions, not labeled traces) | Medium |
| 5 | Failure categories brainstormed from spec, not observed from traces | Medium |
| 6 | No regression testing after architecture changes | Medium |
| 7 | No structured review process for traces | Low |

### Key Insight: Two Types of Stages

The workflow has two fundamentally different types of stages that need different evaluation strategies:

**Deterministic stages** (Welcome, Auth, Locked) -- Code nodes with exact, predictable outputs. These can be evaluated with regex and exact string matching.

**AI agent stages** (Intent Capture, Processing, Wrap-up) -- LLM-generated responses that vary in wording across runs. These need an LLM judge for reliable pass/fail.

---

## 2. Eval Infrastructure

### Files

| File | Purpose |
|------|---------|
| `evals.json` | 12 eval scenario definitions with multi-turn conversation scripts |
| `run_evals.sh` | v1 eval runner -- regex-only checks (brittle for AI stages) |
| `run_evals_v2.sh` | v2 eval runner -- hybrid regex + LLM judge |
| `llm_judge.py` | 6 binary pass/fail LLM judges using Claude Haiku |
| `eval_results.json` | Output from v1 runner with raw traces |

### Running Evals

```bash
# v2 runner (recommended) -- requires Anthropic API key
ANTHROPIC_API_KEY=sk-... bash run_evals_v2.sh

# v1 runner (regex only, no API key needed)
bash run_evals.sh

# Custom URL
bash run_evals_v2.sh https://your-instance.app.n8n.cloud/webhook/multi-intent-assistant/chat
```

The runner sends messages to the production webhook with a unique `sessionId` per eval, waits for responses, and applies checks. Total runtime is ~3-5 minutes for all 9 tested evals.

---

## 3. Code-Based Checks (Deterministic Stages)

These checks use regex and string matching. They are 100% consistent across runs because the outputs come from JavaScript Code nodes, not the LLM.

### Welcome Stage
```bash
# Output must contain "user ID"
check_contains "$output" "user ID"

# No PIN values in output
pin_not_leaked "$output"  # checks for 1234, 5678, 9012, 3456, 7890
```

### Auth Success
```bash
# Must contain the user's name
check_contains "$output" "Devin"  # or Sarah, Alex, Jordan, Maya
```

### Auth Failure
```bash
# Generic error, no PIN distinction
check_contains "$output" "failed|check your"
pin_not_leaked "$output"
```

### Lockout
```bash
# Must mention lockout
check_contains "$output" "Maximum|locked|too many"

# Locked state must persist on subsequent messages
check_contains "$next_output" "locked|too many|Maximum"
```

### Credentials in First Message
```bash
# First message always goes to Welcome regardless of content
check_contains "$first_output" "user ID|PIN|provide"
check_not_contains "$first_output" "Sarah|how can I help"
```

---

## 4. LLM Judge (AI Agent Stages)

Six binary pass/fail judges implemented in `llm_judge.py`, each targeting a specific failure mode. The judge LLM is Claude Haiku 4.5 (cheap, fast, sufficient for binary classification).

### Why Regex Failed

In testing, regex-based checks for AI agent outputs produced inconsistent results:
- `check_contains "can't|cannot|not supported"` missed `"I'm unable to"` (Eval 06)
- `check_contains "unavailable|error"` missed `"I apologize for these technical difficulties"` (Eval 08)
- `check_not_contains "proceed|processing"` false-triggered on `"proceed with these two requests?"` (Eval 05)

The same eval would pass on one run and fail on the next depending on the LLM's wording. LLM judges eliminate this brittleness.

### Judge Definitions

#### `rejects_unsupported_intent`
- **Checks:** Agent rejected an unsupported request (e.g., flight booking)
- **PASS:** Communicates capability is unavailable + lists actual capabilities + does not attempt fulfillment
- **FAIL:** Tries to help with unsupported request or omits capabilities list

#### `extracts_correct_intents`
- **Checks:** Agent extracted the right intents from the user message
- **PASS:** All intents captured, none hallucinated, correct types, confirmation before processing
- **FAIL:** Missed intent, hallucinated intent, wrong type, or no confirmation

#### `returns_tool_result`
- **Checks:** Response contains actual results (not fabricated)
- **PASS:** Contains specific numbers (exchange rate) or dates (April 19) -- words like "approximately" are acceptable
- **FAIL:** No concrete values, only asks clarification, or explicitly says cannot provide

#### `handles_error_gracefully`
- **Checks:** Agent handled a tool/API failure without crashing
- **PASS:** Acknowledges error without jargon, does not fabricate, continues with remaining intents
- **FAIL:** Crashes, fabricates data, or stops processing entirely

#### `no_hallucinated_intent`
- **Checks:** Agent did NOT invent an intent from a vague message
- **PASS:** Explains capabilities and asks to clarify without extracting any intent
- **FAIL:** Invents an intent from vague input like "I'm not sure what I need"

#### `ends_cleanly`
- **Checks:** Agent ended the conversation properly after user declined more help
- **PASS:** Thanks user, says goodbye, 1-2 sentences max, no follow-up questions
- **FAIL:** Asks more questions, suggests actions, or sends a long response

### Judge Calibration

The `returns_tool_result` judge was initially too strict -- it failed responses that used "approximately" or lacked a named data source. After calibration, it now passes any response containing a specific number or date, regardless of hedging language. This resolved false failures on Evals 01 and 02.

---

## 5. Results

### Latest Run (v2 with LLM Judge)

| Eval | Checks Used | Result |
|------|-------------|--------|
| 01 Happy Flow (Single Intent) | Regex + LLM Judge | PASS |
| 02 Sequential Multi-Intent | Regex + LLM Judge | PASS |
| 04 Auth Failure | Regex only | PASS |
| 05 No Intent Detected | LLM Judge | PASS |
| 06 Invalid Intent | LLM Judge | PASS |
| 08 API Failure Handling | LLM Judge | FAIL |
| 09 PIN Security | Regex + LLM Judge | PASS |
| 11 Credentials in First Message | Regex only | PASS |
| 12 Nonexistent User | Regex only | PASS |

**8/9 passed (89%).**

### Eval 08 Failure Analysis

The single failure is a genuine agent behavior issue, not a judge or check problem. When processing two intents (currency conversion with invalid code XYZ + date next Monday), the agent asks the user for timezone clarification instead of using the default timezone and returning the date result. The system prompt should be updated to use `Asia/Kolkata` as the default timezone without asking.

### Evals Not Yet Automated (3, 7, 10)

These evals require longer multi-turn conversations (7 turns for follow-up intents, 5 turns for intent modification, 4 turns for duplicate prevention) and would benefit from a more structured test harness. The patterns are the same -- regex for deterministic stages, LLM judge for AI stages.

---

## 6. Architecture

```
                    +------------------+
                    |   evals.json     |  12 scenario definitions
                    +------------------+
                            |
                    +------------------+
                    | run_evals_v2.sh  |  Orchestrator (bash)
                    +------------------+
                       /          \
              +----------+    +-----------+
              |  Regex   |    | LLM Judge |
              |  Checks  |    | (Python)  |
              +----------+    +-----------+
                   |               |
            Deterministic     AI Agent
            stages            stages
            (welcome,         (intent capture,
             auth,             processing,
             locked)           wrap-up)
                   \              /
                    +------------+
                    |  Results   |
                    +------------+
```

---

## 7. Lessons Learned

1. **Regex is reliable for deterministic stages but brittle for LLM output.** The same agent response can say "I can't", "I'm unable to", "I don't have the ability to" -- all correct, all failing different regex patterns.

2. **LLM judges need calibration.** The first version of `returns_tool_result` was too strict about wording. After one round of calibration against real traces, it became reliable.

3. **Separate the eval strategy by stage type.** Don't use the same technique for Code node outputs and LLM outputs. Code nodes are deterministic -- use exact checks. LLM outputs are variable -- use semantic judges.

4. **Run evals after every deployment.** The workflow architecture changed 10+ times during development. Each change could introduce regressions that only surface in production.

5. **The audit surfaced real gaps.** Before the audit, we had 12 scenario definitions but zero automated checks. After implementing the audit's recommendations, we have a hybrid eval runner that catches both deterministic and semantic failures.

---

## 8. Next Steps

Per the eval audit recommendations:

1. **Run `error-analysis`** on the 50+ production traces collected during development to discover failure modes not covered by the current 12 evals
2. **Automate Evals 03, 07, 10** (follow-up intents, intent modification, duplicate prevention) in the v2 runner
3. **Validate the LLM judges** against human labels using `validate-evaluator` -- need ~50 Pass and ~50 Fail labeled examples per judge
4. **Fix Eval 08** by updating the system prompt to use a default timezone
5. **Add regression testing** to the deployment pipeline -- run `run_evals_v2.sh` after every `publish_workflow` call
