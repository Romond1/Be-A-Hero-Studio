import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import archiver from 'archiver';
import { v4 as uuid } from 'uuid';
import type { ProjectManifest } from '../renderer/types/domain';

const isDev = !app.isPackaged;

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
    sections: [
      {
        id: uuid(),
        title: 'Section 1',
        order: 0,
        musicItems: [],
        timeline: []
      }
    ],
    assetRegistry: {}
  };
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
    if (result.canceled || !result.filePaths[0]) {
      throw new Error('Project creation cancelled');
    }
    const projectPath = result.filePaths[0];
    await ensureProjectFolders(projectPath);
    const manifest = defaultManifest();
    await atomicWrite(path.join(projectPath, 'manifest.json'), JSON.stringify(manifest, null, 2));
    await writeLog(projectPath, `project:create ${projectPath}`);
    return { projectPath, manifest };
  });

  ipcMain.handle('project:open', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    if (result.canceled || !result.filePaths[0]) {
      throw new Error('Open cancelled');
    }
    const projectPath = result.filePaths[0];
    const manifestText = await fs.readFile(path.join(projectPath, 'manifest.json'), 'utf-8');
    return { projectPath, manifest: JSON.parse(manifestText) as ProjectManifest };
  });

  ipcMain.handle('asset:import', async (_event, { projectPath }: { projectPath: string }) => {
    const result = await dialog.showOpenDialog({ properties: ['openFile'] });
    if (result.canceled || !result.filePaths[0]) {
      throw new Error('Asset import cancelled');
    }
    const sourcePath = result.filePaths[0];
    const stat = await fs.stat(sourcePath);
    const ext = path.extname(sourcePath).replace('.', '').toLowerCase();
    const assetId = uuid();
    const targetPath = path.join(projectPath, 'assets', `${assetId}.${ext}`);
    const content = await fs.readFile(sourcePath);
    await fs.writeFile(targetPath, content);
    const hash = createHash('sha256').update(content).digest('hex');
    const mime = ext === 'mp4' ? 'video/mp4' : ext === 'mp3' ? 'audio/mpeg' : `image/${ext}`;
    await writeLog(projectPath, `asset:import ${sourcePath} -> ${targetPath}`);
    return {
      assetId,
      ext,
      mime,
      originalFileName: path.basename(sourcePath),
      size: stat.size,
      hash,
      assetPath: targetPath
    };
  });

  ipcMain.handle(
    'project:save',
    async (_event, { projectPath, manifest }: { projectPath: string; manifest: ProjectManifest }) => {
      const nextManifest = { ...manifest, updatedAt: new Date().toISOString() };
      const manifestPath = path.join(projectPath, 'manifest.json');
      await atomicWrite(manifestPath, JSON.stringify(nextManifest, null, 2));
      const logPath = await writeLog(projectPath, `project:save ${manifestPath}`);
      return { manifestPath, savedAt: nextManifest.updatedAt, logPath };
    }
  );

  ipcMain.handle(
    'project:autosave',
    async (_event, { projectPath, manifest }: { projectPath: string; manifest: ProjectManifest }) => {
      const autosaveDir = path.join(projectPath, 'autosave');
      await fs.mkdir(autosaveDir, { recursive: true });
      const payload = JSON.stringify({ ...manifest, updatedAt: new Date().toISOString() }, null, 2);
      const latestPath = path.join(autosaveDir, 'autosave_latest.json');
      await atomicWrite(latestPath, payload);
      for (let index = 10; index >= 2; index -= 1) {
        const from = path.join(autosaveDir, `autosave_${String(index - 1).padStart(3, '0')}.json`);
        const to = path.join(autosaveDir, `autosave_${String(index).padStart(3, '0')}.json`);
        try {
          await fs.rename(from, to);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            throw error;
          }
        }
      }
      await atomicWrite(path.join(autosaveDir, 'autosave_001.json'), payload);
      const savedAt = new Date().toISOString();
      const logPath = await writeLog(projectPath, `project:autosave ${latestPath}`);
      return { autosavePath: latestPath, savedAt, logPath };
    }
  );

  ipcMain.handle('project:recover', async (_event, { projectPath }: { projectPath: string }) => {
    const autosavePath = path.join(projectPath, 'autosave', 'autosave_latest.json');
    const data = await fs.readFile(autosavePath, 'utf-8');
    await writeLog(projectPath, `project:recover ${autosavePath}`);
    return { manifest: JSON.parse(data) as ProjectManifest, autosavePath };
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
      const checks = await (async () => {
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
          if (!meta) {
            throw new Error(`Export failed: missing asset registry for ${assetId}`);
          }
          const filePath = path.join(projectPath, 'assets', `${assetId}.${meta.ext}`);
          const stat = await fs.stat(filePath);
          if (stat.size <= 0) {
            throw new Error(`Export failed: zero-byte asset ${assetId}`);
          }
        }
        return list.length;
      })();

      const result = await dialog.showSaveDialog({
        title: 'Export Teaching Studio Package',
        defaultPath: path.join(projectPath, 'export.tstudio')
      });
      if (result.canceled || !result.filePath) {
        throw new Error('Export cancelled');
      }
      const exportPath = result.filePath;
      const tempPath = `${exportPath}.tmp`;
      await new Promise<void>((resolve, reject) => {
        const output = createWriteStream(tempPath);
        const archive = archiver('zip', { zlib: { level: 9 } });
        output.on('close', () => resolve());
        archive.on('error', (error) => reject(error));
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
      return { exportPath, size: stat.size, validatedAssets: checks, logPath };
    }
  );

  ipcMain.handle('asset:path', async (_event, { projectPath, assetId, ext }) =>
    path.join(projectPath, 'assets', `${assetId}.${ext}`)
  );

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
