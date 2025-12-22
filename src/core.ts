import * as fs from 'fs';
import * as path from 'path';
import ignore from 'ignore'; 
import { getFileFormat } from './languageExtensions';
import { GitIgnoreHelper } from './gitignoreHelper';

export const MAX_FILE_SIZE = 3 * 1024 * 1024; // 3 MB

// Default Templates
export const DEFAULT_FILE_TEMPLATE = "### `{{relativePath}}`\n\n```{{language}}\n{{content}}\n```\n\n";
export const DEFAULT_TREE_TEMPLATE = "## File Structure\n```\n{{tree}}\n```\n\n";

// "tree" is now "relative" (legacy default), but we will make "repo" the new default in config
export type StructureFormat = 'relative' | 'absolute' | 'repo';

export interface PathDetails {
  fileName: string;
  relativePath: string;
  repoPath: string;
  absolutePath: string;
}

export interface FileProcessingResult extends PathDetails {
  content: string;
  language: string;
}

export interface FileTreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children: FileTreeNode[];
}

function findGitRoot(startPath: string): string | null {
  let current = startPath;
  const root = path.parse(startPath).root;

  while (current !== root) {
    if (fs.existsSync(path.join(current, '.git'))) {
      return current;
    }
    current = path.dirname(current);
  }
  return null;
}

export function getPathDetails(filePath: string, basePath: string): PathDetails {
  const fileName = path.basename(filePath);
  const relativePath = path.relative(basePath, filePath);
  const gitRoot = findGitRoot(path.dirname(filePath));
  let repoPath = relativePath;

  if (gitRoot) {
    const repoName = path.basename(gitRoot);
    const pathFromRoot = path.relative(gitRoot, filePath);
    repoPath = path.join(repoName, pathFromRoot);
  }

  return { fileName, relativePath, repoPath, absolutePath: filePath };
}

export function processFile(filePath: string, basePath: string): FileProcessingResult | null {
  try {
    const fileStats = fs.statSync(filePath);
    if (fileStats.size > MAX_FILE_SIZE) return null;

    const format = getFileFormat(filePath);
    if (!format) return null;

    const content = fs.readFileSync(filePath, "utf8");
    const details = getPathDetails(filePath, basePath);

    return { 
      ...details,
      content, 
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
  const userExcluder = ignore().add(excludePatterns);
  const userIncluder = ignore().add(includePatterns);
  
  try {
    const items = fs.readdirSync(directoryPath);

    for (const item of items) {
      const fullPath = path.join(directoryPath, item);
      const rootForMatching = ignoreHelper ? ignoreHelper['workspaceRoot'] : directoryPath;
      const relativePath = path.relative(rootForMatching, fullPath);

      const isForcedInclude = userIncluder.ignores(relativePath);
      
      if (!isForcedInclude) {
        if (ignoreHelper && ignoreHelper.shouldIgnore(fullPath)) {
          if (onSkip) onSkip(fullPath, 'gitignore');
          continue;
        }
        if (userExcluder.ignores(relativePath)) {
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
    .replace(/{{fileName}}/g, result.fileName)
    .replace(/{{relativePath}}/g, result.relativePath)
    .replace(/{{repoPath}}/g, result.repoPath)
    .replace(/{{absolutePath}}/g, result.absolutePath)
    .replace(/{{path}}/g, result.relativePath)
    .replace(/{{language}}/g, result.language)
    .replace(/{{content}}/g, result.content);
}

// Rewritten: Builds a tree from ANY list of path strings (repo-scoped, absolute, etc.)
export function buildFileTree(pathStrings: string[]): FileTreeNode {
  const root: FileTreeNode = {
    name: 'root', // Virtual root
    path: '',
    isDirectory: true,
    children: []
  };

  for (const p of pathStrings) {
    // Split by / or \
    const parts = p.split(/[/\\]/).filter(Boolean); 
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
          isDirectory: !isLastPart, // Crude assumption, but works for visualization
          children: []
        };
        currentNode.children.push(existingChild);
      }
      currentNode = existingChild;
    }
  }

  // Optimize: If there is only one top-level folder (e.g. "my-repo"), return that as the root
  // instead of the virtual "root".
  if (root.children.length === 1) {
    return root.children[0];
  }

  // Otherwise return the virtual root (acting as "Current Selection" or similar)
  // We can rename it to "." to indicate CWD if there are multiple top-level items
  root.name = '.';
  return root;
}

export function generateTreeString(node: FileTreeNode, prefix: string = '', isLast: boolean = true): string {
  let result = '';
  // Only print the node name if it's not the virtual empty root
  if (node.path !== '') {
    const connector = isLast ? '└── ' : '├── ';
    result += prefix + connector + node.name + '\n';
  } else if (node.name !== 'root' && node.name !== '') {
     // Print "." or base folder name
     result += node.name + '/\n';
  }

  const childPrefix = (node.path === '' && node.name === 'root') 
    ? prefix 
    : prefix + (isLast ? '    ' : '│   ');
    
  const sortedChildren = [...node.children].sort((a, b) => {
    // Directories first, then files
    if (a.children.length > 0 && b.children.length === 0) return -1;
    if (a.children.length === 0 && b.children.length > 0) return 1;
    return a.name.localeCompare(b.name);
  });

  sortedChildren.forEach((child, index) => {
    result += generateTreeString(child, childPrefix, index === sortedChildren.length - 1);
  });

  return result;
}

export function generateOutput(
  files: FileProcessingResult[], 
  allSelectedPaths: string[], 
  basePath: string, 
  includeContent: boolean,
  fileTemplate: string = DEFAULT_FILE_TEMPLATE,
  treeTemplate: string = DEFAULT_TREE_TEMPLATE,
  structureFormat: StructureFormat = 'repo' // Default changed to 'repo' as requested
): string {
  let finalOutput = '';

  if (allSelectedPaths.length > 0) {
    // 1. Calculate the strings we want to graph based on the setting
    const pathsToGraph = allSelectedPaths.map(p => {
      const details = getPathDetails(p, basePath);
      if (structureFormat === 'absolute') return details.absolutePath;
      if (structureFormat === 'repo') return details.repoPath;
      return details.relativePath;
    });

    // 2. Build the tree from those strings
    const tree = buildFileTree(pathsToGraph);
    
    // 3. Generate ASCII
    // If the tree root has a name (like "my-repo"), start with that.
    const treeHeader = (tree.name !== 'root' && tree.path !== '') ? `${tree.name}/\n` : '';
    const treeBody = treeHeader + generateTreeString(tree);
    
    finalOutput += treeTemplate.replace(/{{tree}}/g, treeBody.trim());
  }

  if (includeContent) {
    for (const file of files) {
      finalOutput += formatContent(file, fileTemplate);
    }
  }

  return finalOutput;
}