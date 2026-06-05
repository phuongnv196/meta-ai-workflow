# Vibes AI Flow — Roadmap & Detail Design

Plan to extend Vibes AI Flow with a Universal LLM Node, Flow Control Nodes, Data Utility Nodes, an HTTP Request Node, and a Global Settings system for managing AI provider API keys.

---

## Phase 1: Global Settings (Backend + Frontend)

### Goal
Centralized management of AI provider credentials and endpoints, stored securely on the backend.

### Backend

**New files:**
- `backend/services/settings.service.js` — CRUD for settings in `db.json` under a `settings` key
- `backend/controllers/settings.controller.js` — GET / PUT handlers
- `backend/routes/settings.routes.js` — `GET /settings`, `PUT /settings`

**Data schema (`db.json`):**
```json
{
  "settings": {
    "providers": {
      "openai":    { "apiKey": "sk-...", "baseUrl": "https://api.openai.com/v1" },
      "gemini":    { "apiKey": "AI...",  "baseUrl": "https://generativelanguage.googleapis.com" },
      "anthropic": { "apiKey": "sk-ant-...", "baseUrl": "https://api.anthropic.com" },
      "ollama":    { "apiKey": "",       "baseUrl": "http://localhost:11434" }
    }
  }
}
```

**Security rules:**
- `GET /settings` returns provider list with `apiKey` masked (e.g. `sk-...xyz`). Full keys never sent to frontend.
- `PUT /settings` accepts partial updates (only the fields the user changed).
- Mount in `server.js`: `app.use('/settings', settingsRoutes)`.

### Frontend

**New files:**
- `frontend/src/api/settings-api.js` — `getSettings()`, `updateSettings(data)`
- `frontend/src/components/SettingsModal/SettingsModal.jsx`
- `frontend/src/components/SettingsModal/SettingsModal.scss`

**UI placement:** A ⚙️ Settings icon button on the `WorkflowListPage` header, opening a full-screen modal with:
- A tab/row per provider: OpenAI, Google Gemini, Anthropic Claude, Ollama
- Fields: API Key (password input), Base URL (text input)
- A "Test Connection" button per provider (calls a lightweight endpoint like list-models)
- Save / Cancel buttons

**Touchpoints in existing files:**
- `frontend/src/pages/WorkflowListPage/WorkflowListPage.jsx` — add Settings button

---

## Phase 2: Universal LLM Node

### Goal
A single node type `universal_llm` that can call OpenAI, Gemini, Claude, or Ollama using credentials from Global Settings.

### Backend

**New file:** `backend/services/workflow/node-handlers/universal-llm.handler.js`

```
handle(node, inputs, context):
  1. Read provider config from settings.service (provider, model from node.data)
  2. Build provider-specific request:
     - OpenAI/Ollama:  POST /v1/chat/completions  { model, messages, temperature }
     - Gemini:         POST /v1beta/models/{model}:generateContent { contents }
     - Anthropic:      POST /v1/messages { model, messages, max_tokens }
  3. Parse response → return { text, promptText, sourceType: 'text' }
```

**Register in:** `backend/services/workflow/node-handlers/index.js`

### Frontend — Node UI (in `Node.jsx` renderContent)

| Field | Type | Notes |
|---|---|---|
| Provider | Dropdown | `openai`, `gemini`, `anthropic`, `ollama` |
| Model | Dropdown | Dynamic list per provider (hardcoded initially, later fetched) |
| System Prompt | Textarea | Optional, prepended as system message |
| User Prompt | Textarea | Main prompt; also accepts upstream `promptText` from inputs |
| Temperature | Slider 0–2 | Default 0.7 |
| Max Tokens | Number input | Default 2048 |

**Output schema:** `{ text, promptText, sourceType: 'text' }`
- Compatible with existing downstream nodes (Meta Imagine reads `promptText`, Vibes reads `promptText`)

**Touchpoints in existing files:**
- `frontend/src/constants.js` — no change needed (not a reference-producing type)
- `frontend/src/components/Sidebar/Sidebar.jsx` — add to a new "AI Models" category
- `frontend/src/components/Node/Node.jsx` — add `case 'universal_llm'` in renderContent + getIcon

**Model lists (initial hardcode):**
```
openai:    ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo']
gemini:    ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash']
anthropic: ['claude-sonnet-4-20250514', 'claude-haiku-4-20250414', 'claude-3-5-sonnet-20241022']
ollama:    ['llama3', 'mistral', 'codellama', 'phi3'] (user can also type custom)
```

---

## Phase 3: Condition Node (If/Else)

### Goal
Branch workflow execution based on a condition. Only the matching branch executes; the other is skipped.

### Backend

**New file:** `backend/services/workflow/node-handlers/condition.handler.js`

```
handle(node, inputs, context):
  1. Read condition config: { field, operator, value } from node.data
     - operators: equals, not_equals, contains, not_contains, greater_than, less_than, is_empty, is_not_empty, is_truthy
  2. Evaluate first input against condition
  3. Return { conditionMet: true/false, branchId: 'true'|'false', ...passthrough }
```

**Engine change in `workflow.service.js`:**
- After executing a `condition` node, inspect `result.branchId`
- For downstream nodes connected via `sourceHandle: 'true'` or `sourceHandle: 'false'`, mark the non-matching branch nodes as `SKIPPED`
- Skipped nodes: set `results[nodeId] = { _skipped: true }`, emit `node_skipped` SSE event, do NOT execute handler

**This is the most impactful change** — it adds branching awareness to the core engine.

