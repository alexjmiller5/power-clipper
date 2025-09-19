import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { getFileFormat } from "./languageExtensions";

const MAX_FILE_SIZE = 3 * 1024 * 1024; // 3 MB

interface FileProcessingResult {
  content: string;
  relativePath: string;
  language: string;
}

interface FileTreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children: FileTreeNode[];
}

async function getSelectedFiles(): Promise<vscode.Uri[]> {
  const visibleTextEditors = vscode.window.visibleTextEditors;
  if (visibleTextEditors.length > 0) {
    return visibleTextEditors.map(editor => editor.document.uri);
  }

  const activeTextEditor = vscode.window.activeTextEditor;
  if (activeTextEditor) {
    return [activeTextEditor.document.uri];
  }

  throw new Error("No files selected or open in editor");
}

function canProcessFile(filePath: string): boolean {
  try {
    const fileStats = fs.statSync(filePath);
    if (fileStats.size > MAX_FILE_SIZE) {
      vscode.window.showWarningMessage(`Skipped large file: ${filePath}`);
      return false;
    }

    return getFileFormat(filePath) !== null;
  } catch (error) {
    console.error(`Error processing file ${filePath}:`, error);
    return false;
  }
}

function processFile(filePath: string, basePath: string): FileProcessingResult | null {
  if (!canProcessFile(filePath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(filePath, "utf8");
    const relativePath = path.relative(basePath, filePath);
    const format = getFileFormat(filePath);
    
    return { content, relativePath, language: format! };
  } catch (error) {
    console.error(`Error reading file ${filePath}:`, error);
    return null;
  }
}

function formatContent(result: FileProcessingResult): string {
  const codeBlock = result.language === 'markdown' ? '``````' : '```';
  return `### \`${result.relativePath}\`\n\n${codeBlock}${result.language}\n${result.content}\n${codeBlock}\n\n`;
}

function getAllFilesRecursively(directoryPath: string): string[] {
  let files: string[] = [];

  const items = fs.readdirSync(directoryPath);

  for (const item of items) {
    // Skip hidden files and common ignore patterns
    if (item.startsWith('.') ||
        item === 'node_modules' ||
        item === 'out' ||
        item === 'dist' ||
        item === 'build') {
      continue;
    }

    const fullPath = path.join(directoryPath, item);
    const stats = fs.statSync(fullPath);

    if (stats.isDirectory()) {
      files = files.concat(getAllFilesRecursively(fullPath));
    } else if (stats.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

function buildFileTree(filePaths: string[], basePath: string): FileTreeNode {
  const root: FileTreeNode = {
    name: path.basename(basePath) || 'project',
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

function generateTreeString(node: FileTreeNode, prefix: string = '', isLast: boolean = true): string {
  let result = '';
  const connector = isLast ? '└── ' : '├── ';

  if (node.path !== '') { // Skip root node name
    result += prefix + connector + node.name + '\n';
  }

  const childPrefix = node.path !== '' ? prefix + (isLast ? '    ' : '│   ') : '';
  const sortedChildren = [...node.children].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) {
      return a.isDirectory ? -1 : 1; // Directories first
    }
    return a.name.localeCompare(b.name);
  });

  sortedChildren.forEach((child, index) => {
    const isChildLast = index === sortedChildren.length - 1;
    result += generateTreeString(child, childPrefix, isChildLast);
  });

  return result;
}

function generateFileStructure(processedFiles: FileProcessingResult[], basePath: string): string {
  if (processedFiles.length === 0) {
    return '';
  }

  if (processedFiles.length === 1) {
    // Single file - no tree needed
    return '';
  }

  const filePaths = processedFiles.map(file => path.join(basePath, file.relativePath));
  const tree = buildFileTree(filePaths, basePath);
  const treeString = generateTreeString(tree);

  return `## File Structure\n\`\`\`\n${tree.name}/\n${treeString}\`\`\`\n\n`;
}

async function processFileOrDirectory(uri: vscode.Uri): Promise<string> {
  try {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
    if (!workspaceFolder) {
      throw new Error('File is not in a workspace');
    }

    const basePath = workspaceFolder.uri.fsPath;
    const fileStats = fs.statSync(uri.fsPath);
    let content = '';

    if (fileStats.isDirectory()) {
      const allFiles = getAllFilesRecursively(uri.fsPath);
      
      for (const filePath of allFiles) {
        const result = processFile(filePath, basePath);
        if (result) {
          content += formatContent(result);
        }
      }
    } else {
      const result = processFile(uri.fsPath, basePath);
      if (result) {
        content += formatContent(result);
      }
    }

    return content;
  } catch (error) {
    console.error(`Error processing path ${uri.fsPath}:`, error);
    return '';
  }
}

export function activate(context: vscode.ExtensionContext) {
  let disposable = vscode.commands.registerCommand(
    "copy-text-selected-files.copyFilesContent",
    async (uri?: vscode.Uri, uris?: vscode.Uri[]) => {
      try {
        const filesToProcess = uris || (uri ? [uri] : await getSelectedFiles());

        if (!filesToProcess?.length) {
          vscode.window.showInformationMessage("No files selected or open in editor");
          return;
        }

        let allProcessedFiles: FileProcessingResult[] = [];
        let basePath = '';

        // Collect all processed files first
        for (const file of filesToProcess) {
          const workspaceFolder = vscode.workspace.getWorkspaceFolder(file);
          if (workspaceFolder) {
            basePath = workspaceFolder.uri.fsPath;
            const fileStats = fs.statSync(file.fsPath);

            if (fileStats.isDirectory()) {
              const allFiles = getAllFilesRecursively(file.fsPath);
              for (const filePath of allFiles) {
                const result = processFile(filePath, basePath);
                if (result) {
                  allProcessedFiles.push(result);
                }
              }
            } else {
              const result = processFile(file.fsPath, basePath);
              if (result) {
                allProcessedFiles.push(result);
              }
            }
          }
        }

        if (allProcessedFiles.length > 0) {
          // Generate file structure if multiple files
          let finalContent = generateFileStructure(allProcessedFiles, basePath);

          // Add individual file contents
          for (const file of allProcessedFiles) {
            finalContent += formatContent(file);
          }

          await vscode.env.clipboard.writeText(finalContent);
          const message = allProcessedFiles.length === 1
            ? "1 file copied to clipboard!"
            : `${allProcessedFiles.length} files copied to clipboard!`;
          vscode.window.showInformationMessage(message);
        } else {
          vscode.window.showInformationMessage("No text files found or selected!");
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'An unknown error occurred';
        vscode.window.showErrorMessage(`Error: ${message}`);
      }
    }
  );

  context.subscriptions.push(disposable);
}

export function deactivate() {}