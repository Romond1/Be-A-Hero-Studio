import { contextBridge, ipcRenderer } from 'electron';
import type { ProjectManifest } from '../renderer/types/domain';
import { buildInfo } from '../shared/buildInfo';

const studioApi = {
  buildInfo,
  createProject: () => ipcRenderer.invoke('project:create'),
  openProject: () => ipcRenderer.invoke('project:open'),
  importAsset: (projectPath: string) => ipcRenderer.invoke('asset:import', { projectPath }),
  importFolder: (projectPath: string) => ipcRenderer.invoke('asset:importFolder', { projectPath }),
  // Backward-compatible alias
  importAssets: (projectPath: string) => ipcRenderer.invoke('asset:import', { projectPath }),
  saveManifest: (projectPath: string, manifest: ProjectManifest) =>
    ipcRenderer.invoke('project:save', { projectPath, manifest }),
  autosaveManifest: (projectPath: string, manifest: ProjectManifest) =>
    ipcRenderer.invoke('project:autosave', { projectPath, manifest }),
  recoverProject: (projectPath: string) => ipcRenderer.invoke('project:recover', { projectPath }),
  exportProject: (projectPath: string, manifest: ProjectManifest) =>
    ipcRenderer.invoke('project:export', { projectPath, manifest }),
  healthCheck: (projectPath: string, manifest: ProjectManifest) =>
    ipcRenderer.invoke('project:healthCheck', { projectPath, manifest }),
  assets: {
    readDataUrl: (projectPath: string, assetId: string) =>
      ipcRenderer.invoke('asset:readDataUrl', { projectPath, assetId })
  },
  simulateCrash: () => ipcRenderer.invoke('app:simulateCrash'),
  getApiKeys: () => Object.keys(studioApi)
};

contextBridge.exposeInMainWorld('studioApi', studioApi);
