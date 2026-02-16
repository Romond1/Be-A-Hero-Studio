import type { ProjectManifest } from './domain';

type ImportedAsset = {
  assetId: string;
  ext: string;
  mime: string;
  originalFileName: string;
  size: number;
  hash: string;
  assetPath: string;
};

type BuildInfo = {
  version: string;
  buildHash: string;
  buildTime: string;
};

declare global {
  interface Window {
    studioApi: {
      buildInfo: BuildInfo;
      createProject: () => Promise<{ projectPath: string; manifest: ProjectManifest }>;
      openProject: () => Promise<{ projectPath: string; manifest: ProjectManifest }>;
      importAssets: (projectPath: string) => Promise<ImportedAsset[]>;
      saveManifest: (
        projectPath: string,
        manifest: ProjectManifest
      ) => Promise<{ manifestPath: string; savedAt: string; logPath: string }>;
      autosaveManifest: (
        projectPath: string,
        manifest: ProjectManifest
      ) => Promise<{ autosavePath: string; savedAt: string; logPath: string }>;
      recoverProject: (projectPath: string) => Promise<{ manifest: ProjectManifest; autosavePath: string }>;
      exportProject: (
        projectPath: string,
        manifest: ProjectManifest
      ) => Promise<{ exportPath: string; size: number; validatedAssets: number; logPath: string }>;
      healthCheck: (projectPath: string, manifest: ProjectManifest) => Promise<{ missing: string[] }>;
      assets: {
        readDataUrl: (projectPath: string, assetId: string) => Promise<string>;
      };
      simulateCrash: () => Promise<boolean>;
    };
  }
}

export {};
