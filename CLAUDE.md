# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Power Clipper is a VS Code extension + CLI tool (`pclip`) that copies file contents and directory trees to the clipboard in markdown format, designed for pasting into LLM prompts. It supports multi-file selection, gitignore-aware filtering, binary file detection, and customizable output templates.

## Build & Development Commands

```bash
npm run compile        # Compile TypeScript to /out
npm run watch          # Watch mode for development
npm test               # Run tests via @vscode/test-cli
npx eslint .           # Lint the codebase
npm run vscode:prepublish  # Pre-publish build (same as compile)
```

To test the extension in VS Code: press F5 in the repo to launch the Extension Development Host.

## Architecture

**Dual-mode design**: A shared core library (`src/core.ts`) powers both the VS Code extension and CLI.

```
src/extension.ts       → VS Code entry point (activate/deactivate, command registration)
src/cli.ts             → CLI entry point (#!/usr/bin/env node, argument parsing)
src/core.ts            → Shared logic: file processing, tree generation, template formatting
src/gitignoreHelper.ts → GitIgnoreHelper class for .gitignore parsing/filtering
src/languageExtensions.ts → Language detection by extension + MIME type lookup
src/binaryDetector.ts  → Binary file detection with LRU cache (static BinaryDetector class)
```

**Data flow**: User selection (extension) or CLI args → path resolution → exclusion filtering (gitignore + user patterns) → file processing (binary check → language detection → content read) → output generation (tree + content via templates) → clipboard or stdout.

**Key constants in core.ts**:
- `MAX_FILE_SIZE`: 3 MB limit per file
- `DEFAULT_FILE_TEMPLATE` / `DEFAULT_TREE_TEMPLATE`: Template strings with `{{variable}}` interpolation
- `StructureFormat`: `'repo' | 'relative' | 'absolute'` for path display

**Key interfaces in core.ts**: `PathDetails`, `FileProcessingResult`, `FileTreeNode`.

## Extension Configuration

Six user-facing settings under `powerClipper.*` in package.json `contributes.configuration`:
- `fileTemplate`, `treeTemplate` — output templates with `{{}}` variables
- `useGitIgnore`, `alwaysExclude`, `alwaysInclude` — filtering controls
- `structureFormat` — path format selection

## Conventions

- ESLint flat config (`eslint.config.js`) enforces camelCase/PascalCase naming, curly braces, strict equality, no throw literals
- TypeScript targets ES2022 with Node16 module resolution
- No test files exist yet — tests use Mocha via `@vscode/test-cli` and `@vscode/test-electron`
