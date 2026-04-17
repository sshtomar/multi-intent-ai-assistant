const fs = require('fs');
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, Header, Footer,
        AlignmentType, HeadingLevel, BorderStyle, WidthType, ShadingType, VerticalAlign,
        LevelFormat, PageNumber, PageBreak, TableOfContents } = require('docx');

const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const cb = { top: border, bottom: border, left: border, right: border };
const hdrShade = { fill: "E8EDF2", type: ShadingType.CLEAR };

function cell(text, opts = {}) {
  const w = opts.width || 4680;
  const runs = Array.isArray(text) ? text : [new TextRun({ text, bold: !!opts.bold, size: opts.size || 22, font: "Arial" })];
  return new TableCell({
    borders: cb, width: { size: w, type: WidthType.DXA },
    shading: opts.header ? hdrShade : undefined,
    verticalAlign: VerticalAlign.CENTER,
    children: [new Paragraph({ spacing: { before: 40, after: 40 }, children: runs })]
  });
}

function hdr(texts, widths) {
  return new TableRow({ tableHeader: true, children: texts.map((t, i) => cell(t, { bold: true, header: true, width: widths[i] })) });
}

function row(texts, widths) {
  return new TableRow({ children: texts.map((t, i) => cell(t, { width: widths[i] })) });
}

function h1(t) { return new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 360, after: 200 }, children: [new TextRun({ text: t, font: "Arial" })] }); }
function h2(t) { return new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 280, after: 160 }, children: [new TextRun({ text: t, font: "Arial" })] }); }
function h3(t) { return new Paragraph({ heading: HeadingLevel.HEADING_3, spacing: { before: 200, after: 120 }, children: [new TextRun({ text: t, font: "Arial" })] }); }
function p(t, opts = {}) { return new Paragraph({ spacing: { after: 120 }, ...opts, children: Array.isArray(t) ? t : [new TextRun({ text: t, size: 22, font: "Arial" })] }); }
function b(t) { return new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: t, size: 22, font: "Arial", bold: true })] }); }
function code(t) { return new Paragraph({ spacing: { after: 80 }, indent: { left: 360 }, children: [new TextRun({ text: t, size: 20, font: "Courier New", color: "333333" })] }); }

const w2 = [3800, 5560];
const w3 = [800, 3200, 5360];
const w4 = [600, 2400, 2800, 3560];

