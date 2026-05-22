# Workflow Management API Planning

Backend REST API for storing and managing workflows using **Lowdb** as a JSON file database.

---

## Data Model

### Workflow

```json
{
  "id": "string (UUID v4)",
  "name": "string (required, max 100 chars)",
  "description": "string (optional, max 500 chars)",
  "tags": ["string"],
  "thumbnail": "string (base64 data URL or null)",
  "nodes": [
    {
      "id": "string",
      "type": "string",
      "position": { "x": "number", "y": "number" },
      "data": { "label": "string", "...": "any" },
      "dimensions": { "width": "number", "height": "number" }
    }
  ],
  "edges": [
    {
      "id": "string",
      "source": "string (node ID)",
      "target": "string (node ID)"
    }
  ],
  "createdAt": "string (ISO 8601)",
  "updatedAt": "string (ISO 8601)"
}
```

### Database Schema (Lowdb)

File: `backend/data/db.json`

```json
{
  "workflows": []
}
```

---

## API Endpoints

Base path: `/workflows`

---

### 1. List All Workflows

```
GET /workflows
```

**Query Parameters:**

| Param    | Type   | Default | Description                                     |
|----------|--------|---------|-------------------------------------------------|
| `search` | string | —       | Search by name or description             |
| `tags`   | string | —       | Filter by tags (comma-separated, e.g. `ai,video`) |
| `sort`   | string | `updatedAt` | Sort by field (`name`, `createdAt`, `updatedAt`) |
| `order`  | string | `desc`  | Sort order (`asc` or `desc`)              |
| `page`   | number | `1`     | Current page                                   |
| `limit`  | number | `20`    | Number of items per page                         |

**Response: `200 OK`**

```json
{
  "data": [
    {
      "id": "uuid",
      "name": "My Workflow",
      "description": "A cool workflow",
      "tags": ["ai", "video"],
      "thumbnail": "data:image/png;base64,...",
      "nodeCount": 5,
      "edgeCount": 4,
      "createdAt": "2025-05-22T08:00:00.000Z",
      "updatedAt": "2025-05-22T10:30:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 42,
    "totalPages": 3
  }
}
```

> **Note:** List response does NOT return `nodes` and `edges` to reduce payload. Only returns `nodeCount` and `edgeCount`.

---

### 2. Get Workflow by ID

```
GET /workflows/:id
```

**Path Parameters:**

| Param | Type   | Description     |
|-------|--------|-----------------|
| `id`  | string | Workflow UUID   |

**Response: `200 OK`**

```json
{
  "id": "uuid",
  "name": "My Workflow",
  "description": "A cool workflow",
  "tags": ["ai", "video"],
  "thumbnail": "data:image/png;base64,...",
  "nodes": [...],
  "edges": [...],
  "createdAt": "2025-05-22T08:00:00.000Z",
  "updatedAt": "2025-05-22T10:30:00.000Z"
}
```

**Error: `404 Not Found`**

```json
{
  "error": "Workflow not found"
}
```

---

### 3. Create Workflow

```
POST /workflows
```

**Request Body:**

```json
{
  "name": "My Workflow",
  "description": "Optional description",
  "tags": ["ai", "video"],
  "thumbnail": "data:image/png;base64,... (optional)",
  "nodes": [...],
  "edges": [...]
}
```

**Validation:**

| Field         | Rule                              |
|---------------|-----------------------------------|
| `name`        | Required, 1–100 characters        |
| `nodes`       | Required, must be an array        |
| `edges`       | Required, must be an array        |
| `description` | Optional, max 500 characters      |
| `tags`        | Optional, array of strings        |
| `thumbnail`   | Optional, string                  |

**Response: `201 Created`**

```json
{
  "id": "generated-uuid",
  "name": "My Workflow",
  "description": "Optional description",
  "tags": ["ai", "video"],
  "thumbnail": "...",
  "nodes": [...],
  "edges": [...],
  "createdAt": "2025-05-22T08:00:00.000Z",
  "updatedAt": "2025-05-22T08:00:00.000Z"
}
```

**Error: `400 Bad Request`**

```json
{
  "error": "Validation failed",
  "details": [
    { "field": "name", "message": "Name is required" }
  ]
}
```

---

### 4. Update Workflow

```
PUT /workflows/:id
```

**Path Parameters:**

| Param | Type   | Description     |
|-------|--------|-----------------|
| `id`  | string | Workflow UUID   |

**Request Body (partial update supported):**

```json
{
  "name": "Updated Name",
  "description": "Updated desc",
  "tags": ["new-tag"],
  "thumbnail": "...",
  "nodes": [...],
  "edges": [...]
}
```

> Only sent fields will be updated. `updatedAt` will be automatically set.

**Response: `200 OK`**

```json
{
  "id": "uuid",
  "name": "Updated Name",
  "...": "..."
}
```

**Error: `404 Not Found`**

```json
{
  "error": "Workflow not found"
}
```

---

### 5. Delete Workflow

```
DELETE /workflows/:id
```

**Path Parameters:**

| Param | Type   | Description     |
|-------|--------|-----------------|
| `id`  | string | Workflow UUID   |

**Response: `200 OK`**

```json
{
  "message": "Workflow deleted successfully"
}
```

**Error: `404 Not Found`**

```json
{
  "error": "Workflow not found"
}
```

---

### 6. Duplicate Workflow

```
POST /workflows/:id/duplicate
```

**Path Parameters:**

| Param | Type   | Description                |
|-------|--------|----------------------------|
| `id`  | string | ID of the workflow to duplicate |

**Behavior:**
- Create a copy with name `"{original name} (Copy)"`
- Assign new UUID
- Reset `createdAt` and `updatedAt` to current timestamp
- Copy all `nodes`, `edges`, `tags`, `thumbnail`, `description`

**Response: `201 Created`**

```json
{
  "id": "new-uuid",
  "name": "My Workflow (Copy)",
  "...": "... (same as original)"
}
```

**Error: `404 Not Found`**

```json
{
  "error": "Workflow not found"
}
```

---

## Error Handling

All error responses have the following format:

```json
{
  "error": "Human-readable error message",
  "details": [] // optional, for validation errors
}
```

| Status Code | Usage                          |
|-------------|--------------------------------|
| `200`       | Success (GET, PUT, DELETE)      |
| `201`       | Created (POST)                 |
| `400`       | Validation error               |
| `404`       | Workflow not found              |
| `500`       | Internal server error           |

---

## Implementation Structure

```
backend/
├── data/
│   └── db.json                          # Lowdb database file
├── db/
│   └── index.js                         # Lowdb initialization
├── services/
│   └── workflow-management.service.js   # CRUD business logic
├── controllers/
│   └── workflow-management.controller.js
├── routes/
│   └── workflow-management.routes.js
└── server.js                            # Register new routes
```

---

## Tech Stack

- **Database:** Lowdb v7 (ESM-compatible JSON file database)
- **ID Generation:** uuid v4 (already in project dependencies)
- **Validation:** Custom middleware (follow existing pattern in `middleware/validate.js`)
