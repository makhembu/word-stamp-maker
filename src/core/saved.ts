// Saved custom designs. Stored in the task pane's localStorage so designs the user
// builds in the CUSTOM builder persist across sessions on this machine.

import type { StampParams } from "./types";

export interface SavedDesign {
  id: string;
  name: string;
  params: StampParams;
  savedAt: number;
}

const KEY = "stampmaker.saved.designs.v1";

export function loadSavedDesigns(): SavedDesign[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedDesign[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persist(list: SavedDesign[]): SavedDesign[] {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // storage full / unavailable — ignore, the design just won't persist
  }
  return list;
}

/** Save (or update, when a design with the same name exists) the current params. */
export function saveDesign(name: string, params: StampParams): SavedDesign[] {
  const list = loadSavedDesigns();
  const trimmed = name.trim();
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const next: SavedDesign = {
    id,
    name: trimmed || "My design",
    params: JSON.parse(JSON.stringify(params)),
    savedAt: Date.now(),
  };
  const idx = list.findIndex((d) => d.name.toLowerCase() === next.name.toLowerCase());
  if (idx >= 0) list[idx] = next;
  else list.push(next);
  return persist(list);
}

export function deleteSavedDesign(id: string): SavedDesign[] {
  return persist(loadSavedDesigns().filter((d) => d.id !== id));
}

// ---------- Export / import (share designs across machines) ----------

const DESIGN_FILE_FORMAT = "stamp-maker-design";
const MAX_NAME_LEN = 32;

/** The on-disk shape of an exported design file (.stamp = JSON). */
interface DesignFile {
  format: string;
  version: number;
  exportedAt?: string;
  designs: SavedDesign[];
}

/** Serialize designs to the shareable .stamp JSON text. */
export function serializeDesigns(designs: SavedDesign[]): string {
  const payload: DesignFile = {
    format: DESIGN_FILE_FORMAT,
    version: 1,
    exportedAt: new Date().toISOString(),
    designs,
  };
  return JSON.stringify(payload, null, 2);
}

/**
 * Parse a design file into SavedDesigns. Accepts the .stamp bundle format, a plain
 * array of designs, or a single design object. Invalid entries are skipped; throws
 * when nothing usable is found.
 */
export function parseDesignFile(text: string): SavedDesign[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Not a valid design file (expected JSON).");
  }

  const candidates: unknown[] = [];
  if (data && typeof data === "object" && Array.isArray((data as DesignFile).designs)) {
    candidates.push(...(data as DesignFile).designs);
  } else if (Array.isArray(data)) {
    candidates.push(...data);
  } else {
    candidates.push(data);
  }

  const designs: SavedDesign[] = [];
  for (const c of candidates) {
    const raw = c as Partial<SavedDesign>;
    const p = raw?.params as StampParams | undefined;
    if (!p || typeof p !== "object" || typeof p.shape !== "string") continue;
    const name = typeof raw.name === "string" && raw.name.trim() ? raw.name.trim().slice(0, MAX_NAME_LEN) : "Imported design";
    designs.push({
      id: typeof raw.id === "string" && raw.id ? raw.id : Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name,
      params: JSON.parse(JSON.stringify(p)) as StampParams,
      savedAt: typeof raw.savedAt === "number" ? raw.savedAt : Date.now(),
    });
  }
  if (!designs.length) throw new Error("No valid stamp designs found in that file.");
  return designs;
}

/** Merge parsed designs into storage (a design with the same name replaces the old
 *  one, matching saveDesign semantics). Returns how many designs were merged. */
export function importDesigns(designs: SavedDesign[]): number {
  for (const d of designs) saveDesign(d.name, d.params);
  return designs.length;
}
