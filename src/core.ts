import * as fs from 'fs';
import * as path from 'path';
import { getFileFormat } from './languageExtensions';
import { GitIgnoreHelper } from './gitignoreHelper';

export const MAX_FILE_SIZE = 3 * 1024 * 1024; // 3 MB
export const DEFAULT_TEMPLATE = "### `{{path}}`\n\n```{{language}}\n{{content}}\n```\n\n";

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
  excludePatterns: string[] = [],
  includePatterns: string[] = [],
  onSkip?: (path: string, reason: string) => void
): string[] {
  let files: string[] = [];
  
  // Hard safety check for node_modules unless explicitly included
  if (path.basename(directoryPath) === 'node_modules' && !includePatterns.some(p => directoryPath.includes(p))) {
    if (onSkip) onSkip(directoryPath, 'node_modules');
    return [];
  }

  try {
    const items = fs.readdirSync(directoryPath);

    for (const item of items) {
      const fullPath = path.join(directoryPath, item);
      const relativePath = ignoreHelper ? path.relative(ignoreHelper['workspaceRoot'], fullPath) : item; // approximate relative
      
      // 0. CHECK FORCED INCLUDES (Overrides everything else)
      const isForcedInclude = includePatterns.some(p => fullPath.includes(p) || relativePath.includes(p));
      
      if (!isForcedInclude) {
        // 1. Check GitIgnore
        if (ignoreHelper && ignoreHelper.shouldIgnore(fullPath)) {
          if (onSkip) onSkip(fullPath, 'gitignore');
          continue;
        }

        // 2. Check Exclude Patterns
        const isExcluded = excludePatterns.some(ex => fullPath.includes(ex));
        if (isExcluded) {
           if (onSkip) onSkip(fullPath, 'exclude_pattern');
           continue;
        }
      }

      const stats = fs.statSync(fullPath);

      if (stats.isDirectory()) {
        files = files.concat(getAllFilesRecursively(fullPath, ignoreHelper, excludePatterns, includePatterns, onSkip));
      } else if (stats.isFile()) {
        files.push(fullPath);
      }
    }
  } catch (err) {
    console.error(`Error scanning ${directoryPath}: ${err}`);
  }

  return files;
}

export function formatContent(result: FileProcessingResult, template: string): string {
  return template
    .replace(/{{path}}/g, result.relativePath)
    .replace(/{{absolutePath}}/g, result.absolutePath)
    .replace(/{{language}}/g, result.language)
    .replace(/{{content}}/g, result.content);
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
  includeContent: boolean,
  template: string = DEFAULT_TEMPLATE
): string {
  let finalOutput = '';

  if (treePaths.length > 0) {
    const tree = buildFileTree(treePaths, basePath);
    const treeString = generateTreeString(tree);
    finalOutput += `## File Structure\n\`\`\`\n${tree.name}/\n${treeString}\`\`\`\n\n`;
  }

  if (includeContent) {
    for (const file of files) {
      finalOutput += formatContent(file, template);
    }
  }

  return finalOutput;
}