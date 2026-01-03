#!/usr/bin/env node
import * as fs from 'fs';
import * as path from 'path';
import clipboardy from 'clipboardy';
import { GitIgnoreHelper } from './gitignoreHelper';
import { 
  processFile, 
  getAllFilesRecursively, 
  generateOutput, 
  FileProcessingResult,
  DEFAULT_FILE_TEMPLATE,
  DEFAULT_TREE_TEMPLATE,
  StructureFormat
} from './core';

const args = process.argv.slice(2);
const cwd = process.cwd();

function unescapeString(str: string): string {
  return str
    .replace(/\\n/g, '\n')
    .replace(/\\\\n/g, '\n') 
    .replace(/\\t/g, '\t')
    .replace(/\\r/g, '\r');
}

if (args.includes('--help') || args.includes('-h') || args.length === 0) {
  console.log(`
  Usage: pclip [path1] [path2] ... [options]
   
  Options:
    --mode <type>             Set output mode: 'content' (default), 'tree', 'full'
    --tree-only               Alias for --mode tree (deprecated)
    --print                   Print to console instead of copying to clipboard
    --no-gitignore            Do not respect .gitignore rules
    --exclude <str>           Exclude glob pattern (e.g. "**/secret.js")
    --include <str>           Force include paths (overrides ignore rules)
    --file-template <str>     File format. 
    --tree-template <str>     Tree structure format. 
    --structure <type>        repo | relative | absolute
  `);
  process.exit(0);
}

// Mode Logic
let mode: 'content' | 'tree' | 'full' = 'content'; // New Default
if (args.includes('--tree-only')) {
    mode = 'tree';
}

const modeIndex = args.indexOf('--mode');
if (modeIndex !== -1 && args[modeIndex + 1]) {
    const m = args[modeIndex + 1].toLowerCase();
    if (['content', 'tree', 'full'].includes(m)) {
        mode = m as any;
    }
}

const printMode = args.includes('--print');
const noGitIgnore = args.includes('--no-gitignore');
const excludes: string[] = [];
const includes: string[] = [];
const targetPaths: string[] = [];
let fileTemplate = DEFAULT_FILE_TEMPLATE;
let treeTemplate = DEFAULT_TREE_TEMPLATE;
let structureFormat: StructureFormat = 'repo';

// Argument Parsing
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--exclude' && args[i+1]) {
    excludes.push(args[i+1]);
    i++;
  } else if (arg === '--include' && args[i+1]) {
    includes.push(args[i+1]);
    i++;
  } else if (arg === '--file-template' && args[i+1]) {
    fileTemplate = unescapeString(args[i+1]);
    i++;
  } else if (arg === '--tree-template' && args[i+1]) {
    treeTemplate = unescapeString(args[i+1]);
    i++;
  } else if (arg === '--structure' && args[i+1]) {
    structureFormat = args[i+1] as StructureFormat;
    i++;
  } else if (arg === '--mode' && args[i+1]) {
    // handled above, just skip
    i++;
  } else if (arg.startsWith('--')) {
    continue;
  } else {
    // It's a path
    targetPaths.push(path.resolve(cwd, arg));
  }
}

async function run() {
  const ignoreHelper = noGitIgnore ? null : new GitIgnoreHelper(cwd);
  
  const onSkip = (skippedPath: string, reason: string) => {
    // Optional: Verbose logging can go here
  };

  const processedFiles: FileProcessingResult[] = [];
  const processedPaths: string[] = [];
  
  for (const targetPath of targetPaths) {
    if (!fs.existsSync(targetPath)) {
      console.error(`Error: Path not found: ${targetPath}`);
      continue;
    }

    let filesToProcess: string[] = [];
    const stats = fs.statSync(targetPath);
    
    if (stats.isDirectory()) {
      filesToProcess = getAllFilesRecursively(targetPath, ignoreHelper, excludes, includes, onSkip);
    } else {
      filesToProcess = [targetPath];
    }

    const needContent = mode !== 'tree';

    for (const file of filesToProcess) {
      if (needContent) {
        if (processedFiles.some(f => f.absolutePath === file)) continue;
        const res = processFile(file, cwd);
        if (res) processedFiles.push(res);
      } else {
        if (processedPaths.includes(file)) continue;
        processedPaths.push(file);
      }
    }
  }

  const needContent = mode !== 'tree';
  const needTree = mode !== 'content';

  const pathsForTree = needContent ? processedFiles.map(f => f.absolutePath) : processedPaths;
  
  const output = generateOutput(
    processedFiles, 
    pathsForTree, 
    cwd, 
    needContent, 
    needTree,
    fileTemplate, 
    treeTemplate,
    structureFormat
  );

  if (printMode) {
    console.log(output);
  } else {
    clipboardy.writeSync(output);
    console.log(`Success: Copied ${needContent ? processedFiles.length : processedPaths.length} items to clipboard (Mode: ${mode})`);
  }
}

run().catch(error => {
  console.error("Error:", error.message);
  process.exit(1);
});