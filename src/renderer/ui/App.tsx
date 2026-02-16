import { useEffect, useMemo, useRef, useState } from 'react';
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
import type { SlideItem, TimelineItem } from '../types/domain';
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
    markSaved,
    markAutosaved,
    runHealthCheck,
    registerAsset,
    cacheAssetDataUrl
  } = useStudioStore();

  const [sectionDragIndex, setSectionDragIndex] = useState<number | null>(null);
  const [timelineDragIndex, setTimelineDragIndex] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
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
    if (!selectedItem || selectedItem.type !== 'slide' || !projectPath) return;
    if (assetDataUrlCache[selectedItem.assetId]) return;

    void window.studioApi.assets
      .readDataUrl(projectPath, selectedItem.assetId)
      .then((dataUrl) => {
        cacheAssetDataUrl(selectedItem.assetId, dataUrl);
        console.info(`[renderer:readDataUrl] assetId=${selectedItem.assetId} success=true`);
      })
      .catch((error: Error) => {
        console.error(`[renderer:readDataUrl] assetId=${selectedItem.assetId} success=false ${error.message}`);
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
    console.info(`[timeline-nav] index=${playerRef.current.getIndex()} itemId=${item.id}`);
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

  const importSlides = async () => {
    if (!projectPath) return;
    try {
      const assets = await window.studioApi.importAssets(projectPath);
      for (const asset of assets) {
        registerAsset(asset.assetId, {
          ext: asset.ext,
          mime: asset.mime,
          originalFileName: asset.originalFileName,
          size: asset.size,
          hash: asset.hash
        });
      }

      let inserted = 0;
      for (const asset of assets) {
        const slide: SlideItem = {
          id: uuid(),
          type: 'slide',
          assetId: asset.assetId,
          label: asset.originalFileName,
          transition: 'cut',
          durationMs: 10000,
          panDirection: 'none',
          dialogueItems: []
        };
        addTimelineItemAfterSelection(slide);
        inserted += 1;
      }
      setStatus({ type: 'success', text: `Imported ${inserted} slide(s)` });
    } catch (error) {
      setStatus({ type: 'error', text: (error as Error).message });
    }
  };

  const importMusic = async () => {
    if (!projectPath) return;
    try {
      const assets = await window.studioApi.importAssets(projectPath);
      for (const asset of assets) {
        registerAsset(asset.assetId, {
          ext: asset.ext,
          mime: asset.mime,
          originalFileName: asset.originalFileName,
          size: asset.size,
          hash: asset.hash
        });
        addMusicItem(asset.assetId, asset.originalFileName);
      }
      setStatus({ type: 'success', text: `Imported ${assets.length} music item(s)` });
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

  const slideDataUrl =
    selectedItem?.type === 'slide' ? assetDataUrlCache[selectedItem.assetId] : undefined;

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
                console.info(`[timeline-click] index=${index} itemId=${item.id}`);
              }}
              className={selectedItemId === item.id ? 'selected' : ''}
            >
              {index + 1}. {item.type}: {item.type === 'pageBreak' ? item.title : item.label}
            </div>
          ))}
        </aside>
        <section className="viewer">
          <h3>Viewer Stage (OBS)</h3>
          <div className="stage">
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
          <div className="controls">
            <button onClick={() => nav('prev')}>Prev</button>
            <button onClick={() => nav('next')}>Next</button>
            <button onClick={() => nav('nextPageBreak')}>Jump Next PageBreak</button>
          </div>
        </section>
        <aside>
          <h3>Diagnostics</h3>
          <div>studioApi keys: {diagnosticsApiKeys.join(', ')}</div>
          <div>assets.readDataUrl exists: {String(hasReadDataUrl)}</div>
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
          <h3>Section Music</h3>
          {section?.musicItems.map((music) => (
            <div key={music.id}>{music.label}</div>
          ))}
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
