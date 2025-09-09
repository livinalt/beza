import { TLSnapshot } from "@tldraw/tldraw";

export interface PageData {
  id: string;
  name: string;
  canvasData: TLSnapshot | null;
}
