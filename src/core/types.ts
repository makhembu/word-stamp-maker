// Shared type definitions for the Stamp Maker add-in.

export type StampShapeKind =
  | "circle"
  | "double-circle"
  | "rectangle"
  | "rounded"
  | "diagonal"
  | "seal"
  | "signature"
  | "date";

export type TextAlign = "center" | "left" | "right";
export type BorderStyle = "single" | "double";
export type SizePreset = "small" | "medium" | "large" | "custom";

/** A fully-resolved description of one stamp. Serialized into the shape's alt-text so
 *  stamps can be edited, duplicated, and re-rendered later. */
export interface StampParams {
  /** Template id (e.g. "approved", "custom"). */
  templateId: string;
  shape: StampShapeKind;
  mainText: string;
  secondLine: string;
  /** Formatted date line, e.g. "17 AUG 2026". */
  dateText: string;
  /** Reference line, rendered as "REF: ..." when non-empty. */
  refText: string;
  /** Department / office line. */
  deptText: string;
  /** Signatory name (signature templates). */
  nameText: string;
  /** Ink color as #RRGGBB. */
  inkColor: string;
  /** 0..1 overall ink opacity. */
  opacity: number;
  /** Base font size in points (applies to the main line). */
  fontSize: number;
  /** Size in points for the second line (independent of the main line). */
  secondLineSize: number;
  fontFamily: string;
  bold: boolean;
  italic: boolean;
  /** Underline the main and second text lines. */
  underline: boolean;
  align: TextAlign;
  /** Multiplier for border weight. */
  borderThickness: number;
  borderStyle: BorderStyle;
  /** Rotation in degrees applied to the floating shape in Word. */
  rotation: number;
  /** Target width in points. Height is derived by the renderer. */
  widthPts: number;
  /** Fixed height/width ratio used by the renderer (1 for circles). */
  aspect: number;
  /** Draw the classic wavy divider line above lower fields (rect-style stamps). */
  divider: boolean;
}

/** Size of the rendered stamp, in Word points. */
export interface RenderResult {
  /** data:image/png;base64,... */
  dataUrl: string;
  widthPts: number;
  heightPts: number;
}

/** A stamp found in the open document. */
export interface StampRecord {
  /** Unique id (shape name suffix). */
  id: string;
  shapeId: number;
  name: string;
  altText: string;
  params: StampParams | null;
  top: number;
  left: number;
  width: number;
  height: number;
  rotation: number;
  wrapType: string;
  isInline: boolean;
  relativeHorizontalPosition: string;
  relativeVerticalPosition: string;
}

export type QuickPosition =
  | "cursor"
  | "top-left"
  | "top-center"
  | "top-right"
  | "center-left"
  | "center"
  | "center-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";
