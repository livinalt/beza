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


// types/daydream.ts

export interface DaydreamStreamResponse {
  id: string;
  pipeline_id: string;
  status: "created" | "starting" | "running" | "failed" | "succeeded";
  created_at: string;
  updated_at: string;
  [key: string]: unknown; // fallback for extra fields
}

export interface DaydreamOneShotResponse {
  id: string;
  pipeline: "text-to-image" | "image-to-image";
  model_id: string;
  status: "succeeded" | "failed";
  created_at: string;
  updated_at: string;
  outputs: Array<{
    id: string;
    url: string; // ✅ this is the generated image URL
    mime_type: string;
    [key: string]: unknown;
  }>;
  [key: string]: unknown; // fallback for unexpected fields
}

export interface DaydreamOneShotOutput {
  url: string;
  [key: string]: unknown;
}