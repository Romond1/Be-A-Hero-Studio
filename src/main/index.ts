import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import archiver from 'archiver';
import { v4 as uuid } from 'uuid';
import type { ProjectManifest } from '../renderer/types/domain';

const isDev = !app.isPackaged;

interface ProjectContext {
  projectPath?: string;
  manifest?: ProjectManifest;
}

const projectContext: ProjectContext = {};

const SUPPORTED_IMPORT_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'webp',
  'gif',
  'bmp',
  'svg',
  'mp3',
  'wav',
  'ogg',
  'm4a',
  'aac'
]);

async function atomicWrite(filePath: string, data: string): Promise<void> {
  const tempPath = `${filePath}.tmp`;
  await fs.writeFile(tempPath, data, 'utf-8');
  await fs.rename(tempPath, filePath);
}

async function ensureProjectFolders(projectPath: string): Promise<void> {
  await fs.mkdir(path.join(projectPath, 'assets'), { recursive: true });
  await fs.mkdir(path.join(projectPath, 'thumbs'), { recursive: true });
  await fs.mkdir(path.join(projectPath, 'autosave'), { recursive: true });
  await fs.mkdir(path.join(projectPath, 'logs'), { recursive: true });
}

async function writeLog(projectPath: string, message: string): Promise<string> {
  const logPath = path.join(projectPath, 'logs', 'events.log');
  await fs.appendFile(logPath, `${new Date().toISOString()} ${message}\n`);
  return logPath;
}

function defaultManifest(): ProjectManifest {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now,
    sections: [{ id: uuid(), title: 'Section 1', order: 0, musicItems: [], timeline: [] }],
    assetRegistry: {}
  };
}

function readMime(ext: string): string {
  const normalized = ext.toLowerCase();
  if (normalized === 'png') return 'image/png';
  if (normalized === 'jpg' || normalized === 'jpeg') return 'image/jpeg';
  if (normalized === 'webp') return 'image/webp';
  if (normalized === 'gif') return 'image/gif';
  if (normalized === 'bmp') return 'image/bmp';
  if (normalized === 'svg') return 'image/svg+xml';
  if (normalized === 'wav') return 'audio/wav';
  if (normalized === 'ogg') return 'audio/ogg';
  if (normalized === 'm4a') return 'audio/mp4';
  if (normalized === 'aac') return 'audio/aac';
  if (normalized === 'mp3') return 'audio/mpeg';
  return 'application/octet-stream';
}

function setProjectContext(projectPath: string, manifest: ProjectManifest): void {
  projectContext.projectPath = projectPath;
  projectContext.manifest = manifest;
}

function isManifestLike(input: unknown): input is ProjectManifest {
  if (!input || typeof input !== 'object') return false;
  const manifest = input as ProjectManifest;
  return (
    Array.isArray(manifest.sections) &&
    !!manifest.assetRegistry &&
    typeof manifest.assetRegistry === 'object' &&
    typeof manifest.schemaVersion === 'number'
  );
}

async function importFileIntoProject(projectPath: string, sourcePath: string) {
  const stat = await fs.stat(sourcePath);
  const ext = path.extname(sourcePath).replace('.', '').toLowerCase();
  const assetId = uuid();
  const targetPath = path.join(projectPath, 'assets', `${assetId}.${ext}`);
  const content = await fs.readFile(sourcePath);
  await fs.writeFile(targetPath, content);
  const hash = createHash('sha256').update(content).digest('hex');
  return {
    assetId,
    ext,
    mime: readMime(ext),
    originalFileName: path.basename(sourcePath),
    size: stat.size,
    hash,
    assetPath: targetPath
  };
}

async function collectSupportedFiles(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectSupportedFiles(fullPath)));
    } else {
      const ext = path.extname(entry.name).replace('.', '').toLowerCase();
      if (SUPPORTED_IMPORT_EXTENSIONS.has(ext)) files.push(fullPath);
    }
  }
  return files;
}

async function createWindow(): Promise<void> {
  const window = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (isDev) {
    await window.loadURL('http://localhost:5173');
  } else {
    await window.loadFile(path.join(__dirname, '../../dist/index.html'));
  }
}

