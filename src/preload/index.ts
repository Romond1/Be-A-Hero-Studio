import { contextBridge, ipcRenderer } from 'electron';
import type { ProjectManifest } from '../renderer/types/domain';

const api = {
  createProject: () => ipcRenderer.invoke('project:create'),
  openProject: () => ipcRenderer.invoke('project:open'),
  importAsset: (projectPath: string) => ipcRenderer.invoke('asset:import', { projectPath }),
  saveManifest: (projectPath: string, manifest: ProjectManifest) =>
    ipcRenderer.invoke('project:save', { projectPath, manifest }),
  autosaveManifest: (projectPath: string, manifest: ProjectManifest) =>
    ipcRenderer.invoke('project:autosave', { projectPath, manifest }),
  recoverProject: (projectPath: string) => ipcRenderer.invoke('project:recover', { projectPath }),
  exportProject: (projectPath: string, manifest: ProjectManifest) =>
    ipcRenderer.invoke('project:export', { projectPath, manifest }),
  healthCheck: (projectPath: string, manifest: ProjectManifest) =>
    ipcRenderer.invoke('project:healthCheck', { projectPath, manifest }),
  getAssetPath: (projectPath: string, assetId: string, ext: string) =>
    ipcRenderer.invoke('asset:path', { projectPath, assetId, ext })
};

contextBridge.exposeInMainWorld('studioApi', api);
