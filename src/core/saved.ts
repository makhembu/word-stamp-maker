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
