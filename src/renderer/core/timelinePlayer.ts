import type { Section, TimelineItem, TimelineMode } from '../types/domain';

export class TimelinePlayer {
  private mode: TimelineMode = 'manual';
  private section?: Section;
  private index = 0;
  private status: 'playing' | 'paused' | 'stopped' = 'stopped';

  loadSection(sectionId: string, sections: Section[]): void {
    const section = sections.find((item) => item.id === sectionId);
    if (!section) {
      throw new Error(`Section not found: ${sectionId}`);
    }
    this.section = section;
    this.index = 0;
    this.status = 'stopped';
  }

  play(): void {
    this.ensureSectionLoaded();
    this.status = 'playing';
  }

  pause(): void {
    this.ensureSectionLoaded();
    this.status = 'paused';
  }

  stop(): void {
    this.ensureSectionLoaded();
    this.status = 'stopped';
    this.index = 0;
  }

  next(): TimelineItem | undefined {
    this.ensureSectionLoaded();
    if (!this.section) {
      return undefined;
    }
    this.index = Math.min(this.index + 1, Math.max(0, this.section.timeline.length - 1));
    return this.current();
  }

  prev(): TimelineItem | undefined {
    this.ensureSectionLoaded();
    this.index = Math.max(0, this.index - 1);
    return this.current();
  }

  goto(itemId: string): TimelineItem | undefined {
    this.ensureSectionLoaded();
    if (!this.section) {
      return undefined;
    }
    const itemIndex = this.section.timeline.findIndex((item) => item.id === itemId);
    if (itemIndex >= 0) {
      this.index = itemIndex;
      return this.current();
    }
    throw new Error(`Item ${itemId} not found in active section`);
  }

  setMode(mode: TimelineMode): void {
    this.mode = mode;
  }

  current(): TimelineItem | undefined {
    return this.section?.timeline[this.index];
  }

  getState(): { mode: TimelineMode; status: string; index: number } {
    return { mode: this.mode, status: this.status, index: this.index };
  }

  private ensureSectionLoaded(): void {
    if (!this.section) {
      throw new Error('No section loaded into timeline player');
    }
  }
}
