import { create } from 'zustand';
import { v4 as uuid } from 'uuid';
import type { DialogueLine, PageBreakItem, ProjectManifest, Section, SlideItem, TimelineItem } from '../../types/domain';
import { validateManifest } from '../../core/validators';

interface StatusMessage {
  type: 'success' | 'error' | 'info';
  text: string;
}

interface StudioStore {
  projectPath?: string;
  manifest: ProjectManifest;
  selectedSectionId?: string;
  selectedItemId?: string;
  currentTimelineIndex: number;
  assetDataUrlCache: Record<string, string>;
  lastSavedAt?: string;
  lastAutosaveAt?: string;
  status?: StatusMessage;
  healthIssues: string[];
  setStatus: (status: StatusMessage) => void;
  setManifest: (projectPath: string, manifest: ProjectManifest) => void;
  hydrateRecovered: (projectPath: string, manifest: ProjectManifest) => void;
  addSection: () => void;
  renameSection: (id: string, title: string) => void;
  reorderSections: (sourceIndex: number, targetIndex: number) => void;
  selectSection: (sectionId: string) => void;
  selectItem: (itemId?: string) => void;
  setCurrentTimelineIndex: (index: number) => void;
  addTimelineItemAfterSelection: (item: TimelineItem) => void;
  addPageBreak: () => void;
  updatePageBreak: (id: string, patch: Partial<PageBreakItem>) => void;
  reorderTimeline: (source: number, target: number) => void;
  addMusicItem: (assetId: string, label: string) => void;
  removeMusicItem: (musicId: string) => void;
  reorderMusicItem: (from: number, to: number) => void;
  addDialogueLine: (slideId: string) => void;
  updateDialogueLine: (slideId: string, lineId: string, patch: Partial<DialogueLine>) => void;
  removeDialogueLine: (slideId: string, lineId: string) => void;
  markSaved: (at: string) => void;
  markAutosaved: (at: string) => void;
  runHealthCheck: () => void;
  registerAsset: (assetId: string, meta: ProjectManifest['assetRegistry'][string]) => void;
  cacheAssetDataUrl: (assetId: string, dataUrl: string) => void;
}

const blankManifest = (): ProjectManifest => ({
  schemaVersion: 1,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  sections: [{ id: uuid(), title: 'Section 1', order: 0, musicItems: [], timeline: [] }],
  assetRegistry: {}
});

function withSelectedSection(manifest: ProjectManifest, sectionId?: string): Section {
  const section = manifest.sections.find((item) => item.id === sectionId) ?? manifest.sections[0];
  if (!section) throw new Error('No section available');
  return section;
}

