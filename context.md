## File Structure
```
power-clipper/
└── src
    ├── test
    │   └── extension.test.ts
    ├── binaryDetector.ts
    ├── cli.ts
    ├── core.ts
    ├── extension.ts
    ├── gitignoreHelper.ts
    └── languageExtensions.ts
```

### `src/binaryDetector.ts`

```typescript
import * as fs from 'fs';

export class BinaryDetector {
  private static readonly BUFFER_SIZE = 8192;  // 8KB
  private static readonly NULL_PERCENTAGE_THRESHOLD = 0.1;  // 10%
  private static readonly CONTROL_CHAR_THRESHOLD = 0.1;    // 10%

  private static readonly ALLOWED_CONTROL_CHARS = new Set([
    9,    // 탭
    10,   // LF (새줄)
    13,   // CR (캐리지 리턴)
    12    // FF (폼 피드)
  ]);

  private static mimeCache = new Map<string, boolean>();

  /**
   * 파일이 바이너리인지 검사
   */
  static isFileBinary(filePath: string): boolean {
    // 캐시된 결과 확인
    const cached = this.mimeCache.get(filePath);
    if (cached !== undefined) {
      return cached;
    }

    let result = false;

    try {
      // 파일의 처음 8KB를 읽어서 바이너리 여부 확인
      const fd = fs.openSync(filePath, 'r');
      const buffer = Buffer.alloc(this.BUFFER_SIZE);
      const bytesRead = fs.readSync(fd, buffer, 0, this.BUFFER_SIZE, 0);
      fs.closeSync(fd);

      // 실제로 읽은 부분만 검사
      const slice = buffer.slice(0, bytesRead);
      result = this.containsBinaryContent(slice);

      // 결과 캐시
      this.updateCache(filePath, result);
      
    } catch (error) {
      console.error(`Error checking binary content for ${filePath}:`, error);
      // 읽기 오류 발생 시 안전하게 바이너리로 처리
      result = true;
    }

    return result;
  }

  /**
   * 버퍼의 내용이 바이너리인지 검사
   */
  private static containsBinaryContent(buffer: Buffer): boolean {
    let nullCount = 0;
    let controlCount = 0;
    const totalBytes = buffer.length;

    for (let i = 0; i < totalBytes; i++) {
      const byte = buffer[i];
      
      // NULL 바이트 검사
      if (byte === 0) {
        nullCount++;
        if (nullCount / totalBytes > this.NULL_PERCENTAGE_THRESHOLD) {
          return true;
        }
      }
      
      // 허용되지 않는 제어 문자 검사
      if (byte < 32 && !this.ALLOWED_CONTROL_CHARS.has(byte)) {
        controlCount++;
        if (controlCount / totalBytes > this.CONTROL_CHAR_THRESHOLD) {
          return true;
        }
      }
      
      // UTF-8 이진수 체크 (잘못된 UTF-8 시퀀스)
      if ((byte & 0xF8) === 0xF8) {
        return true;
      }
    }

    return false;
  }

  /**
   * 캐시 업데이트 및 관리
   */
  private static updateCache(filePath: string, result: boolean): void {
    this.mimeCache.set(filePath, result);
    
    // 캐시 크기 제한 (1000개 초과시 200개 제거)
    if (this.mimeCache.size > 1000) {
      const keys = Array.from(this.mimeCache.keys());
      for (let i = 0; i < 200; i++) {
        this.mimeCache.delete(keys[i]);
      }
    }
  }

  /**
   * 캐시 초기화
   */
  static clearCache(): void {
    this.mimeCache.clear();
  }
}
```

### `src/cli.ts`

