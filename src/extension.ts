import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { GitIgnoreHelper } from "./gitignoreHelper";
import { 
  processFile, 
  getAllFilesRecursively, 
  generateOutput, 
  FileProcessingResult,
  DEFAULT_TEMPLATE
} from "./core";

// ... (getSelectedFiles helper remains same) ...
async function getSelectedFiles(): Promise<vscode.Uri[]> {
    const visibleTextEditors = vscode.window.visibleTextEditors;
    if (visibleTextEditors.length > 0) {
      // If we have an active editor, prioritize that, otherwise use visible
      // But standard behavior usually checks active editor or explorer context.
      const active = vscode.window.activeTextEditor;
      if (active) return [active.document.uri];
    }
    return [];
}

async function processSelections(
  uris: vscode.Uri[], 
  copyContent: boolean = true
): Promise<void> {
  const processedFiles: FileProcessingResult[] = [];
  const processedPaths: string[] = [];
  
  let commonBasePath = '';
  if (uris.length > 0) {
    const workspace = vscode.workspace.getWorkspaceFolder(uris[0]);
    commonBasePath = workspace ? workspace.uri.fsPath : path.dirname(uris[0].fsPath);
  }

  const config = vscode.workspace.getConfiguration('powerClipper');
  const userExcludes = config.get<string[]>('alwaysExclude') || [];
  const template = config.get<string>('formatTemplate') || DEFAULT_TEMPLATE;

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
      
      let ignoreHelper: GitIgnoreHelper | null = null;
      if (workspaceRoot) {
        if (!ignoreHelpers.has(workspaceRoot)) {
          ignoreHelpers.set(workspaceRoot, new GitIgnoreHelper(workspaceRoot));
        }
        ignoreHelper = ignoreHelpers.get(workspaceRoot)!;
      }

      if (ignoreHelper && ignoreHelper.shouldIgnore(fsPath)) continue;

      const stats = fs.statSync(fsPath);

      if (stats.isDirectory()) {
        // Pass empty [] for includes, undefined for onSkip
        const children = getAllFilesRecursively(fsPath, ignoreHelper, userExcludes, [], undefined);
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

  const pathsForTree = copyContent 
    ? processedFiles.map(f => f.absolutePath) 
    : processedPaths;

  const finalOutput = generateOutput(processedFiles, pathsForTree, commonBasePath, copyContent, template);

  if (!finalOutput) {
    vscode.window.showWarningMessage("No files processed.");
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