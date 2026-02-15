import { contextBridge, ipcRenderer } from 'electron';
import type { ProjectManifest } from '../renderer/types/domain';

const studioApi = {
  createProject: () => ipcRenderer.invoke('project:create'),
  openProject: () => ipcRenderer.invoke('project:open'),
  importAssets: (projectPath: string) => ipcRenderer.invoke('asset:importMany', { projectPath }),
  saveManifest: (projectPath: string, manifest: ProjectManifest) =>
    ipcRenderer.invoke('project:save', { projectPath, manifest }),
  autosaveManifest: (projectPath: string, manifest: ProjectManifest) =>
    ipcRenderer.invoke('project:autosave', { projectPath, manifest }),
  recoverProject: (projectPath: string) => ipcRenderer.invoke('project:recover', { projectPath }),
  exportProject: (projectPath: string, manifest: ProjectManifest) =>
    ipcRenderer.invoke('project:export', { projectPath, manifest }),
  healthCheck: (projectPath: string, manifest: ProjectManifest) =>
    ipcRenderer.invoke('project:healthCheck', { projectPath, manifest })
};

const studio = {
  assets: {
    readDataUrl: (assetId: string) => ipcRenderer.invoke('assets:readDataUrl', { assetId })
  }
};

contextBridge.exposeInMainWorld('studioApi', studioApi);
contextBridge.exposeInMainWorld('studio', studio);