```typescript
#!/opt/homebrew/bin/node node
import * as fs from 'fs';
import * as path from 'path';
import { GitIgnoreHelper } from './gitignoreHelper';
import { 
  processFile, 
  getAllFilesRecursively, 
  generateOutput, 
  FileProcessingResult 
} from './core';

const args = process.argv.slice(2);
const cwd = process.cwd();

if (args.includes('--help') || args.includes('-h') || args.length === 0) {
  console.log(`
  Usage: node cli.js [path] [options]
  
  Options:
    --tree-only        Only output file structure
    --exclude <str>    Exclude paths containing string
  `);
  process.exit(0);
}

const copyContent = !args.includes('--tree-only');
const excludes: string[] = [];
let targetPath = cwd;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--exclude' && args[i+1]) {
    excludes.push(args[i+1]);
    i++;
  } else if (!args[i].startsWith('-')) {
    targetPath = path.resolve(cwd, args[i]);
  }
}

async function run() {
  const ignoreHelper = new GitIgnoreHelper(cwd);
  const processedFiles: FileProcessingResult[] = [];
  const processedPaths: string[] = [];
  
  const stats = fs.statSync(targetPath);
  
  if (stats.isDirectory()) {
    const children = getAllFilesRecursively(targetPath, ignoreHelper, excludes);
    for (const child of children) {
      if (copyContent) {
        const res = processFile(child, cwd);
        if (res) processedFiles.push(res);
      } else {
        processedPaths.push(child);
      }
    }
  } else {
    if (copyContent) {
      const res = processFile(targetPath, cwd);
      if (res) processedFiles.push(res);
    } else {
      processedPaths.push(targetPath);
    }
  }

  const pathsForTree = copyContent ? processedFiles.map(f => f.absolutePath) : processedPaths;
  console.log(generateOutput(processedFiles, pathsForTree, cwd, copyContent));
}

run().catch(console.error);
```

### `src/core.ts`

```typescript
import * as fs from 'fs';
import * as path from 'path';
import { getFileFormat } from './languageExtensions';
import { GitIgnoreHelper } from './gitignoreHelper';

export const MAX_FILE_SIZE = 3 * 1024 * 1024; // 3 MB

export interface FileProcessingResult {
  content: string;
  relativePath: string;
  absolutePath: string;
  language: string;
}

export interface FileTreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children: FileTreeNode[];
}

export function processFile(filePath: string, basePath: string): FileProcessingResult | null {
  try {
    const fileStats = fs.statSync(filePath);
    if (fileStats.size > MAX_FILE_SIZE) return null;

    const format = getFileFormat(filePath);
    if (!format) return null;

    const content = fs.readFileSync(filePath, "utf8");
    const relativePath = path.relative(basePath, filePath);
    
    return { 
      content, 
      relativePath, 
      absolutePath: filePath, 
      language: format 
    };
  } catch (error) {
    return null;
  }
}

export function getAllFilesRecursively(
  directoryPath: string, 
  ignoreHelper: GitIgnoreHelper | null,
  additionalExcludes: string[] = []
): string[] {
  let files: string[] = [];
  
  if (path.basename(directoryPath) === 'node_modules') return [];

  try {
    const items = fs.readdirSync(directoryPath);

    for (const item of items) {
      const fullPath = path.join(directoryPath, item);
      
      // 1. Check GitIgnore
      if (ignoreHelper && ignoreHelper.shouldIgnore(fullPath)) continue;

      // 2. Check Custom Excludes (simple substring match)
      const isExcluded = additionalExcludes.some(ex => fullPath.includes(ex));
      if (isExcluded) continue;

      const stats = fs.statSync(fullPath);

      if (stats.isDirectory()) {
        files = files.concat(getAllFilesRecursively(fullPath, ignoreHelper, additionalExcludes));
      } else if (stats.isFile()) {
        files.push(fullPath);
      }
    }
  } catch (err) {
    console.error(`Skipping ${directoryPath}: ${err}`);
  }

  return files;
}

export function formatContent(result: FileProcessingResult): string {
  const codeBlock = result.language === 'markdown' ? '``````' : '```';
  return `### \`${result.relativePath}\`\n\n${codeBlock}${result.language}\n${result.content}\n${codeBlock}\n\n`;
}

export function buildFileTree(filePaths: string[], basePath: string): FileTreeNode {
  const rootName = path.basename(basePath);
  const root: FileTreeNode = {
    name: rootName,
    path: '',
    isDirectory: true,
    children: []
  };

  for (const filePath of filePaths) {
    const relativePath = path.relative(basePath, filePath);
    const parts = relativePath.split(path.sep);
    let currentNode = root;
    let currentPath = '';

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      currentPath = currentPath ? path.join(currentPath, part) : part;
      const isLastPart = i === parts.length - 1;
      let existingChild = currentNode.children.find(child => child.name === part);

      if (!existingChild) {
        existingChild = {
          name: part,
          path: currentPath,
          isDirectory: !isLastPart,
          children: []
        };
        currentNode.children.push(existingChild);
      }
      currentNode = existingChild;
    }
  }
  return root;
}