export const useStudioStore = create<StudioStore>((set, get) => ({
  manifest: blankManifest(),
  selectedSectionId: undefined,
  selectedItemId: undefined,
  currentTimelineIndex: 0,
  assetDataUrlCache: {},
  healthIssues: [],
  setStatus: (status) => set({ status }),
  setManifest: (projectPath, manifest) => {
    const firstSectionId = manifest.sections[0]?.id;
    const firstItemId = manifest.sections[0]?.timeline[0]?.id;
    set({
      projectPath,
      manifest,
      selectedSectionId: firstSectionId,
      selectedItemId: firstItemId,
      currentTimelineIndex: firstItemId ? 0 : 0,
      healthIssues: validateManifest(manifest),
      assetDataUrlCache: {}
    });
  },
  hydrateRecovered: (projectPath, manifest) => {
    const firstSection = manifest.sections[0];
    set({
      projectPath,
      manifest,
      selectedSectionId: firstSection?.id,
      selectedItemId: firstSection?.timeline[0]?.id,
      currentTimelineIndex: 0,
      healthIssues: validateManifest(manifest),
      assetDataUrlCache: {}
    });
  },
  addSection: () =>
    set((state) => {
      const section = {
        id: uuid(),
        title: `Section ${state.manifest.sections.length + 1}`,
        order: state.manifest.sections.length,
        musicItems: [],
        timeline: []
      };
      return {
        manifest: {
          ...state.manifest,
          updatedAt: new Date().toISOString(),
          sections: [...state.manifest.sections, section]
        },
        selectedSectionId: section.id,
        selectedItemId: undefined,
        currentTimelineIndex: 0
      };
    }),
  renameSection: (id, title) =>
    set((state) => ({
      manifest: {
        ...state.manifest,
        updatedAt: new Date().toISOString(),
        sections: state.manifest.sections.map((item) => (item.id === id ? { ...item, title } : item))
      }
    })),
  reorderSections: (sourceIndex, targetIndex) =>
    set((state) => {
      const sections = [...state.manifest.sections];
      const [removed] = sections.splice(sourceIndex, 1);
      sections.splice(targetIndex, 0, removed);
      return {
        manifest: {
          ...state.manifest,
          updatedAt: new Date().toISOString(),
          sections: sections.map((section, index) => ({ ...section, order: index }))
        }
      };
    }),
  selectSection: (selectedSectionId) =>
    set((state) => {
      const section = state.manifest.sections.find((item) => item.id === selectedSectionId);
      return {
        selectedSectionId,
        selectedItemId: section?.timeline[0]?.id,
        currentTimelineIndex: 0
      };
    }),
  selectItem: (selectedItemId) =>
    set((state) => {
      const section = withSelectedSection(state.manifest, state.selectedSectionId);
      const index = section.timeline.findIndex((item) => item.id === selectedItemId);
      return {
        selectedItemId,
        currentTimelineIndex: index >= 0 ? index : state.currentTimelineIndex
      };
    }),
  setCurrentTimelineIndex: (currentTimelineIndex) =>
    set((state) => {
      const section = withSelectedSection(state.manifest, state.selectedSectionId);
      const clamped = Math.max(0, Math.min(currentTimelineIndex, Math.max(0, section.timeline.length - 1)));
      return {
        currentTimelineIndex: clamped,
        selectedItemId: section.timeline[clamped]?.id
      };
    }),
  addTimelineItemAfterSelection: (item) =>
    set((state) => {
      const section = withSelectedSection(state.manifest, state.selectedSectionId);
      const index = section.timeline.findIndex((timelineItem) => timelineItem.id === state.selectedItemId);
      const insertAt = index >= 0 ? index + 1 : section.timeline.length;
      const timeline = [...section.timeline];
      timeline.splice(insertAt, 0, item);
      return {
        manifest: {
          ...state.manifest,
          updatedAt: new Date().toISOString(),
          sections: state.manifest.sections.map((value) =>
            value.id === section.id ? { ...value, timeline } : value
          )
        },
        selectedItemId: item.id,
        currentTimelineIndex: insertAt
      };
    }),
  addPageBreak: () => {
    const pageBreak: PageBreakItem = {
      id: uuid(),
      type: 'pageBreak',
      title: 'Page Break',
      questionsText: '',
      textStyle: 'default',
      mediaGrid: []
    };
    get().addTimelineItemAfterSelection(pageBreak);
  },
  updatePageBreak: (id, patch) =>
    set((state) => ({
      manifest: {
        ...state.manifest,
        updatedAt: new Date().toISOString(),
        sections: state.manifest.sections.map((section) => ({
          ...section,
          timeline: section.timeline.map((item) =>
            item.type === 'pageBreak' && item.id === id ? { ...item, ...patch } : item
          )
        }))
      }
    })),
  reorderTimeline: (source, target) =>
    set((state) => {
      const section = withSelectedSection(state.manifest, state.selectedSectionId);
      const timeline = [...section.timeline];
      const [removed] = timeline.splice(source, 1);
      timeline.splice(target, 0, removed);
      return {
        manifest: {
          ...state.manifest,
          updatedAt: new Date().toISOString(),
          sections: state.manifest.sections.map((item) =>
            item.id === section.id ? { ...item, timeline } : item
          )
        },
        currentTimelineIndex: target,
        selectedItemId: timeline[target]?.id
      };
    }),
  addMusicItem: (assetId, label) =>
    set((state) => {
      const section = withSelectedSection(state.manifest, state.selectedSectionId);
      return {
        manifest: {
          ...state.manifest,
          updatedAt: new Date().toISOString(),
          sections: state.manifest.sections.map((entry) =>
            entry.id === section.id
              ? {
                  ...entry,
                  musicItems: [...entry.musicItems, { id: uuid(), assetId, label, loop: true, volume: 1 }]
                }
              : entry
          )
        }
      };
    }),
  removeMusicItem: (musicId) =>
    set((state) => {
      const section = withSelectedSection(state.manifest, state.selectedSectionId);
      return {
        manifest: {
          ...state.manifest,
          updatedAt: new Date().toISOString(),
          sections: state.manifest.sections.map((entry) =>
            entry.id === section.id
              ? { ...entry, musicItems: entry.musicItems.filter((music) => music.id !== musicId) }
              : entry
          )
        }
      };
    }),
  reorderMusicItem: (from, to) =>
    set((state) => {
      const section = withSelectedSection(state.manifest, state.selectedSectionId);
      const items = [...section.musicItems];
      if (!items.length) return state;
      const [removed] = items.splice(from, 1);
      items.splice(to, 0, removed);
      return {
        manifest: {
          ...state.manifest,
          updatedAt: new Date().toISOString(),
          sections: state.manifest.sections.map((entry) =>
            entry.id === section.id ? { ...entry, musicItems: items } : entry
          )
        }
      };
    }),
  addDialogueLine: (slideId) =>
    set((state) => ({
      manifest: {
        ...state.manifest,
        updatedAt: new Date().toISOString(),
        sections: state.manifest.sections.map((section) => ({
          ...section,
          timeline: section.timeline.map((item) => {
            if (item.type !== 'slide' || item.id !== slideId) return item;
            const slide = item as SlideItem;
            return {
              ...slide,
              dialogueLines: [...(slide.dialogueLines ?? []), { id: uuid(), speaker: 'Speaker', text: '' }]
            };
          })
        }))
      }
    })),
  updateDialogueLine: (slideId, lineId, patch) =>
    set((state) => ({
      manifest: {
        ...state.manifest,
        updatedAt: new Date().toISOString(),
        sections: state.manifest.sections.map((section) => ({
          ...section,
          timeline: section.timeline.map((item) => {
            if (item.type !== 'slide' || item.id !== slideId) return item;
            const slide = item as SlideItem;
            return {
              ...slide,
              dialogueLines: (slide.dialogueLines ?? []).map((line) =>
                line.id === lineId ? { ...line, ...patch } : line
              )
            };
          })
        }))
      }
    })),
  removeDialogueLine: (slideId, lineId) =>
    set((state) => ({
      manifest: {
        ...state.manifest,
        updatedAt: new Date().toISOString(),
        sections: state.manifest.sections.map((section) => ({
          ...section,
          timeline: section.timeline.map((item) => {
            if (item.type !== 'slide' || item.id !== slideId) return item;
            const slide = item as SlideItem;
            return { ...slide, dialogueLines: (slide.dialogueLines ?? []).filter((line) => line.id !== lineId) };
          })
        }))
      }
    })),
  markSaved: (lastSavedAt) => set({ lastSavedAt }),
  markAutosaved: (lastAutosaveAt) => set({ lastAutosaveAt }),
  registerAsset: (assetId, meta) =>
    set((state) => ({
      manifest: {
        ...state.manifest,
        updatedAt: new Date().toISOString(),
        assetRegistry: { ...state.manifest.assetRegistry, [assetId]: meta }
      }
    })),
  cacheAssetDataUrl: (assetId, dataUrl) =>
    set((state) => ({ assetDataUrlCache: { ...state.assetDataUrlCache, [assetId]: dataUrl } })),
  runHealthCheck: () => {
    const manifest = get().manifest;
    set({ healthIssues: validateManifest(manifest) });
  }
}));
