---
name: pnpm-migration
description: 'Step-by-step workflow for migrating a project from npm or yarn to pnpm. Use when the user asks to switch package managers, convert to pnpm, or move to pnpm workspaces.'
---

# PNPM Migration Workflow

## When to Use
- Converting an existing project that uses `npm` or `yarn` to use `pnpm`.
- Setting up a monorepo or workspace using `pnpm`.
- Cleaning up old `node_modules` and lockfiles to start fresh with `pnpm`.

## Procedure
Follow these steps to migrate the project to `pnpm`:

### 1. Clean Up Old Artifacts
- Find and delete all existing `node_modules` directories across the project (root, frontend, backend, etc.).
- Delete old lockfiles: `package-lock.json` and/or `yarn.lock`.

### 2. Configure Workspaces (If Applicable)
- If the project has multiple sub-directories with their own `package.json` (e.g., `frontend/`, `backend/`), create a `pnpm-workspace.yaml` in the root directory.
- Define the workspace packages in `pnpm-workspace.yaml`. Example:
  ```yaml
  packages:
    - 'frontend'
    - 'backend'
  ```

### 3. Update package.json Scripts
- Review all `package.json` files for scripts that explicitly call `npm run ...` or `yarn ...`.
- Replace them with `pnpm run ...` or `pnpm ...`.

### 4. Install Dependencies
- Run `pnpm install` in the root directory to generate the new `pnpm-lock.yaml` and install all dependencies.
- Verify that the installation completes successfully and the new lockfile is created.

### 5. Verify and Test
- Run the project's build and development scripts to ensure everything works correctly with `pnpm`.
