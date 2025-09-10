"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import io, { Socket } from "socket.io-client";
import { toast } from "sonner";
import { Editor, TLShapeId } from "@tldraw/tldraw";
import {
    Home,
    Sparkles,
    Link as LinkIcon,
    Image as ImageIcon,
} from "lucide-react";
// import ThemeToggle from "@/components/ThemeToggle";
import Canvas from "@/components/Canvas";
import LayersPanel from "@/components/LayersPanel";
import type { DaydreamOneShotResponse } from "@/lib/types";

// ---------------- Types ----------------

// infer snapshot type directly from Editor
type SerializedStoreSnapshot = ReturnType<Editor["store"]["getSnapshot"]>;

type PageData = {
    id: string;
    name: string;
    canvasData: SerializedStoreSnapshot | null;
};

type DaydreamOneShotPayload = {
    prompt: string;
    image?: string; // base64 or dataURL
};

// ---------------- Helpers ----------------
const generateShortId = (): string => {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    return Array.from({ length: 3 }, () =>
        Array.from({ length: 3 }, () =>
            chars[Math.floor(Math.random() * chars.length)]
        ).join("")
    ).join("-");
};

const DEFAULT_REQUEST_TIMEOUT = 30_000;

async function fetchWithTimeout(
    input: RequestInfo,
    init: RequestInit = {},
    timeout = DEFAULT_REQUEST_TIMEOUT
) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const res = await fetch(input, { ...init, signal: controller.signal });
        return res;
    } finally {
        clearTimeout(id);
    }
}

function extractImageUrlFromDaydreamResponse(res: unknown): string | null {
    if (!res || typeof res !== "object") return null;
    const r = res as DaydreamOneShotResponse;
    if (typeof r.output_url === "string") return r.output_url;
    if (Array.isArray(r.outputs) && typeof r.outputs[0]?.url === "string")
        return r.outputs[0].url;
    if (Array.isArray(r.images) && typeof r.images[0]?.url === "string")
        return r.images[0].url;
    if (Array.isArray(r.data) && typeof r.data[0]?.url === "string")
        return r.data[0].url;
    if (Array.isArray(r.result) && typeof r.result[0]?.url === "string")
        return r.result[0].url;
    return null;
}

const blobToDataUrl = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });

const exportShapeAsDataUrl = async (
    editor: Editor,
    shapeId: string
): Promise<string | null> => {
    try {
        const { blob } = await editor.toImage([shapeId as TLShapeId], {
            format: "png",
            background: false,
            quality: 1,
        });
        if (!blob) return null;
        return await blobToDataUrl(blob);
    } catch (err) {
        console.error("Export error:", err);
        return null;
    }
};

const replaceShapeWithImage = (
    editor: Editor,
    shapeId: string,
    imageUrl: string
): void => {
    const shape = editor.getShape(shapeId as TLShapeId);
    if (!shape) return;

    const props = shape.props as Partial<{ w: number; h: number; url: string }>;
    const w = props.w ?? 200;
    const h = props.h ?? 200;

    editor.updateShapes([
        { id: shape.id, type: "image", props: { w, h, url: imageUrl } },
    ]);
};

