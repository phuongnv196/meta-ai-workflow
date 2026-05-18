# Vibes AI Flow

A visual workflow engine integrated with Meta AI — drag-and-drop nodes, connect edges, click Run, and watch streaming results in real-time.

## 🚀 Features

- **Visual Workflow Canvas** — Drag-and-drop nodes, zoom/pan, and connect edges using your mouse.
- **Meta AI Chat** — Chat with Meta AI (text + attachments) using the DGW WebSocket protocol.
- **Imagine (Image)** — Generate high-quality images from prompts, automatically downloading & re-uploading references.
- **Imagine (Video)** — Generate videos from images and prompts, automatically resolving FBID to CDN URL.
- **Extract Frame** — Extract specific frames from video (start, end, or custom timestamp) using FFmpeg.
- **Merge Videos** — Sequentially merge multiple videos from left to right on the canvas.
- **Track Resolver** — Retrieve detailed music metadata (audio URL, cover art, artist) from Meta AI.
- **Reference System** — Reference the output of previous nodes directly in prompts using `@reference_01` syntax.
- **Step-by-Step Execution** — Execute the entire workflow, step-by-step, or run individual nodes independently.
- **SSE Streaming** — Real-time execution logs and progress streamed directly to the frontend via Server-Sent Events.

## 🛠 Project Structure

```
vibes/
├── frontend/                    # React + Vite + Zustand
│   ├── src/
│   │   ├── components/          # Canvas, Node, Sidebar, Console, ErrorBoundary
│   │   ├── store/               # useWorkflowStore (Zustand state management)
│   │   ├── utils/               # SSE client
│   │   ├── config.js            # API_BASE_URL config
│   │   └── constants.js         # Shared constants
│   └── package.json
│
├── backend/                     # Express 5 + WebSocket + SSE
│   ├── config/env.js            # Centralized environment validation
│   ├── controllers/             # Slim controllers (execute, upload)
│   ├── middleware/              # Validation, error handler
│   ├── routes/                  # Express routes
│   ├── services/
│   │   ├── meta_ai/             # DGW client, protobuf builders, uploader, resolvers
│   │   ├── workflow/            # Workflow orchestrator & node executors
│   │   ├── ffmpeg.service.js    # Secure FFmpeg wrappers
│   │   └── temp-file.service.js # Temporary file lifecycle manager
│   ├── utils/                   # Logger, custom error classes
│   ├── server.js                # App entry point
│   └── package.json
│
├── package.json                 # pnpm workspace root
└── README.md
```

## ⚙️ Installation & Configuration

### Prerequisites

- **Node.js** >= 18
- **pnpm** (recommended) or npm
- **FFmpeg** & **FFprobe** — must be installed and added to your system `PATH` (required for Extract Frame and Merge Videos)

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Configure Environment Variables

Copy the template environment file and populate it:

```bash
cp backend/.env.example backend/.env
```

`.env` File Contents:

```env
PORT=3001
HOST=localhost
ALLOWED_ORIGINS=http://localhost:5173

META_AUTH_TOKEN=<obtain from Authorization Header on meta.ai>
META_COOKIE=<obtain from Cookie Header on meta.ai>
```

> [!NOTE]
> The `.env` file is included in `.gitignore` — never commit your secrets.

### 3. Run the Development Server

```bash
pnpm dev
```

This runs both services concurrently:
- **Frontend** — `http://localhost:5173` (or port auto-selected by Vite)
- **Backend** — `http://localhost:3001` (Express API)

## 📖 How to Use

1. Open `http://localhost:5173` (or the dynamic port printed in the console) in your web browser.
2. Drag-and-drop nodes from the sidebar onto the canvas (or simply click them to spawn them).
3. Connect nodes by dragging a line from an output port (right side) to an input port (left side).
4. Enter your prompt, upload asset images, and configure parameters for each node.
5. Click **Run Workflow** to execute the entire graph, or click **Execute Step** to step through.
6. Monitor the real-time execution logs and stream outputs in the Console panel at the bottom.

### Supported Nodes

| Node | Description |
|---|---|
| **Text Prompt** | Input raw text prompts |
| **Attachments** | Upload reference images to Meta AI |
| **Meta AI Chat** | Connects to Meta AI (text + attachments) |
| **Imagine (Image)** | Generates sleek images from text prompts |
| **Imagine (Video)** | Generates video from images + prompts |
| **Extract Frame** | Extracts a specific frame from a video (FFmpeg) |
| **Merge Videos** | Merges multiple videos sequentially |
| **Track Resolver** | Resolves music metadata and URLs from Meta AI |

## 📡 API Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/execute` | Run workflow and receive a Server-Sent Events (SSE) stream |
| `POST` | `/upload` | Upload file (base64) to Meta AI |
| `GET` | `/health` | Server health check |

## 📝 Important Notes

- **FFmpeg**: Ensure FFmpeg is correctly installed to use the Video Extraction and Merging nodes. Get it at [ffmpeg.org](https://ffmpeg.org/download.html).
- **Meta AI Token**: The token and cookies expire relative to your active browser session. Be sure to renew them in your `.env` when requests start returning unauthorized errors.
- **CORS**: The backend will reject requests from hosts not defined inside `ALLOWED_ORIGINS`.
- **Temp Files**: Temporary media fragments are automatically cleaned up from the server storage after the workflow runs.
