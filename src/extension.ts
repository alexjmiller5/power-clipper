import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import ignore from "ignore";
import { GitIgnoreHelper } from "./gitignoreHelper";
import {
  processFile,
  getAllFilesRecursively,
  generateOutput,
  FileProcessingResult,
  DEFAULT_FILE_TEMPLATE,
  DEFAULT_TREE_TEMPLATE,
  StructureFormat
} from "./core";

type ClipperMode = 'content' | 'tree' | 'full';

async function getSelectedFiles(): Promise<vscode.Uri[]> {
  try {
    await vscode.commands.executeCommand('copyFilePath');
    await new Promise(resolve => setTimeout(resolve, 100));
    const pathsText = await vscode.env.clipboard.readText();

    if (pathsText) {
      const rawPaths = pathsText.split(/\r?\n/).filter(p => p.trim() !== '');
      const validUris: vscode.Uri[] = [];

      for (const p of rawPaths) {
        if (fs.existsSync(p)) {
          validUris.push(vscode.Uri.file(p));
        }
      }

      if (validUris.length > 0) {
        return validUris;
      }
    }
  } catch (error) {
    console.error("Multi-select workaround failed:", error);
  }

  if (vscode.window.activeTextEditor) {
    return [vscode.window.activeTextEditor.document.uri];
  }

  return [];
}

async function addToExclude(uri: vscode.Uri, scope: vscode.ConfigurationTarget) {
  if (!uri) return;

  const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);

  // Fallback logic for Single Root vs Multi Root vs No Workspace
  if (scope === vscode.ConfigurationTarget.WorkspaceFolder && !workspaceFolder) {
    vscode.window.showWarningMessage("Cannot exclude from Project: File is not part of a workspace.");
    return;
  }

  let target = scope;
  if (scope === vscode.ConfigurationTarget.WorkspaceFolder) {
    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length === 1) {
      target = vscode.ConfigurationTarget.Workspace;
    }
  }

  const config = vscode.workspace.getConfiguration('powerClipper', uri);
  const existingExcludes = config.get<string[]>('alwaysExclude') || [];

  const fileName = path.basename(uri.fsPath);
  const pattern = `**/${fileName}`;

  if (!existingExcludes.includes(pattern)) {
    const newExcludes = [...existingExcludes, pattern];
    await config.update('alwaysExclude', newExcludes, target);

    const scopeName = target === vscode.ConfigurationTarget.Global ? "Global" : "Project";
    vscode.window.showInformationMessage(`Added '${pattern}' to ${scopeName} exclusions.`);
  } else {
    vscode.window.showInformationMessage(`'${pattern}' is already excluded.`);
  }
}
async function processSelections(
  uris: vscode.Uri[],
  mode: ClipperMode
): Promise<void> {
  const processedFiles: FileProcessingResult[] = [];
  const processedPaths: string[] = [];

  // NEW: Track unique paths to prevent duplicates
  const processedAbsPaths = new Set<string>();

  let commonBasePath = '';
  if (uris.length > 0) {
    const workspace = vscode.workspace.getWorkspaceFolder(uris[0]);
    commonBasePath = workspace ? workspace.uri.fsPath : path.dirname(uris[0].fsPath);
  }

  const config = vscode.workspace.getConfiguration('powerClipper', uris[0]);

  const userExcludes = config.get<string[]>('alwaysExclude') || [];
  const userIncludes = config.get<string[]>('alwaysInclude') || [];
  const fileTemplate = config.get<string>('fileTemplate') || DEFAULT_FILE_TEMPLATE;
  const treeTemplate = config.get<string>('treeTemplate') || DEFAULT_TREE_TEMPLATE;
  const useGitIgnore = config.get<boolean>('useGitIgnore') ?? true;
  const structureFormat = config.get<StructureFormat>('structureFormat') || 'repo';

  const excludeFilter = ignore().add(userExcludes);
  const includeFilter = ignore().add(userIncludes);
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
      const rootForMatching = workspaceRoot || commonBasePath;

      // 1. Check Exclusions
      const relativePath = path.relative(rootForMatching, fsPath);
      if (relativePath && excludeFilter.ignores(relativePath)) {
        if (!includeFilter.ignores(relativePath)) {
          continue;
        }
      }

      let ignoreHelper: GitIgnoreHelper | null = null;
      if (useGitIgnore && workspaceRoot) {
        if (!ignoreHelpers.has(workspaceRoot)) {
          ignoreHelpers.set(workspaceRoot, new GitIgnoreHelper(workspaceRoot));
        }
        ignoreHelper = ignoreHelpers.get(workspaceRoot)!;
      }

      if (useGitIgnore && ignoreHelper && ignoreHelper.shouldIgnore(fsPath)) {
        const isForcedRoot = userIncludes.some(p => fsPath.includes(p));
        if (!isForcedRoot) continue;
      }

      const stats = fs.statSync(fsPath);
      const needContent = mode !== 'tree';

      // Helper to safely add files
      const addFile = (filePath: string) => {
        // NEW: Skip if we have already processed this exact path
        if (processedAbsPaths.has(filePath)) return;
        processedAbsPaths.add(filePath);

        if (needContent) {
          const result = processFile(filePath, workspaceRoot || commonBasePath);
          if (result) processedFiles.push(result);
        } else {
          processedPaths.push(filePath);
        }
      };

      if (stats.isDirectory()) {
        const children = getAllFilesRecursively(fsPath, ignoreHelper, userExcludes, userIncludes, undefined);
        for (const childPath of children) {
          addFile(childPath);
        }
      } else {
        addFile(fsPath);
      }
    }
  });

  const needContent = mode !== 'tree';
  const needTree = mode !== 'content';

  const pathsForTree = needContent
    ? processedFiles.map(f => f.absolutePath)
    : processedPaths;

  const finalOutput = generateOutput(
    processedFiles,
    pathsForTree,
    commonBasePath,
    needContent,
    needTree,
    fileTemplate,
    treeTemplate,
    structureFormat
  );

  if (!finalOutput) {
    vscode.window.showWarningMessage("No files processed (check your exclusions).");
    return;
  }

  await vscode.env.clipboard.writeText(finalOutput);

  const count = needContent ? processedFiles.length : pathsForTree.length;
  vscode.window.showInformationMessage(`Power Clipper: Copied ${count} items (${mode})!`);
}