const doc = new Document({
  styles: {
    default: { document: { run: { font: "Arial", size: 22 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 32, bold: true, color: "1A1A2E", font: "Arial" },
        paragraph: { spacing: { before: 360, after: 200 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 26, bold: true, color: "2D2D5E", font: "Arial" },
        paragraph: { spacing: { before: 280, after: 160 }, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 24, bold: true, color: "444444", font: "Arial" },
        paragraph: { spacing: { before: 200, after: 120 }, outlineLevel: 2 } }
    ]
  },
  numbering: {
    config: [
      { reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "\u2022", alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      { reference: "num1", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] }
    ]
  },
  sections: [
    // TITLE PAGE
    {
      properties: { page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
      children: [
        new Paragraph({ spacing: { before: 4000 } }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [
          new TextRun({ text: "Multi-Intent AI Assistant", size: 56, bold: true, color: "1A1A2E", font: "Arial" })
        ] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 600 }, children: [
          new TextRun({ text: "Workflow Documentation", size: 32, color: "555555", font: "Arial" })
        ] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 100 }, children: [
          new TextRun({ text: "n8n Stateful Chat Assistant", size: 24, color: "888888", font: "Arial" })
        ] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 100 }, children: [
          new TextRun({ text: "GPT-4.1 | Currency Conversion | Date/Time Queries", size: 22, color: "888888", font: "Arial" })
        ] }),
        new Paragraph({ spacing: { before: 2000 } }),
        new Paragraph({ alignment: AlignmentType.CENTER, children: [
          new TextRun({ text: "April 2026", size: 22, color: "999999", font: "Arial" })
        ] }),
      ]
    },
    // TOC + CONTENT
    {
      properties: {
        page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } },
      },
      headers: {
        default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [
          new TextRun({ text: "Multi-Intent AI Assistant", size: 18, color: "999999", font: "Arial", italics: true })
        ] })] })
      },
      footers: {
        default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [
          new TextRun({ text: "Page ", size: 18, font: "Arial", color: "999999" }),
          new TextRun({ children: [PageNumber.CURRENT], size: 18, font: "Arial", color: "999999" }),
          new TextRun({ text: " of ", size: 18, font: "Arial", color: "999999" }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 18, font: "Arial", color: "999999" })
        ] })] })
      },
      children: [
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "Table of Contents", font: "Arial" })] }),
        new TableOfContents("Table of Contents", { hyperlink: true, headingStyleRange: "1-3" }),
        new Paragraph({ children: [new PageBreak()] }),

        // 1. OVERVIEW
        h1("1. Overview"),
        p("A stateful AI chat assistant built in n8n that handles multiple user intents within a single conversation. The system implements a mandatory six-stage flow: Welcome, Authentication, Intent Capture & Confirmation, Intent Handler, Intent Processors, and Call Wrap-up."),
        new Table({
          columnWidths: [3800, 5560],
          margins: { top: 60, bottom: 60, left: 120, right: 120 },
          rows: [
            hdr(["Property", "Value"], w2),
            row(["Platform", "n8n Cloud"], w2),
            row(["LLM", "GPT-4.1 (OpenAI)"], w2),
            row(["Workflow ID", "XCZkiE8adVsIRp0B"], w2),
            row(["Node Count", "15"], w2),
            row(["Triggers", "1 (Chat Trigger, public hosted chat)"], w2),
            row(["Intent Processors", "Currency Converter (Frankfurter API), Date/Time Generator (JavaScript)"], w2),
          ]
        }),
        new Paragraph({ children: [new PageBreak()] }),

        // 2. ARCHITECTURE
        h1("2. Architecture"),
        h2("2.1 Three-Layer Design"),
        b("Layer 1: Deterministic Pre-Auth Gate (Code Nodes)"),
        p("Welcome and Authentication are handled entirely by JavaScript Code nodes. No LLM is involved. PIN validation uses exact string matching against a mock database."),
        b("Layer 2: AI Agent (Post-Auth)"),
        p("Only reached after successful authentication (stage=ready). Handles intent capture, processing, and wrap-up via GPT-4.1 with connected tools."),
        b("Layer 3: Tools"),
        p("Three AI-connected tools: Convert Currency (HTTP Request), Get Date Time (Code Tool), Manage Intents (Code Tool)."),

        h2("2.2 Swim Lane Mapping"),
        p("The architecture maps to the flowchart's three swim lanes:"),
        new Table({
          columnWidths: [3120, 6240],
          margins: { top: 60, bottom: 60, left: 120, right: 120 },
          rows: [
            hdr(["Flowchart Lane", "n8n Implementation"], [3120, 6240]),
            row(["AI Agent", "Session Manager, Switch, Welcome, Auth nodes, AI Agent"], [3120, 6240]),
            row(["JavaScript Tool(s)", "Mock Auth Tool (Code), Get Date Time (Code Tool)"], [3120, 6240]),
            row(["API Tool(s)", "Convert Currency (HTTP Request Tool -> frankfurter.app)"], [3120, 6240]),
          ]
        }),

        h2("2.3 Workflow Diagram"),
        code("Chat Trigger -> Session Manager -> Route by Stage (Switch)"),
        code("  |welcome -> Welcome (Code)"),
        code("  |auth    -> Mock Auth Tool (Code) -> Auth Check (IF) -> Success/Failure"),
        code("  |ready   -> AI Agent (GPT-4.1 + Tools)"),
        code("  |locked  -> Session Locked (Code)"),
        new Paragraph({ children: [new PageBreak()] }),

        // 3. STAGE-BY-STAGE FLOW
        h1("3. Stage-by-Stage Flow"),

        h2("3.1 Stage 1: Welcome"),
        p([new TextRun({ text: "Node: ", bold: true, size: 22, font: "Arial" }), new TextRun({ text: "Welcome (Code)", size: 22, font: "Arial" })]),
        p("Triggered on the first message from any new session (stage=welcome). Returns a deterministic greeting asking for credentials. Sets stage to 'auth'. No LLM involved."),

        h2("3.2 Stage 2: Authentication"),
        p([new TextRun({ text: "Nodes: ", bold: true, size: 22, font: "Arial" }), new TextRun({ text: "Mock Auth Tool -> Auth Check -> Auth Success / Auth Failure", size: 22, font: "Arial" })]),
        p("The Mock Auth Tool extracts user ID and PIN from free-form text using regex, then validates against the mock user database:"),
        new Table({
          columnWidths: [1800, 2400, 1800, 3360],
          margins: { top: 60, bottom: 60, left: 120, right: 120 },
          rows: [
            hdr(["User ID", "Name", "PIN", "Notes"], [1800, 2400, 1800, 3360]),
            row(["5673", "Devin", "1234", "Primary test user"], [1800, 2400, 1800, 3360]),
            row(["8421", "Sarah", "5678", ""], [1800, 2400, 1800, 3360]),
            row(["3019", "Alex", "9012", ""], [1800, 2400, 1800, 3360]),
            row(["7745", "Jordan", "3456", ""], [1800, 2400, 1800, 3360]),
            row(["1298", "Maya", "7890", ""], [1800, 2400, 1800, 3360]),
          ]
        }),
        p("On success: sets stage=ready, stores userName/userId, returns personalized greeting. On failure: increments authAttempts, returns generic error. After 3 failures: sets stage=locked. PIN is never revealed."),

        h2("3.3 Stage 3: Intent Capture & Confirmation"),
        p([new TextRun({ text: "Node: ", bold: true, size: 22, font: "Arial" }), new TextRun({ text: "AI Agent (GPT-4.1)", size: 22, font: "Arial" })]),
        p("Extracts intents from user messages. Supported types: currency_conversion and date_time. Confirms intent list with user before processing. Allows adding, removing, or confirming intents. Prevents duplicates. On confirmation, saves structured intents via the manage_intents tool."),

        h2("3.4 Stage 4: Intent Handler"),
        p("Calls manage_intents with action 'get_next' to fetch the next unprocessed intent. If null (all done), moves to wrap-up. Processes exactly one intent per cycle."),

        h2("3.5 Stage 5: Intent Processors"),
        p("For each intent: (1) DECLARE what is being checked, (2) PROCESS by calling the appropriate tool, (3) ANSWER with one concise sentence, (4) UPDATE by calling mark_done with intentId, (5) NEXT by fetching the next intent. API failures are handled gracefully."),

        h2("3.6 Stage 6: Call Wrap-up"),
        p("Asks if the user needs anything else. If yes, returns to intent capture. If no, thanks the user and ends. Does not loop after the user declines."),
        new Paragraph({ children: [new PageBreak()] }),

        // 4. STATE MANAGEMENT
        h1("4. State Management"),
        p("Session state is persisted via $getWorkflowStaticData('global'), keyed by sessionId."),
        b("Per-session state structure:"),
        code('{ stage, userName, userId, authAttempts, createdAt, lastSeenAt }'),
        p("Valid stages: welcome, auth, ready, locked."),
        p([new TextRun({ text: "Important: ", bold: true, size: 22, font: "Arial", color: "CC0000" }), new TextRun({ text: "$getWorkflowStaticData only persists in production mode (active workflow, webhook execution). It does NOT persist in the n8n editor's test chat.", size: 22, font: "Arial" })]),
        new Paragraph({ children: [new PageBreak()] }),

        // 5. TOOLS
        h1("5. Tools"),

        h2("5.1 Convert Currency (HTTP Request Tool)"),
        new Table({
          columnWidths: [3120, 6240],
          margins: { top: 60, bottom: 60, left: 120, right: 120 },
          rows: [
            hdr(["Property", "Value"], [3120, 6240]),
            row(["Type", "n8n-nodes-base.httpRequestTool v4.4"], [3120, 6240]),
            row(["API", "https://api.frankfurter.app/{date}"], [3120, 6240]),
            row(["Method", "GET"], [3120, 6240]),
            row(["Query Params", "amount, from, to (via $fromAI())"], [3120, 6240]),
            row(["Retry", "3 attempts, 1s backoff"], [3120, 6240]),
            row(["Error Handling", "neverError: true, 10s timeout"], [3120, 6240]),
          ]
        }),

        h2("5.2 Get Date Time (Code Tool)"),
        new Table({
          columnWidths: [3120, 6240],
          margins: { top: 60, bottom: 60, left: 120, right: 120 },
          rows: [
            hdr(["Property", "Value"], [3120, 6240]),
            row(["Type", "@n8n/n8n-nodes-langchain.toolCode v1.3"], [3120, 6240]),
            row(["Inputs", "query, baseDate (YYYY-MM-DD), timezone"], [3120, 6240]),
            row(["Supports", "today, tomorrow, yesterday, next/last [weekday], N hours/days/weeks from now/ago"], [3120, 6240]),
            row(["Formatting", "Intl.DateTimeFormat with timezone support"], [3120, 6240]),
            row(["Output", "Structured JSON with result, isoDate, resultType"], [3120, 6240]),
          ]
        }),

        h2("5.3 Manage Intents (Code Tool)"),
        new Table({
          columnWidths: [3120, 6240],
          margins: { top: 60, bottom: 60, left: 120, right: 120 },
          rows: [
            hdr(["Property", "Value"], [3120, 6240]),
            row(["Type", "@n8n/n8n-nodes-langchain.toolCode v1.3"], [3120, 6240]),
            row(["Storage", "$getWorkflowStaticData('global') keyed by sessionId"], [3120, 6240]),
            row(["Actions", "save, get_next, mark_done, count, clear"], [3120, 6240]),
            row(["Deduplication", "Canonical key (type + description + params)"], [3120, 6240]),
            row(["Tracking", "intentId-based mark_done, in_progress status"], [3120, 6240]),
          ]
        }),
        new Paragraph({ children: [new PageBreak()] }),

        // 6. NODE INVENTORY
        h1("6. Node Inventory"),
        p("The workflow contains 15 nodes:"),
        new Table({
          columnWidths: [600, 2400, 2800, 3560],
          margins: { top: 60, bottom: 60, left: 120, right: 120 },
          rows: [
            hdr(["#", "Node", "Type", "Purpose"], w4),
            row(["1", "When chat message received", "chatTrigger", "Entry point (public hosted chat)"], w4),
            row(["2", "Session Manager", "Code", "Load/create session from staticData"], w4),
            row(["3", "Route by Stage", "Switch", "4-way routing: welcome/auth/ready/locked"], w4),
            row(["4", "Welcome", "Code", "Deterministic greeting"], w4),
            row(["5", "Mock Auth Tool", "Code", "Regex credential extraction + mock DB"], w4),
            row(["6", "Auth Check", "IF", "Routes on authenticated boolean"], w4),
            row(["7", "Auth Success", "Code", "Personalized greeting"], w4),
            row(["8", "Auth Failure", "Code", "Generic error or lockout"], w4),
            row(["9", "Session Locked", "Code", "Lockout message"], w4),
            row(["10", "AI Agent", "Agent v3.1", "Intent capture, processing, wrap-up"], w4),
            row(["11", "GPT 4.1", "lmChatOpenAi", "Language model (temp 0.2)"], w4),
            row(["12", "Window Buffer Memory", "memoryBufferWindow", "30-message conversation memory"], w4),
            row(["13", "Convert Currency", "httpRequestTool", "Frankfurter API"], w4),
            row(["14", "Get Date Time", "toolCode", "JavaScript date/time computation"], w4),
            row(["15", "Manage Intents", "toolCode", "Intent queue management"], w4),
          ]
        }),
        new Paragraph({ children: [new PageBreak()] }),

        // 7. EVALS
        h1("7. Evaluation Scenarios"),
        p("12 evaluation scenarios are defined in evals.json, covering all required test cases from the spec:"),
        new Table({
          columnWidths: [600, 3600, 5160],
          margins: { top: 60, bottom: 60, left: 120, right: 120 },
          rows: [
            hdr(["#", "Eval", "Coverage"], [600, 3600, 5160]),
            row(["1", "Happy Flow (Single Intent)", "Full flow with one currency query"], [600, 3600, 5160]),
            row(["2", "Sequential Processing (Multi-Intent)", "Two intents processed one at a time"], [600, 3600, 5160]),
            row(["3", "Follow-up Intents", "New intents added during wrap-up"], [600, 3600, 5160]),
            row(["4", "Authentication Failure", "3 wrong PINs -> lockout"], [600, 3600, 5160]),
            row(["5", "No Intent Detected", "Vague message -> re-prompt"], [600, 3600, 5160]),
            row(["6", "Invalid Intent", "Unsupported request (flight booking)"], [600, 3600, 5160]),
            row(["7", "Intent Modification", "Add/remove intents during confirmation"], [600, 3600, 5160]),
            row(["8", "API Failure Handling", "Invalid currency code -> graceful error"], [600, 3600, 5160]),
            row(["9", "PIN Security", "Attempts to leak PINs/user data"], [600, 3600, 5160]),
            row(["10", "Duplicate Intent Prevention", "Same intent type requested twice"], [600, 3600, 5160]),
            row(["11", "Credentials in First Message", "Early credential provision"], [600, 3600, 5160]),
            row(["12", "Nonexistent User ID", "Unknown user ID handling"], [600, 3600, 5160]),
          ]
        }),
        new Paragraph({ children: [new PageBreak()] }),

        // 8. SAMPLE CONVERSATION
        h1("8. Sample Conversation"),
        p(""),
        b("Agent:"),
        p("Hi, can you please provide your user ID and 4-digit PIN to continue?"),
        b("User:"),
        p("user id 5673 and pin 1234"),
        b("Agent:"),
        p("Hi Devin, how can I help you today?"),
        b("User:"),
        p("I need to know the USD to INR conversion for yesterday and the date on the coming Sunday."),
        b("Agent:"),
        p("Sure, I can help you with: 1) USD to INR conversion for yesterday, 2) Date on the coming Sunday. Anything else, or shall I proceed?"),
        b("User:"),
        p("No, that's it for now."),
        b("Agent:"),
        p("Checking currency conversion..."),
        p("Yesterday, 1 USD was approximately 93.44 INR."),
        p("Checking the date on this coming Sunday..."),
        p("The coming Sunday is Sunday, 19 April 2026."),
        p("Anything else I can help you with?"),
        b("User:"),
        p("No, that's it, thank you."),
        b("Agent:"),
        p("Thank you Devin. Have a nice day!"),
        new Paragraph({ children: [new PageBreak()] }),

        // 9. TESTING
        h1("9. Testing"),
        p([new TextRun({ text: "Production URL only. ", bold: true, size: 22, font: "Arial" }), new TextRun({ text: "The editor test chat does not persist $getWorkflowStaticData between messages, so the state machine (welcome -> auth -> ready) will not advance.", size: 22, font: "Arial" })]),
        b("To test:"),
        new Paragraph({ numbering: { reference: "num1", level: 0 }, children: [new TextRun({ text: "Open the 'When chat message received' node in n8n", size: 22, font: "Arial" })] }),
        new Paragraph({ numbering: { reference: "num1", level: 0 }, children: [new TextRun({ text: "Click the 'Production URL' tab", size: 22, font: "Arial" })] }),
        new Paragraph({ numbering: { reference: "num1", level: 0 }, children: [new TextRun({ text: "Copy the URL and open in a new browser tab", size: 22, font: "Arial" })] }),
        new Paragraph({ numbering: { reference: "num1", level: 0 }, children: [new TextRun({ text: "The hosted chat widget loads -- test the full conversation there", size: 22, font: "Arial" })] }),

        // 10. FILES
        h1("10. Project Files"),
        new Table({
          columnWidths: [3800, 5560],
          margins: { top: 60, bottom: 60, left: 120, right: 120 },
          rows: [
            hdr(["File", "Description"], w2),
            row(["workflow.json", "n8n workflow (local copy)"], w2),
            row(["evals.json", "12 evaluation scenarios with steps and pass criteria"], w2),
            row(["chat-ui.html", "Standalone dark-theme chat UI with mock auth"], w2),
            row(["Flowchart.drawio", "Editable flowchart (draw.io format)"], w2),
            row(["Flowchart.drawio.png", "Original flowchart image"], w2),
            row([".mcp.json", "n8n MCP server connection config"], w2),
            row(["WORKFLOW_DOCUMENTATION.md", "This document in markdown format"], w2),
          ]
        }),
      ]
    }
  ]
});

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync("/Users/explorer/truesparrow/Multi-Intent_AI_Assistant_Documentation.docx", buffer);
  console.log("Created Multi-Intent_AI_Assistant_Documentation.docx");
});
