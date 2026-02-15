import type { ProjectManifest } from '../types/domain';

export function validateManifest(manifest: ProjectManifest): string[] {
  const errors: string[] = [];
  if (!manifest.sections.length) {
    errors.push('Project must contain at least one section.');
  }
  for (const section of manifest.sections) {
    for (const item of section.timeline) {
      if (item.type === 'slide' || item.type === 'video') {
        if (!manifest.assetRegistry[item.assetId]) {
          errors.push(`Missing asset ${item.assetId} for ${section.title}/${item.label}`);
        }
      }
      if (item.type === 'slide') {
        for (const dialogue of item.dialogueItems) {
          if (!manifest.assetRegistry[dialogue.assetId]) {
            errors.push(`Missing dialogue asset ${dialogue.assetId} for ${item.label}`);
          }
        }
      }
      if (item.type === 'pageBreak') {
        for (const tile of item.mediaGrid) {
          if (!manifest.assetRegistry[tile.assetId]) {
            errors.push(`Missing media tile asset ${tile.assetId} for ${item.title}`);
          }
        }
      }
    }
    for (const music of section.musicItems) {
      if (!manifest.assetRegistry[music.assetId]) {
        errors.push(`Missing music asset ${music.assetId} for section ${section.title}`);
      }
    }
  }
  return errors;
}
