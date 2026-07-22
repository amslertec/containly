import { z } from 'zod';

/** Ein Eintrag (Datei oder Ordner) beim Durchsuchen eines Named Volumes. */
export const VolumeFileSchema = z.object({
  name: z.string(),
  isDir: z.boolean(),
  size: z.number(),
  mtime: z.number(), // Unix-Sekunden
});
export type VolumeFile = z.infer<typeof VolumeFileSchema>;

/** Auflistung eines Verzeichnisses in einem Named Volume. */
export const VolumeListingSchema = z.object({
  path: z.string(), // relativer Pfad innerhalb des Volumes ('' = Wurzel)
  entries: z.array(VolumeFileSchema),
});
export type VolumeListing = z.infer<typeof VolumeListingSchema>;
