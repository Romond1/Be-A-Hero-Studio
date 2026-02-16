import { useEffect, useMemo, useRef, useState } from 'react';
import type { WheelEvent as ReactWheelEvent } from 'react';
import { v4 as uuid } from 'uuid';
import { TimelinePlayer } from '../core/timelinePlayer';
import { AutopilotModule } from '../modules/AutopilotModule';
import { ModuleRegistry } from '../modules/registry';
import { TranslationModule } from '../modules/TranslationModule';
import {
  autosaveProject,
  exportProject as exportProjectFile,
  saveProject as saveProjectFile
} from '../persistence/projectClient';
import type { DialogueLine, SlideItem, TimelineItem } from '../types/domain';
import { useStudioStore } from './store/studioStore';
import { buildInfo as localBuildInfo } from '../../shared/buildInfo';

const moduleRegistry = new ModuleRegistry();
moduleRegistry.register(TranslationModule);
moduleRegistry.register(AutopilotModule);

const autosaveEveryMs = 30000;

function formatBuildTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(
    date.getMinutes()
  )}`;
}

type ZoomState = { scale: number; x: number; y: number };

export function App() {
  const {
    projectPath,
    manifest,
    selectedSectionId,
    selectedItemId,
    currentTimelineIndex,
    assetDataUrlCache,
    status,
    healthIssues,
    lastSavedAt,
    lastAutosaveAt,
    setManifest,
    hydrateRecovered,
    setStatus,
    addSection,
    renameSection,
    reorderSections,
    selectSection,
    selectItem,
    setCurrentTimelineIndex,
    addTimelineItemAfterSelection,
    addPageBreak,
    updatePageBreak,
    reorderTimeline,
    addMusicItem,
    removeMusicItem,
    reorderMusicItem,
    addDialogueLine,
    updateDialogueLine,
    removeDialogueLine,
    markSaved,
    markAutosaved,
    runHealthCheck,
    registerAsset,
    cacheAssetDataUrl
  } = useStudioStore();

  const [sectionDragIndex, setSectionDragIndex] = useState<number | null>(null);
  const [timelineDragIndex, setTimelineDragIndex] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [zoom, setZoom] = useState<ZoomState>({ scale: 1, x: 0, y: 0 });
  const [musicOpen, setMusicOpen] = useState(true);
  const [dialogueOpen, setDialogueOpen] = useState(true);
  const [musicPreviewId, setMusicPreviewId] = useState<string | null>(null);
  const playerRef = useRef(new TimelinePlayer());
  const dirtyRef = useRef(false);

  const build = window.studioApi.buildInfo ?? localBuildInfo;
  const diagnosticsApiKeys = window.studioApi.getApiKeys();
  const hasReadDataUrl = typeof window.studioApi.assets?.readDataUrl === 'function';

  const section = useMemo(
    () => manifest.sections.find((item) => item.id === selectedSectionId) ?? manifest.sections[0],
    [manifest.sections, selectedSectionId]
  );

  const selectedItem = section?.timeline.find((item) => item.id === selectedItemId);
  const selectedSlide = selectedItem?.type === 'slide' ? selectedItem : undefined;

  useEffect(() => {
    if (!section) return;
    try {
      playerRef.current.loadSection(section.id, manifest.sections);
      if (selectedItemId) {
        playerRef.current.goto(selectedItemId);
      } else {
        const first = playerRef.current.first();
        if (first) selectItem(first.id);
      }
    } catch (error) {
      setStatus({ type: 'error', text: (error as Error).message });
    }
  }, [section?.id, manifest.sections, selectedItemId, selectItem, setStatus]);

  useEffect(() => {
    setZoom({ scale: 1, x: 0, y: 0 });
  }, [selectedItemId]);

  useEffect(() => {
    if (!selectedItem || selectedItem.type !== 'slide' || !projectPath) return;
    if (assetDataUrlCache[selectedItem.assetId]) return;

    void window.studioApi.assets
      .readDataUrl(projectPath, selectedItem.assetId)
      .then((dataUrl) => {
        cacheAssetDataUrl(selectedItem.assetId, dataUrl);
      })
      .catch((error: Error) => {
        setStatus({ type: 'error', text: error.message });
      });
  }, [assetDataUrlCache, cacheAssetDataUrl, selectedItem, projectPath, setStatus]);

  useEffect(() => {
    dirtyRef.current = true;
    const handle = setTimeout(async () => {
      if (!projectPath || !dirtyRef.current) return;
      try {
        const result = await autosaveProject(projectPath, manifest);
        markAutosaved(result.savedAt);
        setStatus({ type: 'info', text: `Autosaved: ${result.autosavePath}` });
        dirtyRef.current = false;
      } catch (error) {
        setStatus({ type: 'error', text: (error as Error).message });
      }
    }, 1500);
    return () => clearTimeout(handle);
  }, [manifest, projectPath, markAutosaved, setStatus]);

  useEffect(() => {
    const interval = setInterval(async () => {
      if (!projectPath) return;
      try {
        const result = await autosaveProject(projectPath, manifest);
        markAutosaved(result.savedAt);
      } catch (error) {
        setStatus({ type: 'error', text: (error as Error).message });
      }
    }, autosaveEveryMs);
    return () => clearInterval(interval);
  }, [manifest, markAutosaved, projectPath, setStatus]);

  const moveToItem = (item: TimelineItem | undefined) => {
    if (!item) return;
    selectItem(item.id);
    setCurrentTimelineIndex(playerRef.current.getIndex());
  };

  const nav = (action: 'next' | 'prev' | 'first' | 'last' | 'nextPageBreak') => {
    if (!section) return;
    try {
      let item: TimelineItem | undefined;
      if (action === 'next') item = playerRef.current.next();
      if (action === 'prev') item = playerRef.current.prev();
      if (action === 'first') item = playerRef.current.first();
      if (action === 'last') item = playerRef.current.last();
      if (action === 'nextPageBreak') item = playerRef.current.jumpNextPageBreak();
      moveToItem(item);
    } catch (error) {
      setStatus({ type: 'error', text: (error as Error).message });
    }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        nav('next');
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        nav('prev');
      } else if (event.key === 'Home') {
        event.preventDefault();
        nav('first');
      } else if (event.key === 'End') {
        event.preventDefault();
        nav('last');
      } else if (event.key === ' ') {
        event.preventDefault();
        if (isPlaying) {
          playerRef.current.pause();
          setIsPlaying(false);
        } else {
          playerRef.current.play();
          setIsPlaying(true);
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isPlaying]);

  const createProject = async () => {
    try {
      const result = await window.studioApi.createProject();
      setManifest(result.projectPath, result.manifest);
      setStatus({ type: 'success', text: `Project created at ${result.projectPath}` });
    } catch (error) {
      setStatus({ type: 'error', text: (error as Error).message });
    }
  };

  const openProject = async () => {
    try {
      const result = await window.studioApi.openProject();
      setManifest(result.projectPath, result.manifest);
      setStatus({ type: 'success', text: `Opened ${result.projectPath}` });
    } catch (error) {
      setStatus({ type: 'error', text: (error as Error).message });
    }
  };

  const saveProject = async () => {
    if (!projectPath) return;
    try {
      const result = await saveProjectFile(projectPath, manifest);
      markSaved(result.savedAt);
      setStatus({ type: 'success', text: `Saved manifest: ${result.manifestPath}` });
    } catch (error) {
      setStatus({ type: 'error', text: (error as Error).message });
    }
  };

  const recoverProject = async () => {
    if (!projectPath) return;
    try {
      const result = await window.studioApi.recoverProject(projectPath);
      hydrateRecovered(projectPath, result.manifest);
      setStatus({ type: 'success', text: `Recovered from ${result.autosavePath}` });
    } catch (error) {
      setStatus({ type: 'error', text: (error as Error).message });
    }
  };

  const exportProject = async () => {
    if (!projectPath) return;
    try {
      const result = await exportProjectFile(projectPath, manifest);
      setStatus({
        type: 'success',
        text: `Exported ${result.exportPath} (${result.size} bytes, ${result.validatedAssets} assets validated)`
      });
    } catch (error) {
      setStatus({ type: 'error', text: (error as Error).message });
    }
  };

  async function chooseImportModeAndImport(): Promise<
    {
      assetId: string;
      ext: string;
      mime: string;
      originalFileName: string;
      size: number;
      hash: string;
      assetPath: string;
    }[]
  > {
    if (!projectPath) return [];
    const folderMode = window.confirm('Import folder? Click OK for folder, Cancel for files.');
    return folderMode ? window.studioApi.importFolder(projectPath) : window.studioApi.importAsset(projectPath);
  }

  const importSlides = async () => {
    if (!projectPath) return;
    try {
      const assets = await chooseImportModeAndImport();
      const imageAssets = assets.filter((asset) => asset.mime.startsWith('image/'));
      for (const asset of imageAssets) {
        registerAsset(asset.assetId, {
          ext: asset.ext,
          mime: asset.mime,
          originalFileName: asset.originalFileName,
          size: asset.size,
          hash: asset.hash
        });
      }
      for (const asset of imageAssets) {
        const slide: SlideItem = {
          id: uuid(),
          type: 'slide',
          assetId: asset.assetId,
          label: asset.originalFileName,
          transition: 'cut',
          durationMs: 10000,
          panDirection: 'none',
          dialogueItems: [],
          dialogueLines: []
        };
        addTimelineItemAfterSelection(slide);
      }
      setStatus({ type: 'success', text: `Imported ${imageAssets.length} slide(s)` });
    } catch (error) {
      setStatus({ type: 'error', text: (error as Error).message });
    }
  };

  const importMusic = async () => {
    if (!projectPath) return;
    try {
      const assets = await chooseImportModeAndImport();
      const audioAssets = assets.filter((asset) => asset.mime.startsWith('audio/'));
      for (const asset of audioAssets) {
        registerAsset(asset.assetId, {
          ext: asset.ext,
          mime: asset.mime,
          originalFileName: asset.originalFileName,
          size: asset.size,
          hash: asset.hash
        });
        addMusicItem(asset.assetId, asset.originalFileName);
      }
      setStatus({ type: 'success', text: `Imported ${audioAssets.length} music item(s)` });
    } catch (error) {
      setStatus({ type: 'error', text: (error as Error).message });
    }
  };

  const checkHealth = async () => {
    if (!projectPath) return;
    try {
      const result = await window.studioApi.healthCheck(projectPath, manifest);
      runHealthCheck();
      setStatus({
        type: result.missing.length ? 'error' : 'success',
        text: result.missing.length ? `Missing assets: ${result.missing.join(', ')}` : 'Project health check passed'
      });
    } catch (error) {
      setStatus({ type: 'error', text: (error as Error).message });
    }
  };

  const onViewerWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const cursorX = event.clientX - rect.left;
    const cursorY = event.clientY - rect.top;

    setZoom((prev) => {
      const factor = event.deltaY < 0 ? 1.1 : 0.9;
      const nextScale = Math.min(4, Math.max(0.25, prev.scale * factor));
      const worldX = (cursorX - prev.x) / prev.scale;
      const worldY = (cursorY - prev.y) / prev.scale;
      return {
        scale: nextScale,
        x: cursorX - worldX * nextScale,
        y: cursorY - worldY * nextScale
      };
    });
  };

  const slideDataUrl = selectedItem?.type === 'slide' ? assetDataUrlCache[selectedItem.assetId] : undefined;

  const dialogueLines: DialogueLine[] = selectedSlide?.dialogueLines ?? [];

  return (
    <div className="app">
      <div className="build-banner">
        BUILD {build.buildHash} | v{build.version} | {formatBuildTime(build.buildTime)}
      </div>
      <header>
        <button onClick={createProject}>Create Project</button>
        <button onClick={openProject}>Open</button>
        <button onClick={saveProject}>Save</button>
        <button onClick={recoverProject}>Recover Autosave</button>
        <button onClick={exportProject}>Export .tstudio</button>
        <button onClick={checkHealth}>Health Check</button>
        <button onClick={importSlides}>Import Slides</button>
        <button onClick={importMusic}>Import Music</button>
        <button onClick={addPageBreak}>Add PageBreak</button>
        {import.meta.env.DEV && <button onClick={() => void window.studioApi.simulateCrash()}>Simulate Crash</button>}
      </header>
      <div className="timestamps">
        <span>Project: {projectPath ?? 'none'}</span>
        <span>Index: {currentTimelineIndex}</span>
        <span>Last Save: {lastSavedAt ?? 'n/a'}</span>
        <span>Last Autosave: {lastAutosaveAt ?? 'n/a'}</span>
      </div>
      {status && <div className={`status ${status.type}`}>{status.text}</div>}
      <main>
        <aside>
          <h3>Sections</h3>
          <button onClick={addSection}>+ Add Section</button>
          {manifest.sections.map((item, index) => (
            <div
              key={item.id}
              draggable
              onDragStart={() => setSectionDragIndex(index)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (sectionDragIndex !== null) reorderSections(sectionDragIndex, index);
              }}
              className={selectedSectionId === item.id ? 'selected' : ''}
              onClick={() => selectSection(item.id)}
            >
              <input value={item.title} onChange={(event) => renameSection(item.id, event.target.value)} />
            </div>
          ))}
          <h3>Timeline</h3>
          {section?.timeline.map((item, index) => (
            <div
              key={item.id}
              draggable
              onDragStart={() => setTimelineDragIndex(index)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (timelineDragIndex !== null) reorderTimeline(timelineDragIndex, index);
              }}
              onClick={() => {
                selectItem(item.id);
                setCurrentTimelineIndex(index);
                playerRef.current.gotoIndex(index);
              }}
              className={selectedItemId === item.id ? 'selected' : ''}
            >
              {index + 1}. {item.type}: {item.type === 'pageBreak' ? item.title : item.label}
            </div>
          ))}
        </aside>
        <section className="viewer">
          <h3>Viewer Stage (OBS)</h3>
          <div className="stage" onWheel={onViewerWheel}>
            <div
              className="stage-transform"
              style={{ transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})`, transformOrigin: '0 0' }}
            >
              {selectedItem ? (
                selectedItem.type === 'slide' ? (
                  slideDataUrl ? (
                    <img src={slideDataUrl} alt={selectedItem.label} className="slide-img" />
                  ) : (
                    <p>Loading image…</p>
                  )
                ) : selectedItem.type === 'pageBreak' ? (
                  <div>
                    <h2>{selectedItem.title}</h2>
                    <p>{selectedItem.questionsText}</p>
                  </div>
                ) : (
                  <div>
                    <h2>{selectedItem.label}</h2>
                    <p>Asset: {selectedItem.assetId}</p>
                  </div>
                )
              ) : (
                <p>Select timeline item</p>
              )}
            </div>
          </div>
        </section>
        <aside>
          <h3>Diagnostics</h3>
          <div>studioApi keys: {diagnosticsApiKeys.join(', ')}</div>
          <div>assets.readDataUrl exists: {String(hasReadDataUrl)}</div>

          <button className="collapsible" onClick={() => setMusicOpen((value) => !value)}>
            {musicOpen ? '▼' : '▶'} Music
          </button>
          {musicOpen && (
            <div className="panel-list">
              {section?.musicItems.map((music, index) => (
                <div key={music.id} className="row">
                  <span>{music.label}</span>
                  <button onClick={() => setMusicPreviewId((v) => (v === music.id ? null : music.id))}>
                    {musicPreviewId === music.id ? 'Stop' : 'Play'}
                  </button>
                  <button onClick={() => removeMusicItem(music.id)}>Remove</button>
                  <button disabled={index === 0} onClick={() => reorderMusicItem(index, index - 1)}>
                    ↑
                  </button>
                  <button
                    disabled={index === (section.musicItems.length - 1)}
                    onClick={() => reorderMusicItem(index, index + 1)}
                  >
                    ↓
                  </button>
                </div>
              ))}
            </div>
          )}

          <button className="collapsible" onClick={() => setDialogueOpen((value) => !value)}>
            {dialogueOpen ? '▼' : '▶'} Dialogue
          </button>
          {dialogueOpen && (
            <div className="panel-list">
              {selectedSlide ? (
                <>
                  <button onClick={() => addDialogueLine(selectedSlide.id)}>+ Add Dialogue Line</button>
                  {dialogueLines.map((line) => (
                    <div key={line.id} className="dialogue-line">
                      <input
                        value={line.speaker}
                        onChange={(event) =>
                          updateDialogueLine(selectedSlide.id, line.id, { speaker: event.target.value })
                        }
                        placeholder="Speaker"
                      />
                      <textarea
                        value={line.text}
                        onChange={(event) =>
                          updateDialogueLine(selectedSlide.id, line.id, { text: event.target.value })
                        }
                        placeholder="Dialogue text"
                      />
                      <button onClick={() => removeDialogueLine(selectedSlide.id, line.id)}>Delete</button>
                    </div>
                  ))}
                </>
              ) : (
                <div>Select a slide to edit dialogue.</div>
              )}
            </div>
          )}

          <h3>Properties</h3>
          {selectedItem?.type === 'pageBreak' && (
            <>
              <label>Title</label>
              <input
                value={selectedItem.title}
                onChange={(event) => updatePageBreak(selectedItem.id, { title: event.target.value })}
              />
              <label>Questions</label>
              <textarea
                value={selectedItem.questionsText}
                onChange={(event) => updatePageBreak(selectedItem.id, { questionsText: event.target.value })}
              />
              <label>Text Style</label>
              <input
                value={selectedItem.textStyle}
                onChange={(event) => updatePageBreak(selectedItem.id, { textStyle: event.target.value })}
              />
            </>
          )}

          <h3>Modules</h3>
          {moduleRegistry.all().map((module) => (
            <div key={module.id}>{module.name}</div>
          ))}
          <h3>Health Issues</h3>
          {healthIssues.map((issue) => (
            <div key={issue}>{issue}</div>
          ))}
        </aside>
      </main>
    </div>
  );
}