export function activate(context: vscode.ExtensionContext) {
  let copyContentOnly = vscode.commands.registerCommand(
    "power-clipper.copyFilesContentOnly",
    async (uri?: vscode.Uri, uris?: vscode.Uri[]) => {
      const files = uris && uris.length > 0 ? uris : (uri ? [uri] : await getSelectedFiles());
      if (!files.length) return;
      await processSelections(files, 'content');
    }
  );

  let copyFull = vscode.commands.registerCommand(
    "power-clipper.copyFilesFull",
    async (uri?: vscode.Uri, uris?: vscode.Uri[]) => {
      const files = uris && uris.length > 0 ? uris : (uri ? [uri] : await getSelectedFiles());
      if (!files.length) return;
      await processSelections(files, 'full');
    }
  );

  let copyTree = vscode.commands.registerCommand(
    "power-clipper.copyFolderStructure",
    async (uri?: vscode.Uri, uris?: vscode.Uri[]) => {
      const files = uris && uris.length > 0 ? uris : (uri ? [uri] : await getSelectedFiles());
      if (!files.length) return;
      await processSelections(files, 'tree');
    }
  );

  let excludeGlobal = vscode.commands.registerCommand(
    "power-clipper.excludeGlobally",
    async (uri?: vscode.Uri) => {
      if (uri) await addToExclude(uri, vscode.ConfigurationTarget.Global);
    }
  );

  let excludeProject = vscode.commands.registerCommand(
    "power-clipper.excludeFromProject",
    async (uri?: vscode.Uri) => {
      if (uri) await addToExclude(uri, vscode.ConfigurationTarget.WorkspaceFolder);
    }
  );

  let debugCommand = vscode.commands.registerCommand(
    "power-clipper.debugConfig",
    async () => {
      const extId = "alexjmiller5.power-clipper";
      const ext = vscode.extensions.getExtension(extId);

      console.log("\n====== POWER CLIPPER DIAGNOSTIC ======");

      console.log(`Extension Found: ${ext ? 'Yes' : 'No'}`);
      if (ext) {
        console.log(`Extension Path: ${ext.extensionPath}`);
        console.log(`Version: ${ext.packageJSON.version}`);

        // Check ROOT configuration first, then contributes.configuration
        const rawConfig = ext.packageJSON.configuration || ext.packageJSON.contributes?.configuration;

        if (rawConfig) {
          const props = Array.isArray(rawConfig)
            ? rawConfig.reduce((acc: any, c: any) => ({ ...acc, ...c.properties }), {})
            : rawConfig.properties;

          const hasKey = "powerClipper.alwaysExclude" in props;
          console.log(`'powerClipper.alwaysExclude' in manifest: ${hasKey}`);

          if (hasKey) {
            const def = props["powerClipper.alwaysExclude"];
            console.log(`Scope defined in manifest: ${def.scope}`);
            console.log(`Type defined: ${def.type}`);
          }
        } else {
          console.log("CRITICAL: 'configuration' block not found in package.json manifest.");
        }
      }

      const config = vscode.workspace.getConfiguration("powerClipper");
      const inspect = config.inspect("alwaysExclude");

      console.log("Config Inspection Result:");
      console.log(JSON.stringify(inspect, null, 2));

      const folders = vscode.workspace.workspaceFolders;
      console.log(`Workspace Folders: ${folders ? folders.length : 0}`);

      console.log("======================================\n");
      vscode.window.showInformationMessage("Diagnostic logged to Debug Console.");
    }
  );

  context.subscriptions.push(
    copyContentOnly,
    copyFull,
    copyTree,
    excludeGlobal,
    excludeProject,
    debugCommand
  );
}

export function deactivate() { }