export function generateTreeString(node: FileTreeNode, prefix: string = '', isLast: boolean = true): string {
  let result = '';
  // Skip root connector, start with children
  if (node.path !== '') {
    const connector = isLast ? '└── ' : '├── ';
    result += prefix + connector + node.name + '\n';
  }

  const childPrefix = node.path === '' ? prefix : prefix + (isLast ? '    ' : '│   ');
  const sortedChildren = [...node.children].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  sortedChildren.forEach((child, index) => {
    result += generateTreeString(child, childPrefix, index === sortedChildren.length - 1);
  });

  return result;
}

export function generateOutput(
  files: FileProcessingResult[], 
  treePaths: string[], 
  basePath: string, 
  includeContent: boolean
): string {
  let finalOutput = '';

  if (treePaths.length > 0) {
    const tree = buildFileTree(treePaths, basePath);
    const treeString = generateTreeString(tree);
    finalOutput += `## File Structure\n\`\`\`\n${tree.name}/\n${treeString}\`\`\`\n\n`;
  }

  if (includeContent) {
    for (const file of files) {
      finalOutput += formatContent(file);
    }
  }

  return finalOutput;
}
```

### `src/extension.ts`

```typescript
import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { GitIgnoreHelper } from "./gitignoreHelper";
import { 
  processFile, 
  getAllFilesRecursively, 
  generateOutput, 
  FileProcessingResult 
} from "./core";

async function getSelectedFiles(): Promise<vscode.Uri[]> {
  const activeTextEditor = vscode.window.activeTextEditor;
  if (activeTextEditor) {
    return [activeTextEditor.document.uri];
  }
  return [];
}

async function processSelections(
  uris: vscode.Uri[], 
  copyContent: boolean = true
): Promise<void> {
  const processedFiles: FileProcessingResult[] = [];
  const processedPaths: string[] = [];
  
  // Calculate common base path
  let commonBasePath = '';
  if (uris.length > 0) {
    const workspace = vscode.workspace.getWorkspaceFolder(uris[0]);
    commonBasePath = workspace ? workspace.uri.fsPath : path.dirname(uris[0].fsPath);
  }

  // Read User Settings
  const config = vscode.workspace.getConfiguration('powerClipper');
  const userExcludes = config.get<string[]>('alwaysExclude') || [];

  const ignoreHelpers = new Map<string, GitIgnoreHelper>();

  await vscode.window.withProgress({
    location: vscode.ProgressLocation.Notification,
    title: "Power Clipper: Processing...",
    cancellable: true
  }, async (progress, token) => {
    
    for (const uri of uris) {
      if (token.isCancellationRequested) break;

      const fsPath = uri.fsPath;
      const workspaceRoot = vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath;
      
      // Get or Create GitIgnore Helper
      let ignoreHelper: GitIgnoreHelper | null = null;
      if (workspaceRoot) {
        if (!ignoreHelpers.has(workspaceRoot)) {
          ignoreHelpers.set(workspaceRoot, new GitIgnoreHelper(workspaceRoot));
        }
        ignoreHelper = ignoreHelpers.get(workspaceRoot)!;
      }

      // Check root ignore
      if (ignoreHelper && ignoreHelper.shouldIgnore(fsPath)) continue;

      const stats = fs.statSync(fsPath);

      if (stats.isDirectory()) {
        const children = getAllFilesRecursively(fsPath, ignoreHelper, userExcludes);
        
        for (const childPath of children) {
          if (copyContent) {
            const result = processFile(childPath, workspaceRoot || commonBasePath);
            if (result) processedFiles.push(result);
          } else {
             processedPaths.push(childPath);
          }
        }
      } else {
        if (copyContent) {
          const result = processFile(fsPath, workspaceRoot || commonBasePath);
          if (result) processedFiles.push(result);
        } else {
          processedPaths.push(fsPath);
        }
      }
    }
  });

  // Generate Output
  const pathsForTree = copyContent 
    ? processedFiles.map(f => f.absolutePath) 
    : processedPaths;

  const finalOutput = generateOutput(processedFiles, pathsForTree, commonBasePath, copyContent);

  if (!finalOutput) {
    vscode.window.showWarningMessage("No files processed (check .gitignore or settings).");
    return;
  }

  await vscode.env.clipboard.writeText(finalOutput);
  
  const count = copyContent ? processedFiles.length : pathsForTree.length;
  vscode.window.showInformationMessage(`Power Clipper: Copied ${count} items!`);
}

