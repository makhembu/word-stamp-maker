// Stamp template registry: the pre-designed stamps shown in the gallery.

import type { StampParams, StampShapeKind } from "./types";

export interface TemplateDef {
  id: string;
  label: string;
  shape: StampShapeKind;
  defaultText: string;
  defaultColor: string;
  defaultRotation: number;
  defaultWidthPts: number;
  supportsSecondLine: boolean;
  supportsDate: boolean;
  supportsRef: boolean;
  supportsDept: boolean;
  supportsName: boolean;
  /** Show a divider line above the lower fields (classic rubber-stamp look). */
  divider: boolean;
  /** Fixed aspect ratio (height/width). Undefined = derived from content. */
  aspect?: number;
}

export const TEMPLATES: TemplateDef[] = [
  { id: "approved", label: "APPROVED", shape: "circle", defaultText: "APPROVED", defaultColor: "#1E7A3C", defaultRotation: 0, defaultWidthPts: 130, supportsSecondLine: false, supportsDate: false, supportsRef: false, supportsDept: false, supportsName: false, divider: false, aspect: 1 },
  { id: "rejected", label: "REJECTED", shape: "circle", defaultText: "REJECTED", defaultColor: "#C62828", defaultRotation: 0, defaultWidthPts: 130, supportsSecondLine: false, supportsDate: false, supportsRef: false, supportsDept: false, supportsName: false, divider: false, aspect: 1 },
  { id: "verified", label: "VERIFIED", shape: "circle", defaultText: "VERIFIED", defaultColor: "#1565C0", defaultRotation: 0, defaultWidthPts: 140, supportsSecondLine: false, supportsDate: false, supportsRef: false, supportsDept: false, supportsName: false, divider: false, aspect: 1 },
  { id: "confidential", label: "CONFIDENTIAL", shape: "rectangle", defaultText: "CONFIDENTIAL", defaultColor: "#C62828", defaultRotation: 0, defaultWidthPts: 210, supportsSecondLine: false, supportsDate: false, supportsRef: false, supportsDept: false, supportsName: false, divider: false, aspect: 0.3 },
  { id: "urgent", label: "URGENT", shape: "rectangle", defaultText: "URGENT", defaultColor: "#C62828", defaultRotation: 0, defaultWidthPts: 150, supportsSecondLine: false, supportsDate: false, supportsRef: false, supportsDept: false, supportsName: false, divider: false, aspect: 0.42 },
  { id: "paid", label: "PAID", shape: "rectangle", defaultText: "PAID", defaultColor: "#1E7A3C", defaultRotation: 0, defaultWidthPts: 120, supportsSecondLine: false, supportsDate: false, supportsRef: false, supportsDept: false, supportsName: false, divider: false, aspect: 0.38 },
  { id: "received", label: "RECEIVED", shape: "rectangle", defaultText: "RECEIVED", defaultColor: "#1565C0", defaultRotation: 0, defaultWidthPts: 165, supportsSecondLine: false, supportsDate: true, supportsRef: true, supportsDept: false, supportsName: false, divider: true, aspect: 0.5 },
  { id: "copy", label: "COPY", shape: "rectangle", defaultText: "COPY", defaultColor: "#1F1F1F", defaultRotation: 0, defaultWidthPts: 95, supportsSecondLine: false, supportsDate: false, supportsRef: false, supportsDept: false, supportsName: false, divider: false, aspect: 0.4 },
  { id: "original", label: "ORIGINAL", shape: "double-circle", defaultText: "ORIGINAL", defaultColor: "#1565C0", defaultRotation: 0, defaultWidthPts: 140, supportsSecondLine: false, supportsDate: false, supportsRef: false, supportsDept: false, supportsName: false, divider: false, aspect: 1 },
  { id: "draft", label: "DRAFT", shape: "rounded", defaultText: "DRAFT", defaultColor: "#546E7A", defaultRotation: 0, defaultWidthPts: 135, supportsSecondLine: false, supportsDate: true, supportsRef: false, supportsDept: false, supportsName: false, divider: true, aspect: 0.42 },
  { id: "seal", label: "OFFICIAL SEAL", shape: "seal", defaultText: "OFFICIAL", defaultColor: "#0D47A1", defaultRotation: 0, defaultWidthPts: 170, supportsSecondLine: false, supportsDate: false, supportsRef: false, supportsDept: true, supportsName: true, divider: false, aspect: 1 },
  { id: "date", label: "DATE", shape: "date", defaultText: "DATE", defaultColor: "#1F1F1F", defaultRotation: 0, defaultWidthPts: 170, supportsSecondLine: false, supportsDate: true, supportsRef: true, supportsDept: false, supportsName: false, divider: true, aspect: 0.44 },
  { id: "signature", label: "SIGNATURE", shape: "signature", defaultText: "SIGNED", defaultColor: "#1A237E", defaultRotation: 0, defaultWidthPts: 180, supportsSecondLine: false, supportsDate: true, supportsRef: false, supportsDept: false, supportsName: true, divider: true, aspect: 0.46 },
  { id: "diagonal", label: "DIAGONAL", shape: "diagonal", defaultText: "CONFIDENTIAL", defaultColor: "#B71C1C", defaultRotation: -30, defaultWidthPts: 220, supportsSecondLine: false, supportsDate: false, supportsRef: false, supportsDept: false, supportsName: false, divider: false, aspect: 0.24 },
  { id: "custom", label: "CUSTOM", shape: "rectangle", defaultText: "CUSTOM TEXT", defaultColor: "#37474F", defaultRotation: 0, defaultWidthPts: 170, supportsSecondLine: true, supportsDate: true, supportsRef: true, supportsDept: true, supportsName: true, divider: false, aspect: 0.46 },
];

