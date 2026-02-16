export type TimelineMode = 'manual' | 'timer' | 'cue';

export interface AssetMeta {
  ext: string;
  mime: string;
  originalFileName: string;
  size: number;
  hash: string;
}

export type AssetRegistry = Record<string, AssetMeta>;

export interface MusicItem {
  id: string;
  assetId: string;
  label: string;
  volume: number;
  loop: boolean;
}

export interface DialogueItem {
  id: string;
  assetId: string;
  label: string;
  volume: number;
}

export interface DialogueLine {
  id: string;
  speaker: string;
  text: string;
}

export interface MediaTile {
  id: string;
  assetId: string;
  fitMode: 'cover' | 'contain';
  crop?: { x: number; y: number; w: number; h: number };
  sizePreset: 'S' | 'M' | 'L';
}

export interface SlideItem {
  id: string;
  type: 'slide';
  assetId: string;
  label: string;
  transition: string;
  durationMs: number;
  panDirection: 'none' | 'left' | 'right' | 'up' | 'down';
  dialogueItems: DialogueItem[];
  dialogueLines: DialogueLine[];
}

export interface VideoItem {
  id: string;
  type: 'video';
  assetId: string;
  label: string;
  startTime: number;
  endTime?: number;
}

export interface PageBreakItem {
  id: string;
  type: 'pageBreak';
  title: string;
  questionsText: string;
  textStyle: string;
  mediaGrid: MediaTile[];
}

export type TimelineItem = SlideItem | VideoItem | PageBreakItem;

export interface Section {
  id: string;
  title: string;
  order: number;
  musicItems: MusicItem[];
  timeline: TimelineItem[];
  settings?: {
    defaultTransition?: string;
    idlePanDefaults?: string;
  };
}

export interface ProjectManifest {
  schemaVersion: number;
  createdAt: string;
  updatedAt: string;
  sections: Section[];
  assetRegistry: AssetRegistry;
}

export interface ProjectState {
  rootPath: string;
  manifest: ProjectManifest;
}
