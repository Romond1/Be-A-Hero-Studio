import type { ProjectManifest } from '../types/domain';

export async function saveProject(projectPath: string, manifest: ProjectManifest) {
  return window.studioApi.saveManifest(projectPath, manifest);
}

export async function autosaveProject(projectPath: string, manifest: ProjectManifest) {
  return window.studioApi.autosaveManifest(projectPath, manifest);
}

export async function exportProject(projectPath: string, manifest: ProjectManifest) {
  return window.studioApi.exportProject(projectPath, manifest);
}