### Frontend — Node UI

- 2 output ports: `true` (green label) and `false` (red label)
- 1 input port (standard)
- Config: Dropdown for operator, text input for comparison value
- Visual: Green/red color indication on the executed branch after run

**Touchpoints in existing files:**
- `workflow.service.js` — add skip logic after condition node executes
- `Node.jsx` — renderContent for `condition`, multi-port output (reuse custom_node port pattern)
- `WorkflowCanvas.jsx` — `getPortPosition` handle condition node ports
- `Sidebar.jsx` — update existing "Condition" entry (currently placeholder)

---

## Phase 4: Utility Nodes

### 4a. Delay Node

**Type:** `delay`

**Backend handler:** `delay.handler.js`
```
handle(node, inputs, context):
  const ms = (node.data.seconds || 1) * 1000
  await new Promise(r => setTimeout(r, ms))
  return inputs[0] || {}  // passthrough
```

**Frontend:** Simple number input for seconds. Icon: `Timer`.

---

### 4b. HTTP Request Node

**Type:** `http_request`

**Backend handler:** `http-request.handler.js`
```
handle(node, inputs, context):
  1. Build request from node.data: { method, url, headers, body }
  2. Support template variables in url/body: {{input.text}}, {{input.resultUrl}}
  3. Execute fetch()
  4. Return { status, headers, body, text }
```

**Frontend UI fields:**

| Field | Type |
|---|---|
| Method | Dropdown: GET, POST, PUT, DELETE |
| URL | Text input (supports `{{variable}}` syntax) |
| Headers | Key-value editor (optional) |
| Body | Textarea / JSON editor (for POST/PUT) |

**Icon:** `Globe`

---

### 4c. JSON Extractor Node

**Type:** `json_extractor`

**Backend handler:** `json-extractor.handler.js`
```
handle(node, inputs, context):
  1. Get source text from inputs[0].text or inputs[0].promptText
  2. Try JSON.parse, then extract using node.data.path (e.g. "data.items[0].url")
  3. Return { text: extractedValue, promptText: extractedValue }
```

**Frontend:** Text input for JSON path (e.g. `response.choices[0].message.content`). Icon: `Braces`.

---

### 4d. Text Manipulation Node

**Type:** `text_transform`

**Backend handler:** `text-transform.handler.js`
```
handle(node, inputs, context):
  Operations (node.data.operation):
  - 'template':    Replace {{input1}}, {{input2}} placeholders with input values
  - 'regex':       Apply regex find/replace
  - 'uppercase' / 'lowercase' / 'trim'
  - 'split':       Split by delimiter, return array
  - 'join':        Join array with delimiter
  Return { text, promptText }
```

**Frontend:** Dropdown for operation type, textarea for template/pattern. Icon: `Type`.

---

### 4e. Loop Node (ForEach)

**Type:** `loop_node`

**Backend handler:** `loop-node.handler.js`

Works similarly to `custom-node.handler.js` but iterates:
```
handle(node, inputs, context):
  1. Read node.data.subNodes, node.data.subEdges (same as custom_node)
  2. Determine input array: inputs[0].items || inputs[0].imageUrls || [inputs[0]]
  3. For each item in array:
     a. Clone sub-graph
     b. Override exposed input with current item
     c. Execute sub-graph (reuse custom-node logic)
     d. Collect result
  4. Return { items: [...collectedResults], count: N }
```

**Frontend:** Reuses custom_node UI pattern (shows sub-nodes inside). Additional config: max iterations, parallel vs sequential toggle. Icon: `Repeat`.

---

## File Change Summary

### New files to create

| File | Phase |
|---|---|
| `backend/services/settings.service.js` | 1 |
| `backend/controllers/settings.controller.js` | 1 |
| `backend/routes/settings.routes.js` | 1 |
| `frontend/src/api/settings-api.js` | 1 |
| `frontend/src/components/SettingsModal/SettingsModal.jsx` | 1 |
| `frontend/src/components/SettingsModal/SettingsModal.scss` | 1 |
| `backend/services/workflow/node-handlers/universal-llm.handler.js` | 2 |
| `backend/services/workflow/node-handlers/condition.handler.js` | 3 |
| `backend/services/workflow/node-handlers/delay.handler.js` | 4 |
| `backend/services/workflow/node-handlers/http-request.handler.js` | 4 |
| `backend/services/workflow/node-handlers/json-extractor.handler.js` | 4 |
| `backend/services/workflow/node-handlers/text-transform.handler.js` | 4 |
| `backend/services/workflow/node-handlers/loop-node.handler.js` | 4 |

### Existing files to modify

| File | Changes | Phase |
|---|---|---|
| `backend/server.js` | Mount `/settings` route | 1 |
| `frontend/src/pages/WorkflowListPage/WorkflowListPage.jsx` | Add Settings button + modal | 1 |
| `backend/services/workflow/node-handlers/index.js` | Register all new handlers | 2–4 |
| `frontend/src/components/Sidebar/Sidebar.jsx` | Add new node categories: "AI Models", "Flow Control", "Data & Utils", "Integrations" | 2–4 |
| `frontend/src/components/Node/Node.jsx` | Add renderContent cases + icons for each new node type | 2–4 |
| `backend/services/workflow/workflow.service.js` | Add branch-skip logic for condition node | 3 |
| `frontend/src/components/WorkflowCanvas/WorkflowCanvas.jsx` | Handle multi-port for condition node (getPortPosition) | 3 |
