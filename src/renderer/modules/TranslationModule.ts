import type { StudioModule } from './registry';

export const TranslationModule: StudioModule = {
  id: 'translation',
  name: 'Translation Module',
  registerPanels: () => ['translation-panel-placeholder'],
  registerServices: () => ['translation-service-placeholder']
};
