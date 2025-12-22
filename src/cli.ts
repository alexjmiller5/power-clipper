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
  DEFAULT_TEMPLATE
} from './core';

const args = process.argv.slice(2);
const cwd = process.cwd();

if (args.includes('--help') || args.includes('-h') || args.length === 0) {
  console.log(`
  Usage: pclip [path] [options]
  
  Options:
    --tree-only        Only output file structure
    --print            Print to console instead of copying to clipboard
    --exclude <str>    Exclude paths containing string
    --include <str>    Force include paths (overrides ignore rules)
    --template <str>   Custom format string ({{path}}, {{content}}, etc.)
  `);
  process.exit(0);
}

const copyContent = !args.includes('--tree-only');
const printMode = args.includes('--print');
const excludes: string[] = [];
const includes: string[] = [];
let template = DEFAULT_TEMPLATE;
let targetPath = cwd;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--exclude' && args[i+1]) {
    excludes.push(args[i+1]);
    i++;
  } else if (args[i] === '--include' && args[i+1]) {
    includes.push(args[i+1]);
    i++;
  } else if (args[i] === '--template' && args[i+1]) {
    template = args[i+1];
    i++;
  } else if (!args[i].startsWith('-')) {
    targetPath = path.resolve(cwd, args[i]);
  }
}

async function run() {
  const ignoreHelper = new GitIgnoreHelper(cwd);
  
  const onSkip = (skippedPath: string, reason: string) => {
    const rel = path.relative(cwd, skippedPath);
    console.error(`[Skipped] ${rel} (${reason})`);
  };

  const processedFiles: FileProcessingResult[] = [];
  const processedPaths: string[] = [];
  
  let filesToProcess: string[] = [];

  const stats = fs.statSync(targetPath);
  
  if (stats.isDirectory()) {
    filesToProcess = getAllFilesRecursively(targetPath, ignoreHelper, excludes, includes, onSkip);
  } else {
    filesToProcess = [targetPath];
  }

  for (const file of filesToProcess) {
    if (copyContent) {
      const res = processFile(file, cwd);
      if (res) processedFiles.push(res);
    } else {
      processedPaths.push(file);
    }
  }

  const pathsForTree = copyContent ? processedFiles.map(f => f.absolutePath) : processedPaths;
  const output = generateOutput(processedFiles, pathsForTree, cwd, copyContent, template);

  if (printMode) {
    console.log(output);
  } else {
    clipboardy.writeSync(output);
    // Removed the leading \n here
    console.log(`Success: Copied ${processedFiles.length} files to clipboard!`);
  }
}

run().catch(error => {
  console.error("Error:", error.message);
  process.exit(1);
});