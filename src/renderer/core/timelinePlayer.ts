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

    const sectionChanged = this.section?.id !== section.id;
    this.section = section;

    // Do not reset index on every navigation refresh; only when section changes.
    if (sectionChanged) {
      this.index = 0;
      this.status = 'stopped';
      return;
    }

    if (section.timeline.length === 0) {
      this.index = 0;
      return;
    }

    this.index = Math.min(this.index, section.timeline.length - 1);
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
    if (!this.section || this.section.timeline.length === 0) return undefined;
    this.index = Math.min(this.index + 1, this.section.timeline.length - 1);
    return this.current();
  }

  prev(): TimelineItem | undefined {
    this.ensureSectionLoaded();
    if (!this.section || this.section.timeline.length === 0) return undefined;
    this.index = Math.max(0, this.index - 1);
    return this.current();
  }

  goto(itemId: string): TimelineItem | undefined {
    this.ensureSectionLoaded();
    if (!this.section) return undefined;
    const itemIndex = this.section.timeline.findIndex((item) => item.id === itemId);
    if (itemIndex >= 0) {
      this.index = itemIndex;
      return this.current();
    }
    throw new Error(`Item ${itemId} not found in active section`);
  }

  gotoIndex(index: number): TimelineItem | undefined {
    this.ensureSectionLoaded();
    if (!this.section || this.section.timeline.length === 0) return undefined;
    this.index = Math.max(0, Math.min(index, this.section.timeline.length - 1));
    return this.current();
  }

  first(): TimelineItem | undefined {
    return this.gotoIndex(0);
  }

  last(): TimelineItem | undefined {
    this.ensureSectionLoaded();
    if (!this.section) return undefined;
    return this.gotoIndex(this.section.timeline.length - 1);
  }


  jumpNextPageBreak(): TimelineItem | undefined {
    return this.nextPageBreak();
  }

  nextPageBreak(): TimelineItem | undefined {
    this.ensureSectionLoaded();
    if (!this.section) return undefined;
    const nextIndex = this.section.timeline.findIndex(
      (item, idx) => idx > this.index && item.type === 'pageBreak'
    );
    if (nextIndex >= 0) {
      this.index = nextIndex;
      return this.current();
    }
    return undefined;
  }

  setMode(mode: TimelineMode): void {
    this.mode = mode;
  }

  current(): TimelineItem | undefined {
    return this.section?.timeline[this.index];
  }

  getIndex(): number {
    return this.index;
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
