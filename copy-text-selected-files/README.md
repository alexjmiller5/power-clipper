# Copy Text of Selected Files

<img src="https://raw.githubusercontent.com/iyulab/public/main/images/screenshot.png" width="430" />

This Visual Studio Code extension enables users to directly copy the contents of selected files to the clipboard.
This command can save the selected files to the clipboard as markdown consisting of a header and codeblock.
This is useful for easy pasting into GPT and querying them.

## Features

- **Copy Single File**: Right-click a file in the Explorer panel and choose "Copy Content of Selected Files" to copy its contents to the clipboard.
- **Copy Multiple Files**: Select multiple files (Ctrl+click), right-click on one, and select "Copy Content of Selected Files" to copy their contents. When multiple files are selected, a file structure tree is automatically included at the top.
- **Copy Directory Contents**: Right-click on a directory and choose "Copy Content of Selected Files" to copy the contents of all files within, including subdirectories. Hidden files and common build directories (node_modules, out, dist, build) are automatically excluded.

## Usage

### Basic Usage
1. In Visual Studio Code, go to the Explorer view
2. Select one or more files or a directory:
   - **Single file**: Click on a file
   - **Multiple files**: Hold Ctrl and click on multiple files
   - **Directory**: Click on a folder
3. Right-click and select "Copy Content of Selected Files"
4. The content is now copied to your clipboard

### Smart Features
- **File Structure**: Automatically generates a tree structure for multiple files
- **File Filtering**: Supports 16+ programming languages and intelligently detects text files
- **Size Limit**: Files larger than 3MB are automatically skipped with a warning
- **Directory Filtering**: Excludes hidden files and common build directories (node_modules, out, dist, build)
- **Progress Feedback**: Shows the number of files processed ("5 files copied to clipboard!")

## Examples

### Single File
When selecting a single file, only the file content is copied:

````
### `index.html`

```html
<!DOCTYPE html>
<html lang="en">
<body>
<h1>hello world</h1>
</body>
</html>
```
````

### Multiple Files or Directory
When selecting multiple files or a directory, a file structure is automatically included:

````
## File Structure
```
my-project/
├── index.html
├── src/
│   ├── global.scss
│   ├── components/
│   │   ├── header.vue
│   │   └── footer.vue
│   └── utils/
│       └── helpers.js
└── package.json
```

### `index.html`

```html
<!DOCTYPE html>
<html lang="en">
<body>
<h1>hello world</h1>
</body>
</html>
```

### `src/global.scss`

```scss
body {
  font-family: Arial, sans-serif;
  margin: 0;
  padding: 0;
  background-color: #f4f4f4;
}
```

### `src/components/header.vue`

```vue
<template>
  <header>Header Component</header>
</template>
```

### `src/components/footer.vue`

```vue
<template>
  <footer>Footer Component</footer>
</template>
```

### `src/utils/helpers.js`

```javascript
export function formatDate(date) {
  return date.toISOString().split('T')[0];
}
```

### `package.json`

```json
{
  "name": "my-project",
  "version": "1.0.0"
}
```
````

## Keyboard Shortcuts

- **Copy Content of Selected Files**: `Ctrl+Alt+C`
  - Works with any selection in the Explorer view (single file, multiple files, or directories)
  - You can customize this shortcut in VS Code: File > Preferences > Keyboard Shortcuts, then search for "Copy Content of Selected Files"

## Supported File Types

The extension intelligently detects and processes text-based files:

- **Programming Languages**: TypeScript, JavaScript, Python, Java, C/C++, C#, Go, Rust, Ruby, PHP, Swift, Kotlin
- **Web Technologies**: HTML, CSS, SCSS, Less
- **Data Formats**: JSON, YAML, XML, GraphQL
- **Documentation**: Markdown, Plain Text
- **Scripts**: Shell scripts, SQL, Dockerfile
- **Binary Detection**: Automatically skips binary files using smart content analysis

## Installation

1. Open Visual Studio Code.
2. Press `Ctrl+P` to open the Quick Open dialog.
3. Type `ext install copy-text-selected-files` and search for the extension.
4. Click on Install and then on Enable.