export function activate(context: vscode.ExtensionContext) {
  
  let copyContentDisposable = vscode.commands.registerCommand(
    "power-clipper.copyFilesContent",
    async (uri?: vscode.Uri, uris?: vscode.Uri[]) => {
      const filesToProcess = uris && uris.length > 0 ? uris : (uri ? [uri] : await getSelectedFiles());
      if (!filesToProcess.length) return;
      await processSelections(filesToProcess, true);
    }
  );

  let copyTreeDisposable = vscode.commands.registerCommand(
    "power-clipper.copyFolderStructure",
    async (uri?: vscode.Uri, uris?: vscode.Uri[]) => {
      const filesToProcess = uris && uris.length > 0 ? uris : (uri ? [uri] : await getSelectedFiles());
      if (!filesToProcess.length) return;
      await processSelections(filesToProcess, false);
    }
  );

  context.subscriptions.push(copyContentDisposable, copyTreeDisposable);
}

export function deactivate() {}
```

### `src/gitignoreHelper.ts`

```typescript
import * as fs from 'fs';
import * as path from 'path';
import ignore, { Ignore } from 'ignore';
import * as vscode from 'vscode';

export class GitIgnoreHelper {
  private ig: Ignore;
  private workspaceRoot: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
    this.ig = ignore();
    this.loadGitIgnore();
  }

  private loadGitIgnore() {
    const gitIgnorePath = path.join(this.workspaceRoot, '.gitignore');
    if (fs.existsSync(gitIgnorePath)) {
      try {
        const content = fs.readFileSync(gitIgnorePath, 'utf8');
        this.ig.add(content);
      } catch (e) {
        console.error('Failed to load .gitignore', e);
      }
    }
    
    // Always ignore .git folder and common massive directories even if not in gitignore
    // to prevent freezing VS Code if .gitignore is missing
    this.ig.add(['.git', '.DS_Store']); 
  }

  public shouldIgnore(filePath: string): boolean {
    // ignore package expects relative paths
    const relativePath = path.relative(this.workspaceRoot, filePath);
    
    // If relative path starts with '..', it's outside the workspace
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      return false; 
    }

    // Check if it's empty (root)
    if (!relativePath) return false;

    return this.ig.ignores(relativePath);
  }
}
```

### `src/languageExtensions.ts`

```typescript
import * as mime from "mime-types";
import * as path from "path";
import { BinaryDetector } from './binaryDetector';

// 언어별 확장자와 MIME 타입 매핑
interface LanguageConfig {
  extensions: string[];
  mimeTypes: string[];
}

interface LanguageExtensionsType {
  [key: string]: LanguageConfig;
}

// 알려진 텍스트 기반 파일 형식 정의
export const languageExtensions: LanguageExtensionsType = {
  typescript: {
    extensions: ['.ts', '.tsx'],
    mimeTypes: ['application/typescript', 'text/typescript']
  },
  javascript: {
    extensions: ['.js', '.jsx', '.mjs'],
    mimeTypes: ['application/javascript', 'text/javascript', 'application/x-javascript', 'application/ecmascript']
  },
  python: {
    extensions: ['.py', '.pyw', '.pyi'],
    mimeTypes: ['text/x-python', 'application/x-python']
  },
  java: {
    extensions: ['.java'],
    mimeTypes: ['text/x-java-source', 'application/x-java']
  },
  cpp: {
    extensions: ['.cpp', '.cc', '.cxx', '.hpp', '.h', '.c'],
    mimeTypes: ['text/x-c', 'text/x-c++']
  },
  csharp: {
    extensions: ['.cs'],
    mimeTypes: ['text/x-csharp']
  },
  go: {
    extensions: ['.go'],
    mimeTypes: ['text/x-go']
  },
  rust: {
    extensions: ['.rs'],
    mimeTypes: ['text/x-rust']
  },
  ruby: {
    extensions: ['.rb', '.rake', '.gemspec'],
    mimeTypes: ['text/x-ruby', 'application/x-ruby']
  },
  php: {
    extensions: ['.php', '.phtml', '.php3', '.php4', '.php5', '.phps'],
    mimeTypes: ['application/x-httpd-php', 'text/x-php']
  },
  swift: {
    extensions: ['.swift'],
    mimeTypes: ['text/x-swift']
  },
  kotlin: {
    extensions: ['.kt', '.kts'],
    mimeTypes: ['text/x-kotlin']
  },
  html: {
    extensions: ['.html', '.htm', '.xhtml'],
    mimeTypes: ['text/html', 'application/xhtml+xml']
  },
  css: {
    extensions: ['.css'],
    mimeTypes: ['text/css']
  },
  scss: {
    extensions: ['.scss'],
    mimeTypes: ['text/x-scss']
  },
  less: {
    extensions: ['.less'],
    mimeTypes: ['text/x-less']
  },
  xml: {
    extensions: ['.xml', '.xsd', '.xsl', '.xslt'],
    mimeTypes: ['text/xml', 'application/xml']
  },
  json: {
    extensions: ['.json'],
    mimeTypes: ['application/json']
  },
  yaml: {
    extensions: ['.yml', '.yaml'],
    mimeTypes: ['text/yaml', 'application/x-yaml', 'application/yaml']
  },
  markdown: {
    extensions: ['.md', '.markdown', '.mdown'],
    mimeTypes: ['text/markdown']
  },
  shell: {
    extensions: ['.sh', '.bash', '.zsh', '.fish'],
    mimeTypes: ['text/x-shellscript', 'application/x-sh']
  },
  sql: {
    extensions: ['.sql'],
    mimeTypes: ['text/x-sql', 'application/x-sql']
  },
  graphql: {
    extensions: ['.graphql', '.gql'],
    mimeTypes: ['application/graphql']
  },
  dockerfile: {
    extensions: ['dockerfile', '.dockerfile'],
    mimeTypes: ['text/x-dockerfile']
  },
  plaintext: {
    extensions: ['.txt', '.text'],
    mimeTypes: ['text/plain']
  }
};

