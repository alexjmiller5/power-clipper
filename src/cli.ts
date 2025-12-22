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
    --tree-only           Only output file structure
    --print               Print to console instead of copying to clipboard
    --no-gitignore        Do not respect .gitignore rules
    --exclude <str>       Exclude paths containing string
    --include <str>       Force include paths (overrides ignore rules)
    --file-template <str> File format. ({{fileName}}, {{repoPath}}, {{relativePath}}, {{absolutePath}}, {{content}})
    --tree-template <str> Tree structure format. ({{tree}})
  `);
  process.exit(0);
}

const copyContent = !args.includes('--tree-only');
const printMode = args.includes('--print');
const noGitIgnore = args.includes('--no-gitignore'); // Check flag
const excludes: string[] = [];
const includes: string[] = [];
const targetPaths: string[] = [];
let fileTemplate = DEFAULT_FILE_TEMPLATE;
let treeTemplate = DEFAULT_TREE_TEMPLATE;
let structureFormat: StructureFormat = 'repo';

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
  } else if (arg.startsWith('--')) {
    continue;
  } else if (arg === '--structure' && args[i+1]) {
    const val = args[i+1];
    if (['repo', 'relative', 'absolute'].includes(val)) {
        structureFormat = val as StructureFormat;
    } else {
        console.error("Invalid structure. Use: repo, relative, absolute");
        process.exit(1);
    }
    i++;
  }
  else {
    targetPaths.push(path.resolve(cwd, arg));
  }
}

async function run() {
  // Pass null if flag is set, otherwise load the helper
  const ignoreHelper = noGitIgnore ? null : new GitIgnoreHelper(cwd);
  
  const onSkip = (skippedPath: string, reason: string) => {
    const rel = path.relative(cwd, skippedPath);
    console.error(`[Skipped] ${rel} (${reason})`);
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

    for (const file of filesToProcess) {
      if (copyContent) {
        if (processedFiles.some(f => f.absolutePath === file)) continue;
        const res = processFile(file, cwd);
        if (res) processedFiles.push(res);
      } else {
        if (processedPaths.includes(file)) continue;
        processedPaths.push(file);
      }
    }
  }

  const pathsForTree = copyContent ? processedFiles.map(f => f.absolutePath) : processedPaths;
  
  const output = generateOutput(
    processedFiles, 
    pathsForTree, 
    cwd, 
    copyContent, 
    fileTemplate, 
    treeTemplate
  );

  if (printMode) {
    console.log(output);
  } else {
    clipboardy.writeSync(output);
    console.log(`Success: Copied ${processedFiles.length} files to clipboard!`);
  }
}

run().catch(error => {
  console.error("Error:", error.message);
  process.exit(1);
});