export interface StudioModule {
  id: string;
  name: string;
  registerPanels(): string[];
  registerServices(): string[];
}

export class ModuleRegistry {
  private modules: StudioModule[] = [];

  register(module: StudioModule): void {
    this.modules.push(module);
  }

  all(): StudioModule[] {
    return [...this.modules];
  }
}