// 명시적으로 제외할 파일 패턴
const EXCLUDED_PATTERNS = [
  /\.DS_Store/,
  /Thumbs\.db/
];

/**
 * 파일이 클립보드에 복사 가능한 텍스트 파일인지 확인하고 해당 언어/형식을 반환
 */
export function getFileFormat(filePath: string): string | null {
  // 1. 제외 패턴 체크
  if (isExcludedFile(filePath)) {
    return null;
  }

  const extension = path.extname(filePath).toLowerCase();

  // 2. 알려진 언어 확장자 체크
  const knownLanguage = getLanguageFromExtension(extension);
  if (knownLanguage) {
    return knownLanguage;
  }

  // 3. MIME 타입으로 텍스트 파일 여부 확인
  const mimeType = mime.lookup(filePath);
  if (mimeType) {
    // text/* 타입이거나 알려진 텍스트 기반 MIME 타입인 경우
    if (mimeType.startsWith('text/') || isTextMimeType(mimeType)) {
      // 확장자를 그대로 사용 (.은 제외)
      return extension.startsWith('.') ? extension.slice(1) : extension;
    }
  }

  // 4. 알 수 없는 형식의 경우 바이너리 검사
  if (!BinaryDetector.isFileBinary(filePath)) {
    // 바이너리가 아닌 경우 확장자를 형식으로 사용
    return extension.startsWith('.') ? extension.slice(1) : extension;
  }

  // 클립보드에 복사할 수 없는 파일
  return null;
}

/**
 * 알려진 언어 확장자에서 언어 찾기
 */
function getLanguageFromExtension(extension: string): string | null {
  for (const [language, config] of Object.entries(languageExtensions)) {
    if (config.extensions.includes(extension.toLowerCase())) {
      return language;
    }
  }
  return null;
}

/**
 * 알려진 텍스트 기반 MIME 타입인지 확인
 */
function isTextMimeType(mimeType: string): boolean {
  // application/json, application/xml 등 텍스트 기반 application 타입들
  const textBasedApplicationTypes = [
    'application/json',
    'application/xml',
    'application/javascript',
    'application/typescript',
    'application/x-yaml',
    'application/graphql'
  ];

  return textBasedApplicationTypes.includes(mimeType) ||
         Object.values(languageExtensions)
           .some(config => config.mimeTypes.includes(mimeType));
}

/**
 * 제외 패턴에 해당하는지 확인
 */
function isExcludedFile(filePath: string): boolean {
  return EXCLUDED_PATTERNS.some(pattern => pattern.test(filePath));
}
```

### `src/test/extension.test.ts`

```typescript
import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
// import * as myExtension from '../../extension';

suite('Extension Test Suite', () => {
	vscode.window.showInformationMessage('Start all tests.');

	test('Sample test', () => {
		assert.strictEqual(-1, [1, 2, 3].indexOf(5));
		assert.strictEqual(-1, [1, 2, 3].indexOf(0));
	});
});

```


