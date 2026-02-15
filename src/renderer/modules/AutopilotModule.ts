import type { StudioModule } from './registry';

export const AutopilotModule: StudioModule = {
  id: 'autopilot',
  name: 'Autopilot Module',
  registerPanels: () => ['autopilot-panel-placeholder'],
  registerServices: () => ['autopilot-service-placeholder']
};