app.whenReady().then(() => {
  void createWindow();

  ipcMain.handle('project:create', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });
    if (result.canceled || !result.filePaths[0]) throw new Error('Project creation cancelled');
    const projectPath = result.filePaths[0];
    await ensureProjectFolders(projectPath);
    const manifest = defaultManifest();
    await atomicWrite(path.join(projectPath, 'manifest.json'), JSON.stringify(manifest, null, 2));
    setProjectContext(projectPath, manifest);
    await writeLog(projectPath, `project:create ${projectPath}`);
    return { projectPath, manifest };
  });

  ipcMain.handle('project:open', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    if (result.canceled || !result.filePaths[0]) throw new Error('Open cancelled');
    const projectPath = result.filePaths[0];
    const manifestText = await fs.readFile(path.join(projectPath, 'manifest.json'), 'utf-8');
    const manifest = JSON.parse(manifestText) as ProjectManifest;
    setProjectContext(projectPath, manifest);
    return { projectPath, manifest };
  });

  // Keep stable import IPC name used by renderer bridge.
  ipcMain.handle('asset:import', async (_event, { projectPath }: { projectPath: string }) => {
    const result = await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'] });
    if (result.canceled || !result.filePaths.length) throw new Error('Asset import cancelled');
    const orderedPaths = [...result.filePaths].sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
    const assets = [];
    for (const sourcePath of orderedPaths) {
      assets.push(await importFileIntoProject(projectPath, sourcePath));
    }
    await writeLog(projectPath, `asset:import count=${assets.length}`);
    return assets;
  });

  ipcMain.handle('asset:importFolder', async (_event, { projectPath }: { projectPath: string }) => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    if (result.canceled || !result.filePaths[0]) throw new Error('Folder import cancelled');
    const root = result.filePaths[0];
    const paths = (await collectSupportedFiles(root)).sort((a, b) => a.localeCompare(b));
    const assets = [];
    for (const sourcePath of paths) {
      assets.push(await importFileIntoProject(projectPath, sourcePath));
    }
    await writeLog(projectPath, `asset:importFolder root=${root} count=${assets.length}`);
    return assets;
  });

  ipcMain.handle(
    'project:save',
    async (_event, { projectPath, manifest }: { projectPath: string; manifest: ProjectManifest }) => {
      const nextManifest = { ...manifest, updatedAt: new Date().toISOString() };
      const manifestPath = path.join(projectPath, 'manifest.json');
      await atomicWrite(manifestPath, JSON.stringify(nextManifest, null, 2));
      setProjectContext(projectPath, nextManifest);
      const logPath = await writeLog(projectPath, `project:save ${manifestPath}`);
      return { manifestPath, savedAt: nextManifest.updatedAt, logPath };
    }
  );

  ipcMain.handle(
    'project:autosave',
    async (_event, { projectPath, manifest }: { projectPath: string; manifest: ProjectManifest }) => {
      const autosaveDir = path.join(projectPath, 'autosave');
      await fs.mkdir(autosaveDir, { recursive: true });
      const autosaveManifest = { ...manifest, updatedAt: new Date().toISOString() };
      const payload = JSON.stringify(autosaveManifest, null, 2);
      const latestPath = path.join(autosaveDir, 'autosave_latest.json');
      await atomicWrite(latestPath, payload);
      for (let index = 10; index >= 2; index -= 1) {
        const from = path.join(autosaveDir, `autosave_${String(index - 1).padStart(3, '0')}.json`);
        const to = path.join(autosaveDir, `autosave_${String(index).padStart(3, '0')}.json`);
        try {
          await fs.rename(from, to);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        }
      }
      await atomicWrite(path.join(autosaveDir, 'autosave_001.json'), payload);
      setProjectContext(projectPath, autosaveManifest);
      const savedAt = autosaveManifest.updatedAt;
      const logPath = await writeLog(projectPath, `project:autosave ${latestPath}`);
      return { autosavePath: latestPath, savedAt, logPath };
    }
  );

  ipcMain.handle('project:recover', async (_event, { projectPath }: { projectPath: string }) => {
    const autosaveDir = path.join(projectPath, 'autosave');
    const entries = await fs.readdir(autosaveDir);
    const candidates = entries.filter((name) => name.startsWith('autosave_') && name.endsWith('.json'));
    if (!candidates.length) throw new Error('No autosave files found for recovery');

    const filesWithTimes = await Promise.all(
      candidates.map(async (name) => {
        const fullPath = path.join(autosaveDir, name);
        const stat = await fs.stat(fullPath);
        return { fullPath, mtimeMs: stat.mtimeMs };
      })
    );

    filesWithTimes.sort((a, b) => b.mtimeMs - a.mtimeMs);

    for (const candidate of filesWithTimes) {
      try {
        const data = await fs.readFile(candidate.fullPath, 'utf-8');
        const parsed = JSON.parse(data);
        if (!isManifestLike(parsed)) {
          throw new Error('autosave schema invalid');
        }
        const manifest = parsed as ProjectManifest;
        setProjectContext(projectPath, manifest);
        await writeLog(projectPath, `project:recover ${candidate.fullPath}`);
        return { manifest, autosavePath: candidate.fullPath };
      } catch {
        // Keep scanning for newest valid snapshot.
      }
    }

    throw new Error('No valid autosave snapshot found for recovery');
  });

  ipcMain.handle(
    'project:healthCheck',
    async (_event, { projectPath, manifest }: { projectPath: string; manifest: ProjectManifest }) => {
      const missing: string[] = [];
      const refs = new Set<string>();
      manifest.sections.forEach((section) => {
        section.timeline.forEach((item) => {
          if (item.type === 'slide' || item.type === 'video') refs.add(item.assetId);
          if (item.type === 'slide') item.dialogueItems.forEach((dialogue) => refs.add(dialogue.assetId));
          if (item.type === 'pageBreak') item.mediaGrid.forEach((tile) => refs.add(tile.assetId));
        });
        section.musicItems.forEach((music) => refs.add(music.assetId));
      });

      for (const assetId of refs) {
        const meta = manifest.assetRegistry[assetId];
        if (!meta) {
          missing.push(`${assetId}:missing-registry-entry`);
          continue;
        }
        const targetPath = path.join(projectPath, 'assets', `${assetId}.${meta.ext}`);
        try {
          const stat = await fs.stat(targetPath);
          if (stat.size <= 0) missing.push(`${assetId}:empty-file`);
        } catch {
          missing.push(`${assetId}:missing-file`);
        }
      }
      return { missing };
    }
  );

  ipcMain.handle(
    'project:export',
    async (_event, { projectPath, manifest }: { projectPath: string; manifest: ProjectManifest }) => {
      const refs = new Set<string>();
      manifest.sections.forEach((section) => {
        section.timeline.forEach((item) => {
          if (item.type === 'slide' || item.type === 'video') refs.add(item.assetId);
          if (item.type === 'slide') item.dialogueItems.forEach((dialogue) => refs.add(dialogue.assetId));
          if (item.type === 'pageBreak') item.mediaGrid.forEach((tile) => refs.add(tile.assetId));
        });
        section.musicItems.forEach((music) => refs.add(music.assetId));
      });

      const list = [...refs];
      for (const assetId of list) {
        const meta = manifest.assetRegistry[assetId];
        if (!meta) throw new Error(`Export failed: missing asset registry for ${assetId}`);
        const filePath = path.join(projectPath, 'assets', `${assetId}.${meta.ext}`);
        const stat = await fs.stat(filePath);
        if (stat.size <= 0) throw new Error(`Export failed: zero-byte asset ${assetId}`);
      }

      const result = await dialog.showSaveDialog({
        title: 'Export Teaching Studio Package',
        defaultPath: path.join(projectPath, 'export.tstudio')
      });
      if (result.canceled || !result.filePath) throw new Error('Export cancelled');

      const exportPath = result.filePath;
      const tempPath = `${exportPath}.tmp`;
      await new Promise<void>((resolve, reject) => {
        const output = createWriteStream(tempPath);
        const archive = archiver('zip', { zlib: { level: 9 } });
        output.on('close', () => resolve());
        archive.on('error', (error: Error) => reject(error));
        archive.pipe(output);
        archive.file(path.join(projectPath, 'manifest.json'), { name: 'manifest.json' });
        archive.directory(path.join(projectPath, 'assets'), 'assets');
        archive.directory(path.join(projectPath, 'thumbs'), 'thumbs');
        archive.directory(path.join(projectPath, 'autosave'), 'autosave');
        void archive.finalize();
      });
      await fs.rename(tempPath, exportPath);
      const stat = await fs.stat(exportPath);
      const logPath = await writeLog(projectPath, `project:export ${exportPath}`);
      return { exportPath, size: stat.size, validatedAssets: list.length, logPath };
    }
  );

  // Keep stable readDataUrl behavior: locate <assetId>.<ext> from assets folder directly.
  ipcMain.handle('asset:readDataUrl', async (_event, { projectPath, assetId }: { projectPath: string; assetId: string }) => {
    try {
      const assetsDir = path.join(projectPath, 'assets');
      const files = await fs.readdir(assetsDir);
      const fileName = files.find((name) => name.startsWith(`${assetId}.`));
      if (!fileName) throw new Error(`Asset file not found in assets folder for ${assetId}`);
      const ext = path.extname(fileName).replace('.', '').toLowerCase();
      const content = await fs.readFile(path.join(assetsDir, fileName));
      const mime = readMime(ext);
      return `data:${mime};base64,${content.toString('base64')}`;
    } catch (error) {
      throw new Error(`asset:readDataUrl failed: ${(error as Error).message}`);
    }
  });

  ipcMain.handle('app:simulateCrash', async () => {
    app.exit(99);
    return true;
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
