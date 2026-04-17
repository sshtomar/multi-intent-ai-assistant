"""
LLM Judge for Multi-Intent AI Assistant eval checks.

Evaluates AI agent responses that are too variable for regex.
Uses Claude Haiku as the judge (cheap, fast, sufficient for binary pass/fail).

Usage:
    python3 llm_judge.py <check_name> <user_message> <agent_response>

Returns JSON: {"pass": true/false, "reason": "..."}
"""

import sys
import json
import os

import anthropic

JUDGE_PROMPTS = {
    "rejects_unsupported_intent": {
        "system": """You are an eval judge. Determine if the AI assistant correctly rejected an unsupported user request.

PASS criteria (ALL must be true):
1. The assistant clearly communicates that the requested capability is NOT available
2. The assistant does NOT attempt to fulfill the unsupported request
3. The assistant lists or mentions its actual supported capabilities (currency conversion and/or date/time)

FAIL if the assistant tries to help with the unsupported request, or does not mention its actual capabilities.

Respond with JSON only: {"pass": true/false, "reason": "one sentence"}""",
    },

    "extracts_correct_intents": {
        "system": """You are an eval judge. Determine if the AI assistant correctly extracted the right intents from the user's message.

PASS criteria:
1. All distinct intents mentioned by the user are captured
2. No intents are hallucinated (not mentioned by the user)
3. Intent types are correct (currency_conversion for exchange rates, date_time for dates/times)
4. The assistant confirms the intents before processing

FAIL if any intent is missed, hallucinated, or mistyped.

Respond with JSON only: {"pass": true/false, "reason": "one sentence"}""",
    },

    "returns_tool_result": {
        "system": """You are an eval judge. Determine if the AI assistant's response contains specific results for the user's request.

PASS criteria (any ONE is sufficient):
1. The response contains a specific exchange rate number (e.g., "0.85", "93.24")
2. The response contains a specific date (e.g., "April 19", "2026-04-20")
3. The response contains any concrete numeric or date answer to the user's query

FAIL only if:
- The response contains NO specific numbers or dates at all
- The response only asks clarification questions without providing any answer
- The response explicitly says it cannot provide the information

Words like "approximately" or "about" do NOT cause a fail -- the result is still provided.

Respond with JSON only: {"pass": true/false, "reason": "one sentence"}""",
    },

    "handles_error_gracefully": {
        "system": """You are an eval judge. Determine if the AI assistant handled a tool/API error gracefully.

PASS criteria:
1. The assistant acknowledges the error without technical jargon
2. The assistant does NOT fabricate a result
3. The assistant continues to process remaining intents (if any)
4. The tone is helpful, not blaming the user

FAIL if the assistant crashes, fabricates data, or stops processing entirely.

Respond with JSON only: {"pass": true/false, "reason": "one sentence"}""",
    },

    "no_hallucinated_intent": {
        "system": """You are an eval judge. The user sent a vague message like "I'm not sure what I need." Determine if the assistant correctly avoided hallucinating an intent.

PASS criteria:
1. The assistant does NOT extract or confirm any specific intent from the vague message
2. The assistant explains its capabilities (currency conversion and date/time)
3. The assistant asks the user to clarify what they need

FAIL if the assistant invents an intent from a vague message or starts processing without the user specifying what they want.

Respond with JSON only: {"pass": true/false, "reason": "one sentence"}""",
    },

    "ends_cleanly": {
        "system": """You are an eval judge. The user said something like "No thanks" or "That's all." Determine if the assistant ended the conversation cleanly.

PASS criteria:
1. The assistant thanks the user or says goodbye
2. The assistant does NOT ask another question or suggest more actions
3. The response is brief (1-2 sentences max)

FAIL if the assistant keeps asking questions, suggests more things to do, or sends a long response.

Respond with JSON only: {"pass": true/false, "reason": "one sentence"}""",
    },
}


def judge(check_name, user_message, agent_response):
    if check_name not in JUDGE_PROMPTS:
        return {"pass": False, "reason": f"Unknown check: {check_name}. Available: {list(JUDGE_PROMPTS.keys())}"}

    prompt = JUDGE_PROMPTS[check_name]
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        return {"pass": False, "reason": "ANTHROPIC_API_KEY not set"}

    client = anthropic.Anthropic(api_key=api_key)
    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=200,
        system=prompt["system"],
        messages=[{
            "role": "user",
            "content": f"User message: {user_message}\n\nAssistant response: {agent_response}"
        }]
    )

    text = response.content[0].text.strip()
    # Strip markdown code fences if present
    if text.startswith("```"):
        text = text.split("\n", 1)[-1] if "\n" in text else text[3:]
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        # Try to extract JSON from the text
        import re
        match = re.search(r'\{[^}]+\}', text)
        if match:
            try:
                return json.loads(match.group())
            except json.JSONDecodeError:
                pass
        return {"pass": False, "reason": f"Judge returned non-JSON: {text[:200]}"}


if __name__ == "__main__":
    if len(sys.argv) < 4:
        print(json.dumps({"pass": False, "reason": "Usage: python3 llm_judge.py <check_name> <user_message> <agent_response>"}))
        sys.exit(1)

    result = judge(sys.argv[1], sys.argv[2], sys.argv[3])
    print(json.dumps(result))
