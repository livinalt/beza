import { TLEditorSnapshot } from "@tldraw/tldraw";

export interface PageData {
  id: string;
  name: string;
  canvasData: TLEditorSnapshot | null;
}

export interface Layer {
  id: string;
  name: string;
  isHidden: boolean;
  depth: number;
}