// ---------------- Main Component ----------------
export default function Board(): React.ReactElement {
    const { roomId } = useParams();
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const editorRef = useRef<Editor | null>(null);
    const socketRef = useRef<Socket | null>(null);
    const lastSavedState = useRef<string | null>(null);

    const initialPage: PageData = {
        id: generateShortId(),
        name: "Page 1",
        canvasData: null,
    };
    const [pages, setPages] = useState<PageData[]>(() => {
        if (typeof window !== "undefined") {
            try {
                const saved = localStorage.getItem(`canvas-state-${roomId}`);
                return saved ? (JSON.parse(saved) as PageData[]) : [initialPage];
            } catch {
                return [initialPage];
            }
        }
        return [initialPage];
    });
    const [activePageId, setActivePageId] = useState(initialPage.id);
    const [aiPrompt, setAiPrompt] = useState<string>("");
    const [generatePrompt, setGeneratePrompt] = useState<string>("");
    const [showGrid] = useState<boolean>(true);
    const [viewUrl, setViewUrl] = useState<string>("");
    const [selectedShapes, setSelectedShapes] = useState<string[]>([]);
    const [isEnhancing, setIsEnhancing] = useState<boolean>(false);
    const [isGenerating, setIsGenerating] = useState<boolean>(false);

    const saveCanvasState = useCallback(() => {
        const editor = editorRef.current;
        if (!editor) return;
        try {
            const snapshot = editor.store.getSnapshot();
            const snapshotJSON = JSON.stringify(snapshot);
            if (snapshotJSON === lastSavedState.current) return;
            setPages((prevPages) => {
                const newPages = prevPages.map((p) =>
                    p.id === activePageId ? { ...p, canvasData: snapshot } : p
                );
                localStorage.setItem(
                    `canvas-state-${roomId}`,
                    JSON.stringify(newPages)
                );
                console.log("Saved canvas state, pages:", newPages);
                return newPages;
            });
            lastSavedState.current = snapshotJSON;
        } catch (err) {
            console.error("Failed to save canvas snapshot:", err);
        }
    }, [activePageId, roomId]);

    useEffect(() => {
        const editor = editorRef.current;
        if (!editor) return;

        const page = pages.find((p) => p.id === activePageId);
        if (!page?.canvasData) return;

        try {
            editor.store.loadSnapshot(page.canvasData);
        } catch (err) {
            console.error("Failed to load canvas snapshot:", err);
        }
    }, [pages, activePageId]);

    const callOneShot = async (
        payload: DaydreamOneShotPayload
    ): Promise<DaydreamOneShotResponse> => {
        const res = await fetchWithTimeout("/api/daydream/oneshot", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        if (!res.ok) {
            const bodyText = await res.text().catch(() => "");
            throw new Error(
                `Daydream OneShot failed (${res.status}): ${bodyText}`
            );
        }
        return (await res.json()) as DaydreamOneShotResponse;
    };

    const handleEnhanceObjects = async (): Promise<void> => {
        const editor = editorRef.current;
        if (!editor) {
            toast.error("Editor not ready");
            return;
        }
        if (!aiPrompt.trim()) {
            toast.error("Enter an enhancement prompt");
            return;
        }
        const selected = editor.getSelectedShapeIds();
        if (!selected?.length) {
            toast.error("Select at least one shape to enhance");
            return;
        }

        setIsEnhancing(true);
        try {
            for (const shapeId of selected) {
                const dataUrl = await exportShapeAsDataUrl(editor, shapeId);
                if (!dataUrl) continue;
                const result = await callOneShot({ prompt: aiPrompt, image: dataUrl });
                const imageUrl = extractImageUrlFromDaydreamResponse(result);
                if (!imageUrl) continue;
                replaceShapeWithImage(editor, shapeId, imageUrl);
            }
            saveCanvasState();
            toast.success("Object(s) enhanced");
        } catch (err) {
            toast.error("Enhance failed");
            console.error("EnhanceObjects error:", err);
        } finally {
            setIsEnhancing(false);
        }
    };

    const handleGenerateImage = async (): Promise<void> => {
        const editor = editorRef.current;
        if (!editor) {
            toast.error("Editor not ready");
            return;
        }
        if (!generatePrompt.trim()) {
            toast.error("Enter a generation prompt");
            return;
        }

        setIsGenerating(true);
        try {
            const streamResponse = await fetch("/api/daydream/stream", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ pipeline_id: "pip_qpUgXycjWF6YMeSL" }),
            });

            if (!streamResponse.ok) {
                throw new Error("Failed to create stream");
            }

            const { id: streamId } = await streamResponse.json();

            const promptResponse = await fetch(`/api/daydream/prompt`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    stream_id: streamId,
                    prompt: generatePrompt,
                }),
            });

            if (!promptResponse.ok) {
                throw new Error("Failed to submit prompt");
            }

            const result = await promptResponse.json();
            const imageUrl = result.output_url;
            if (!imageUrl) {
                toast.error("No image generated");
                return;
            }

            editor.createShapes([
                {
                    type: "image",
                    x: 100,
                    y: 100,
                    props: { w: 200, h: 200, url: imageUrl },
                    meta: {
                        name: `Image ${editor.getCurrentPageShapes().length + 1}`,
                        hidden: false,
                    },
                },
            ]);

            saveCanvasState();
            toast.success("Image generated");
        } catch (err) {
            toast.error("Generate failed");
            console.error("GenerateImage error:", err);
        } finally {
            setIsGenerating(false);
        }
    };

    useEffect(() => {
        if (!editorRef.current) return;
        const editor = editorRef.current;
        const handleSelectionChange = () => {
            setSelectedShapes(editor.getSelectedShapeIds());
        };
        const unsubscribe: () => void = editor.store.listen(
            handleSelectionChange,
            { scope: "all" } // ✅ fixed: "selection" is not allowed
        );
        return () => {
            try {
                unsubscribe();
            } catch {
                /* ignore */
            }
        };
    }, [editorRef]);

    useEffect(() => {
        if (typeof window !== "undefined") {
            setViewUrl(`${window.location.origin}/board/${roomId}/view`);
        }
    }, [roomId]);

    useEffect(() => {
        const socket = io(
            process.env.NEXT_PUBLIC_SIGNALING_URL ?? "http://localhost:3001",
            { reconnectionDelay: 5000, reconnectionAttempts: 10 }
        );
        socketRef.current = socket;
        socket.on("connect", () => socket.emit("joinSession", roomId));
        socket.on("connect_error", (err: Error) =>
            console.warn("Socket connect error:", err)
        );
        return () => {
            try {
                socket.disconnect();
            } catch {
                /* ignore */
            }
        };
    }, [roomId]);

    if (!roomId || typeof roomId !== "string") {
        return (
            <div className="text-red-500 p-4">
                Error: Invalid or missing roomId
            </div>
        );
    }

    return (
        <div className="relative w-screen h-screen bg-neutral-50 dark:bg-zinc-900 text-neutral-900 dark:text-neutral-100">
            {/* Header */}
            <header className="fixed top-0 left-0 right-0 h-14 z-[9999] flex items-center justify-between px-4 bg-white/70 dark:bg-zinc-900/70 backdrop-blur-md border-b border-neutral-200 dark:border-zinc-800">
                <div className="flex items-center gap-3">
                    <Link href="/" title="Back to Home">
                        <Home className="w-5 h-5" />
                    </Link>
                    <h1 className="text-sm font-semibold">Bezalel Board</h1>
                </div>
                <div className="flex items-center gap-2">
                    {/* Enhance Input */}
                    <input
                        aria-label="Enhance object prompt"
                        placeholder="Enhance object..."
                        value={aiPrompt}
                        onChange={(e) => setAiPrompt(e.target.value)}
                        className="text-xs border border-neutral-300 dark:border-zinc-800 rounded-lg px-2 py-1 w-40 bg-white dark:bg-zinc-800 text-neutral-900 dark:text-neutral-100"
                    />
                    <button
                        onClick={handleEnhanceObjects}
                        title="Enhance selected shapes"
                        disabled={
                            !aiPrompt.trim() || selectedShapes.length === 0 || isEnhancing
                        }
                        className="px-2 py-1 rounded-lg bg-gradient-to-r from-indigo-600 to-fuchsia-500 text-white disabled:opacity-40 transition-all hover:scale-105 active:scale-95"
                    >
                        <Sparkles className="w-4 h-4" />
                    </button>

                    {/* Generate Input */}
                    <input
                        aria-label="Generate image prompt"
                        placeholder="Generate image..."
                        value={generatePrompt}
                        onChange={(e) => setGeneratePrompt(e.target.value)}
                        className="text-xs border border-neutral-300 dark:border-zinc-800 rounded-lg px-2 py-1 w-40 bg-white dark:bg-zinc-800 text-neutral-900 dark:text-neutral-100"
                    />
                    <button
                        onClick={handleGenerateImage}
                        title="Generate new image"
                        disabled={!generatePrompt.trim() || isGenerating}
                        className="px-2 py-1 rounded-lg bg-gradient-to-r from-indigo-600 to-fuchsia-500 text-white disabled:opacity-40 transition-all hover:scale-105 active:scale-95"
                    >
                        <ImageIcon className="w-4 h-4" />
                    </button>

                    {/* Copy Link */}
                    <button
                        disabled
                        title="Share link"
                        onClick={() => {
                            navigator.clipboard?.writeText(viewUrl || "");
                            toast.success("Share link copied!");
                        }}
                        className="w-8 h-8 flex items-center justify-center rounded-md border border-neutral-300 dark:border-zinc-700 hover:bg-neutral-100 dark:hover:bg-zinc-800 transition-all"
                    >
                        <LinkIcon className="w-4 h-4 text-indigo-600" />
                    </button>
                </div>
            </header>

            {/* Main */}
            <main className="absolute top-14 bottom-0 left-0 right-48 flex">
                <div className="flex-1 relative">
                    <Canvas
                        showGrid={showGrid}
                        canvasRef={canvasRef}
                        editorRef={editorRef as React.RefObject<Editor>}
                        saveCanvasState={saveCanvasState}
                    />
                    <div className="absolute top-16 left-4 text-xs text-neutral-500 dark:text-neutral-400">
                        Selected Shapes: {selectedShapes.length} (
                        {selectedShapes.join(", ")})
                    </div>
                </div>
                <LayersPanel editorRef={editorRef as React.RefObject<Editor>} />
            </main>
        </div>
    );
}