export const SHAPE_OPTIONS: { value: StampShapeKind; label: string }[] = [
  { value: "circle", label: "Circle" },
  { value: "double-circle", label: "Double circle" },
  { value: "rectangle", label: "Rectangle" },
  { value: "rounded", label: "Rounded rectangle" },
  { value: "diagonal", label: "Diagonal text" },
  { value: "seal", label: "Official seal" },
  { value: "signature", label: "Signature" },
  { value: "date", label: "Date stamp" },
];

export const INK_COLORS: { name: string; hex: string }[] = [
  { name: "Red", hex: "#C62828" },
  { name: "Blue", hex: "#1565C0" },
  { name: "Green", hex: "#1E7A3C" },
  { name: "Black", hex: "#1F1F1F" },
  { name: "Purple", hex: "#6A1B9A" },
  { name: "Brown", hex: "#5D4037" },
  { name: "Orange", hex: "#E65100" },
];

export const FONT_OPTIONS = [
  "Stencil",
  "Arial Black",
  "Impact",
  "Georgia",
  "Times New Roman",
  "Courier New",
  "Arial",
  "Verdana",
  "Tahoma",
];

export const SIZE_PRESETS: Record<string, { widthPts: number; label: string }> = {
  small: { widthPts: 110, label: "Small" },
  medium: { widthPts: 160, label: "Medium" },
  large: { widthPts: 230, label: "Large" },
};

/** Aspect ratio (height/width) used by the renderer for each shape kind. */
export function aspectForShape(shape: StampShapeKind): number {
  switch (shape) {
    case "circle":
    case "double-circle":
    case "seal":
      return 1;
    case "diagonal":
      return 0.24;
    case "rectangle":
      return 0.42;
    case "rounded":
      return 0.44;
    case "signature":
      return 0.46;
    case "date":
      return 0.44;
    default:
      return 0.46;
  }
}

/** Build default params for a template. */
export function defaultsFor(template: TemplateDef): StampParams {
  return {
    templateId: template.id,
    shape: template.shape,
    mainText: template.defaultText,
    secondLine: "",
    dateText: "",
    refText: "",
    deptText: "",
    nameText: "",
    inkColor: template.defaultColor,
    opacity: 0.92,
    fontSize: 18,
    secondLineSize: 11,
    fontFamily: "Stencil",
    bold: true,
    italic: false,
    underline: false,
    align: "center",
    borderThickness: 1,
    borderStyle: template.shape === "double-circle" || template.shape === "seal" ? "double" : "single",
    rotation: template.defaultRotation,
    widthPts: template.defaultWidthPts,
    aspect: template.aspect ?? aspectForShape(template.shape),
    divider: template.divider,
  };
}

/** Format a date like "17 AUG 2026". */
export function formatDate(d: Date): string {
  const day = String(d.getDate()).padStart(2, "0");
  const month = d.toLocaleString("en-US", { month: "short" }).toUpperCase();
  return `${day} ${month} ${d.getFullYear()}`;
}

/** Today's date, formatted. */
export function todayText(): string {
  return formatDate(new Date());
}
