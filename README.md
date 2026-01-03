# Power Clipper

A dual-mode tool (VS Code Extension + CLI) to copy file contents and directory structures into your clipboard, optimized for LLM prompting.

## Extension

### Features

- **Smart Selection**: Right-click any file or folder in the VS Code Explorer.
- **Context Aware**: Respects `.gitignore` automatically.
- **Dual Modes**:
  - **Copy Content & Path**: Copies the tree structure + full file contents.
  - **Copy Tree Only**: Copies just the directory structure.
- **Size Protection**: Automatically skips files larger than 3MB to prevent clipboard freezes.
- **Smart Defaults**: Automatically ignores `node_modules` folders and `.DS_Store` files to keep context clean.
- **File Tree Generation**: Generates a clean ASCII tree structure for multiple file selections.
- **Templating Engine**: Fully customizable output formats with support for variables like `{{repoPath}}`, `{{absolutePath}}`, and `{{content}}`.

### Configuration

Customize the output format in VS Code Settings (`Cmd+,` -> Search "Power Clipper"):

| Setting | Description | Default |
| :--- | :--- | :--- |
| `powerClipper.fileTemplate` | Template for file contents. Vars: `{{fileName}}`, `{{repoPath}}`, `{{relativePath}}`, `{{absolutePath}}`, `{{content}}`, `{{language}}` | `### \`{{relativePath}}\`\n\n\`\`\`{{language}}\n{{content}}\n\`\`\`\n\n` |
| `powerClipper.treeTemplate` | Template for the folder tree. Var: `{{tree}}` | `## File Structure\n\`\`\`\n{{tree}}\n\`\`\`\n\n` |
| `powerClipper.structureFormat`| Determines the root of the generated tree. Options: `repo` (starts at git root), `relative` (starts at selection), `absolute` (full system path). | `repo` |
| `powerClipper.useGitIgnore` | Whether to respect the project's .gitignore file. | `true` |
| `powerClipper.alwaysExclude` | List of glob patterns to always ignore (e.g. `**/secrets/**`) | `[]` |
| `powerClipper.alwaysInclude` | List of glob patterns to always include, overriding gitignore (e.g. `.env`) | `[]` |

### Keybindings

You can customize these shortcuts in VS Code's Keyboard Shortcuts editor (`Cmd+K Cmd+S` on Mac, `Ctrl+K Ctrl+S` on Windows/Linux) by searching for "Power Clipper".

| Command ID | Mac Default | Win/Linux Default | Action |
| :--- | :--- | :--- | :--- |
| `power-clipper.copyFilesContent` | `Cmd+Shift+C` | `Ctrl+Shift+C` | Copy content & structure of selection |
| `power-clipper.copyFolderStructure` | `Cmd+Shift+T` | `Ctrl+Shift+T` | Copy directory tree only |

---

## CLI (`pclip`)

A standalone tool for your terminal.

### Installation

```bash
brew install power-clipper
```

or via npm:

```bash
npm install -g power-clipper
```

### Usage

```bash
pclip [options] <path(s)>
```

### Examples

```bash
pclip ./src ./tests          # Copy multiple paths to clipboard
pclip ./src --print          # Print to console instead of copying
pclip . --structure absolute # Generate tree starting from absolute path
pclip . --tree-only          # Copy only the folder structure
pclip . --include ".env"     # Force include ignored files
pclip . --no-gitignore       # Copy everything, ignoring .gitignore rules
```

### Flags

- `--tree-only`: Output structure only.
- `--print`: Output to stdout (useful for piping).
- `--no-gitignore`: Do not respect `.gitignore` rules.
- `--structure <type>`: Set the root of the tree visualization. Options: `repo` (default), `relative`, `absolute`.
- `--exclude <pattern>`: Add exclusion rule.
- `--include <pattern>`: Force include a file/folder.
- `--file-template <string>`: Override file format. Vars: `{{fileName}}`, `{{repoPath}}`, `{{relativePath}}`, `{{absolutePath}}`, `{{content}}`.
- `--tree-template <string>`: Override tree format. Var: `{{tree}}`.

## Development Setup

- Clone the repository

```bash
git clone https://github.com/alexjmiller5/power-clipper.git
cd power-clipper
```

- Install dependencies

```bash
npm install
```

- Compile the TypeScript code

```bash
npm run compile
```

- Install the VS Code packaging tool globally

```bash
brew install vsce
```

- Package the extension and install it in VS Code

```bash
vsce package
code --install-extension power-clipper-1.0.0.vsix
```

## TODO

- [x] Add support for globs in the include/exclude setting patterns
- [ ] Add logs for skipped files in extension same as CLI
- [ ] Figure out how licensing works - because I forked this, can I post it on homebrew / vscode under my own name?
- [ ] Get some beta testers to try it out and give feedback before I launch - do a Google Form but also allow them to give me feedback directly
- [ ] add line numbers as a toggle switch if you want to give that to ai too
- [ ] add a count of how many lines are characters were copied in addition to number of files (include a recommendation / reminder of how many tokens / characters is good for different LLMs - or just learn the token count for the LLMs I use myself)
- [ ] Make a setting for if you want the entire project tree copied with all files or just the strucutre that includes the selected files
- [ ] Make a settings for having the project tree appended to the copied content or not (idk if i necesarily always want the tree to be copied along with the content)
- [ ] Make the exclude pattern for the cli align better with the vscode settings - maybe it'll be able to read the vscode settings file directly? Or maybe it'll have its own config file? Not sure, have to do more user exploration to determine this
- [ ] The file structure seems to copy the outer folder an extra time as a non existent file at the root level - need to fix that
- [ ] Instead of hardcoding the node_modules and other common exclusions, just include them as default settings that can be overridden by the user if they like - this will also give the user more clartiy on how to use the extension
- [ ] Make the CLI looks for the exclusions in the vscode settings file if it exists in the project - this will help keep the cli and extension behavior more aligned
