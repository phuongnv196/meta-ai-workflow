# Workflow Management Frontend Planning

Detailed plan to implement the Workflow Management feature on the frontend React app.

---

## 1. Routing Setup

Add `react-router-dom` to support multi-page navigation.

| Route | Component | Description |
|-------|-----------|-------------|
| `/` | `WorkflowListPage` | Home page - list of all saved workflows |
| `/canvas` | `CanvasPage` | Empty canvas (create new workflow) |
| `/canvas/:id` | `CanvasPage` | Canvas loads workflow from DB by ID |

### File Changes

- **`src/main.jsx`** — Wrap `<App />` with `<BrowserRouter>`
- **`src/App.jsx`** — Replace hardcoded layout with `<Routes>` + `<Route>` definitions

---

## 2. Pages

### 2.1 Workflow List Page (`/`)

**File:** `src/pages/WorkflowListPage/WorkflowListPage.jsx`

**Layout:**
```
┌─────────────────────────────────────────────────┐
│  Header: "Vibes AI Flow" + [+ New Workflow] btn  │
├─────────────────────────────────────────────────┤
│  Search bar  |  Tag filter pills  |  Sort dropdown │
├─────────────────────────────────────────────────┤
│  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐        │
│  │ Card │  │ Card │  │ Card │  │ Card │        │
│  │      │  │      │  │      │  │      │        │
│  └──────┘  └──────┘  └──────┘  └──────┘        │
│  ┌──────┐  ┌──────┐  ┌──────┐                  │
│  │ Card │  │ Card │  │ Card │                  │
│  └──────┘  └──────┘  └──────┘                  │
├─────────────────────────────────────────────────┤
│  Pagination                                      │
└─────────────────────────────────────────────────┘
```

**Features:**
- Grid layout displaying workflow cards
- Search bar to search by name/description
- Tag filter (pills, clickable)
- Sort by: Updated (default), Created, Name
- Pagination
- Empty state when no workflows exist

### 2.2 Workflow Card Component

**File:** `src/components/WorkflowCard/WorkflowCard.jsx`

**Display:**
- Thumbnail (or placeholder gradient if none)
- Workflow name
- Description (truncated, 2 lines)
- Tags (pills, max 3 displayed + "+N more")
- Node count & Edge count
- Updated time (relative, e.g. "2 hours ago")
- Action menu (⋯): Edit, Duplicate, Delete

**Interactions:**
- Click card → Navigate to `/canvas/:id`
- Click Duplicate → Call duplicate API, refresh list
- Click Delete → Confirm dialog → Call delete API, refresh list

### 2.3 Canvas Page (`/canvas` and `/canvas/:id`)

**File:** `src/pages/CanvasPage/CanvasPage.jsx`

**Contains current layout:**
- `<Sidebar />`
- `<WorkflowCanvas />`
- `<Console />`

**Changes from current:**
- If `:id` param exists → load workflow from API on mount
- Add **← Back** button to return to list

---

## 3. Canvas Toolbar Changes

Add buttons to `WorkflowCanvas` toolbar:

| Button | Icon | Action |
|--------|------|--------|
| **Save** | `Save` | If workflow has ID → PUT update. If not → open Save Dialog |
| **Save As** | `SaveAll` | Always open Save Dialog (create new) |
| **← Back** | `ArrowLeft` | Navigate to `/` |

### Save Dialog (Modal)

**Fields:**
- Name (text input, required)
- Description (textarea, optional)
- Tags (tag input, can add/remove)
- Auto-generate thumbnail from canvas (canvas snapshot)

---

## 4. New Components

```
src/
├── pages/
│   ├── WorkflowListPage/
│   │   ├── WorkflowListPage.jsx
│   │   └── WorkflowListPage.scss
│   └── CanvasPage/
│       ├── CanvasPage.jsx
│       └── CanvasPage.scss
├── components/
│   ├── WorkflowCard/
│   │   ├── WorkflowCard.jsx
│   │   └── WorkflowCard.scss
│   ├── SaveWorkflowDialog/
│   │   ├── SaveWorkflowDialog.jsx
│   │   └── SaveWorkflowDialog.scss
│   ├── TagInput/
│   │   ├── TagInput.jsx
│   │   └── TagInput.scss
│   └── ConfirmDialog/
│       ├── ConfirmDialog.jsx
│       └── ConfirmDialog.scss
```

---

## 5. State Management (Zustand)

### New Store: `useWorkflowListStore.js`

```js
{
  // State
  workflows: [],           // List of workflow summaries
  isLoading: false,
  error: null,
  search: '',
  selectedTags: [],
  sortBy: 'updatedAt',
  sortOrder: 'desc',
  page: 1,
  totalPages: 1,

  // Actions
  fetchWorkflows(),        // GET /workflows with filters
  deleteWorkflow(id),      // DELETE /workflows/:id
  duplicateWorkflow(id),   // POST /workflows/:id/duplicate
  setSearch(text),
  setSelectedTags(tags),
  setSortBy(field),
  setPage(page),
}
```

### Extend existing `useWorkflowStore.js`

Add the following fields and actions:

```js
{
  // New state
  workflowId: null,        // ID of current workflow (null = not saved)
  workflowName: '',
  workflowDescription: '',
  workflowTags: [],
  isSaving: false,
  isDirty: false,          // true when there are unsaved changes

  // New actions
  loadWorkflow(id),        // GET /workflows/:id → set nodes, edges, metadata
  saveWorkflow(),          // POST or PUT depending on workflowId
  saveWorkflowAs(meta),    // Always POST (create new)
  resetWorkflow(),         // Clear canvas for new workflow
  setWorkflowMeta(meta),   // Update name/description/tags
  markDirty(),             // Set isDirty = true
}
```

> **Important:** Current actions that change nodes/edges (`addNode`, `removeNode`, `addEdge`, `removeEdge`, `updateNodeData`, `updateNodePosition`) need to call `markDirty()` to track unsaved changes.

---

## 6. API Client

**File:** `src/api/workflow-api.js`

```js
const API_BASE = config.API_BASE_URL;

export const workflowApi = {
  list(params)          // GET /workflows?search=...&tags=...
  getById(id)           // GET /workflows/:id
  create(data)          // POST /workflows
  update(id, data)      // PUT /workflows/:id
  delete(id)            // DELETE /workflows/:id
  duplicate(id)         // POST /workflows/:id/duplicate
};
```

---

## 7. UX Considerations

- **Unsaved changes warning:** When navigating away from canvas with `isDirty = true` → show confirm dialog
- **Auto-save (optional/future):** Can add auto-save every 30s if `isDirty`
- **Loading states:** Skeleton cards when fetching list, spinner when saving
- **Optimistic UI:** When delete → remove card immediately, rollback if API fails
- **Responsive grid:** Cards adjust 1-4 columns based on viewport width
- **Keyboard shortcuts:**
  - `Ctrl+S` → Save workflow
  - `Ctrl+Shift+S` → Save As

---

## 8. Implementation Order

1. Install `react-router-dom`
2. Setup routing in `App.jsx` + `main.jsx`
3. Create `CanvasPage` (wrap current layout)
4. Create `workflow-api.js` client
5. Create `useWorkflowListStore`
6. Create `WorkflowCard` component
7. Create `WorkflowListPage`
8. Extend `useWorkflowStore` with save/load
9. Create `SaveWorkflowDialog`
10. Add Save/Back buttons to canvas toolbar
11. Add unsaved changes warning
12. Styling & polish

---

## 9. Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `react-router-dom` | `^7.x` | Client-side routing |

> No new UI library needed — use custom SCSS following current pattern.
