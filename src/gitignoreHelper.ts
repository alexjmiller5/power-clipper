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