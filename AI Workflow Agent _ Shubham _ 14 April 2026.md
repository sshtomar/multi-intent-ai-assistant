# **Multi-Intent AI Assistant**

## **Objective**

Build a stateful AI chat assistant in **n8n** that handles multiple user intents within a single conversation using a multi-step workflow.

The system must be reliable, structured, and production-grade.

# **System Flow**

The workflow must implement the following stages:

1. Welcome  
2. Authentication (User ID & 4-digit PIN)  
3. Intent Capture & Confirmation  
4. Intent Handler (one intent at a time)  
5. Intent Processors  
6. Call Wrap-up

All stages are mandatory and must not be skipped under any circumstances. Ensure the workflow does not enter infinite loops.

**Here is the FlowChart:** [Multi-Intent AI Assistant - Flowchart.drawio.png](https://drive.google.com/file/d/1la2iyscN8SKxsnSNLvVvVg-hkLX9YI__/view?usp=drive_link)

# **Functional Requirements**

1. ## **Welcome**

* Provide a short greeting  
* Transition to authentication

2. ## **Authentication (User ID & 4-digit PIN)**

* Simulate authentication (no real backend; Build a tool with mock user data)  
  * Example Mock data: {id: {name: “”, pin: “”}, id2: {name: “”, pin: “”}}  
* Prompt the user to enter the user ID and a 4-digit numeric PIN  
* Validate and authenticate the user  
* Store the user ID and name upon successful authentication  
* Do not reveal or expose the PIN or user details at any point

3. ## **Intent Capture & Confirmation**

* Ask the user how you can assist them using their name  
* Extract intent(s) from the user message  
  * Prevent duplicate intents  
* Retry or re-prompt if:  
  * No intent is detected  
  * An invalid intent is detected (inform the user about supported capabilities)  
* Confirm the extracted intents with the user  
* Allow the user to:  
  * Add new intents  
  * Remove existing intents  
  * Proceed with the current intents  
* Store intents for later processing

4. ## **Intent Handler**

* Fetch only ONE intent at a time  
* Route the intent to the appropriate processor  
* If no intents remain, route to Call Wrap-up

5. ## **Intent Processors**

* Implement intent-specific processors  
* Implement 2 intent processors with one tool each:  
  * Currency Converter using https://frankfurter.dev/ or https://api.exchangerate.host  
  * Natural language date & time generator (ex, What is the date tomorrow?, 2 hours from now, Next Monday, etc.)   
* Declare the intent  
* Validate inputs  
* Handle API failure gracefully  
* Return structured output  
* Keep agent replies concise (no long paragraphs)  
* Route back to Intent Handler  
6. **Call Wrap-up**  
* Ask the user if they have additional requests  
* If yes, capture and store the new intents and route back to the Intent Handler  
* End the interaction cleanly

# **LLM to Use**

GPT 4.1

# **Evals**

You should define a set of evals covering typical flows as well as edge cases (e.g., invalid intents, authentication failure, multiple intents). Must have evals:

* Happy Flow (Single Intent)  
* Sequential Processing (Multi-Intent)  
* Follow-up intents  
* Authentication Failure  
* No Intent Detected  
* Invalid Intent  
* Intent Modification

# **Time Limit**

1 Day

# **Sample Conversation:**

**Agent:** Hi, can you please provide your user ID and 4-digit PIN to continue?

**User:** user id 5673 and pin 1234

**Agent:** Hi Devin, how can I help you today?

**User:** I need to know the USD to INR conversion for yesterday and the date on the coming Sunday.

**Agent:** Sure, I can help you with yesterday’s USD to INR conversion and date on the coming Sunday. Anything else I can help you with?

**User:** No, that’s it for now.

**Agent:** Checking currency conversion...

**Agent:** Yesterday, 1 USD was 90 INR.

**Agent:** Checking the date on this coming Sunday...

**Agent:** The date coming Sunday will be 12 April 2026\.

**Agent:** Anything else that I can help you with?

**User:** No, that’s it, thank you.

**Agent:** Thank you. Have a nice day\!

