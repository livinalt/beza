"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import io, { Socket } from "socket.io-client";
import { toast } from "sonner";
import { Editor } from "@tldraw/tldraw";
import { Home, Sparkles, Link as LinkIcon, Image as ImageIcon } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import Canvas from "@/components/Canvas";
import LayersPanel from "@/components/LayersPanel";
import type { DaydreamOneShotResponse } from "@/lib/types";
import type { TLShapeId } from "@tldraw/tlschema";


/**
 * Production-ready Board page (TypeScript-clean)
 *
 * Notes:
 * - Uses /api/daydream/oneshot (server attaches API key)
 * - Strong typing: no `any`. Uses `unknown` + guards where needed.
 * - Expects types/daydream.ts to export DaydreamOneShotResponse
 */

/* ---------- Local types ---------- */
type PageData = {
    id: string;
    name: string;
    canvasData: unknown | null; // keep generic to avoid tldraw internal type mismatch
};

/* ---------- Helpers ---------- */
const generateShortId = (): string => {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    return Array.from({ length: 3 }, () =>
        Array.from({ length: 3 }, () => chars[Math.floor(Math.random() * chars.length)]).join("")
    ).join("-");
};

const DEFAULT_REQUEST_TIMEOUT = 30_000;

async function fetchWithTimeout(input: RequestInfo, init: RequestInit = {}, timeout = DEFAULT_REQUEST_TIMEOUT) {
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

    if (typeof (r).output_url === "string") return (r).output_url;
    if (Array.isArray(r.outputs) && typeof r.outputs[0]?.url === "string") return r.outputs[0].url;
    if (Array.isArray((r).images) && typeof (r).images[0]?.url === "string") return (r).images[0].url;
    if (Array.isArray((r).data) && typeof (r).data[0]?.url === "string") return (r).data[0].url;
    if (Array.isArray((r).result) && typeof (r).result[0]?.url === "string") return (r).result[0].url;

    return null;
}

/* ---------- Component ---------- */
export default function Board(): React.ReactElement {
    const { roomId } = useParams();
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const editorRef = useRef<Editor | null>(null);
    const socketRef = useRef<Socket | null>(null);
    const lastSavedState = useRef<string | null>(null);

    const initialPage: PageData = { id: generateShortId(), name: "Page 1", canvasData: null };
    const [pages, setPages] = useState<PageData[]>([initialPage]);
    const [activePageId] = useState(initialPage.id); // setter not used — avoid unused var warning

    const [aiPrompt, setAiPrompt] = useState<string>("");
    const [generatePrompt, setGeneratePrompt] = useState<string>("");
    const [showGrid] = useState<boolean>(true);
    const [viewUrl, setViewUrl] = useState<string>("");

    const [selectedShapes, setSelectedShapes] = useState<string[]>([]);
    const [isEnhancing, setIsEnhancing] = useState<boolean>(false);
    const [isGenerating, setIsGenerating] = useState<boolean>(false);

    /* ---------- Save canvas state ---------- */
    const saveCanvasState = useCallback(() => {
        const editor = editorRef.current;
        if (!editor) return;
        try {
            // tldraw snapshot type can be complex; store as unknown
            const snapshot = editor.store.getSnapshot();
            const snapshotJSON = JSON.stringify(snapshot);
            if (snapshotJSON === lastSavedState.current) return;
            setPages((prevPages) =>
                prevPages.map((p) => (p.id === activePageId ? { ...p, canvasData: snapshot } : p))
            );
            lastSavedState.current = snapshotJSON;
        } catch (err) {
            if (err instanceof Error) console.error("Failed to save canvas snapshot:", err.message);
            else console.error("Failed to save canvas snapshot:", err);
        }
    }, [activePageId]);

    /* ---------- Utilities: Export & Replace ---------- */
    // Exports a shape to a full data URL (data:image/png;base64,...)
    const exportShapeAsDataUrl = async (editor: Editor, shapeId: string): Promise<string | null> => {
        try {
            const svg = await editor.getSvg([shapeId as TLShapeId]);
            if (!svg) return null;
            const svgString = new XMLSerializer().serializeToString(svg);
            const blob = new Blob([svgString], { type: "image/svg+xml" });
            const url = URL.createObjectURL(blob);

            return await new Promise((resolve) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement("canvas");
                    canvas.width = img.width || 512;
                    canvas.height = img.height || 512;
                    const ctx = canvas.getContext("2d");
                    if (!ctx) {
                        URL.revokeObjectURL(url);
                        resolve(null);
                        return;
                    }
                    ctx.drawImage(img, 0, 0);
                    const dataUrl = canvas.toDataURL("image/png");
                    URL.revokeObjectURL(url);
                    resolve(dataUrl);
                };
                img.onerror = () => {
                    URL.revokeObjectURL(url);
                    resolve(null);
                };
                img.src = url;
            });
        } catch (err: unknown) {
            console.error("Export error:", err);
            return null;
        }
    };

    // Replace a shape with an image shape; safe property access
    const replaceShapeWithImage = (editor: Editor, shapeId: string, imageUrl: string): void => {
        const shape = editor.getShape(shapeId as TLShapeId);
        if (!shape) return;
        const props = shape.props as Record<string, unknown>;
        const w = typeof props.w === "number" ? props.w : 200;
        const h = typeof props.h === "number" ? props.h : 200;
        editor.updateShapes([{ id: shape.id, type: "image", props: { w, h, url: imageUrl } }]);
    };

    /* ---------- OneShot API call ---------- */
    const callOneShot = async (payload: Record<string, unknown>): Promise<DaydreamOneShotResponse> => {
        const res = await fetchWithTimeout("/api/daydream/oneshot", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });

        if (!res.ok) {
            const bodyText = await res.text().catch(() => "");
            throw new Error(`Daydream OneShot failed (${res.status}): ${bodyText}`);
        }

        const json = (await res.json()) as DaydreamOneShotResponse;
        return json;
    };

    /* ---------- Enhance selected objects (image-to-image) ---------- */
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
                if (!dataUrl) {
                    toast.error("Failed to export shape; skipping");
                    continue;
                }

                const result = await callOneShot({ prompt: aiPrompt, image: dataUrl });
                const imageUrl = extractImageUrlFromDaydreamResponse(result);
                if (!imageUrl) {
                    toast.error("No image URL returned for shape; skipping");
                    continue;
                }

                replaceShapeWithImage(editor, shapeId, imageUrl);
            }

            saveCanvasState();
            toast.success("Object(s) enhanced");
        } catch (err) {
            if (err instanceof Error) toast.error(`Enhance failed: ${err.message}`);
            else toast.error("Enhance failed");
            console.error("EnhanceObjects error:", err);
        } finally {
            setIsEnhancing(false);
        }
    };

    /* ---------- Generate new image (text-to-image) ---------- */
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
            const result = await callOneShot({ prompt: generatePrompt });
            const imageUrl = extractImageUrlFromDaydreamResponse(result);
            if (!imageUrl) {
                toast.error("No image URL returned from OneShot");
                return;
            }

            editor.createShapes([
                {
                    type: "image",
                    x: 100,
                    y: 100,
                    props: { w: 200, h: 200, url: imageUrl },
                },
            ]);

            saveCanvasState();
            toast.success("Image generated and added to canvas");
        } catch (err) {
            if (err instanceof Error) toast.error(`Generate failed: ${err.message}`);
            else toast.error("Generate failed");
            console.error("GenerateImage error:", err);
        } finally {
            setIsGenerating(false);
        }
    };

    /* ---------- Effects ---------- */
    useEffect(() => {
        if (!editorRef.current) return;
        const unsubscribe = editorRef.current.store.listen(() => {
            // listen to selection changes; selection id path may vary so we just fetch selected ids
            const selected = editorRef.current?.getSelectedShapeIds() || [];
            setSelectedShapes(selected);
        });
        return () => {
            try {
                unsubscribe();
            } catch (e) {
                // sometimes unsubscribe may throw if editor destroyed early
            }
        };
    }, []);

    useEffect(() => {
        if (typeof window !== "undefined") {
            setViewUrl(`${window.location.origin}/board/${roomId}/view`);
        }
    }, [roomId]);

    useEffect(() => {
        const socket = io(process.env.NEXT_PUBLIC_SIGNALING_URL ?? "http://localhost:3001", {
            reconnectionDelay: 5000,
            reconnectionAttempts: 10,
        });
        socketRef.current = socket;
        socket.on("connect", () => socket.emit("joinSession", roomId));
        socket.on("connect_error", (err) => console.warn("Socket connect error:", err));
        return () => {
            try {
                socket.disconnect();
            } catch (e) {
                /* ignore */
            }
        };
    }, [roomId]);

    /* ---------- UI ---------- */
    if (!roomId || typeof roomId !== "string") {
        return <div className="text-red-500 p-4">Error: Invalid or missing roomId</div>;
    }

    return (
        <div className="relative w-screen h-screen bg-neutral-100 dark:bg-zinc-900">
            {/* Header */}
            <header className="fixed top-0 left-0 right-0 h-14 z-[9999] flex items-center justify-between px-4 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md border-b border-gray-200 dark:border-zinc-700">
                <div className="flex items-center gap-3">
                    <Link href="/" title="Back to Home">
                        <Home className="w-5 h-5" />
                    </Link>
                    <h1 className="text-sm font-semibold">Bezalel Board</h1>
                    <span className="text-xs text-gray-500 dark:text-gray-400">/ {roomId}</span>
                </div>

                <div className="flex items-center gap-2">
                    <input
                        aria-label="Enhance object prompt"
                        placeholder="Enhance object..."
                        value={aiPrompt}
                        onChange={(e) => setAiPrompt(e.target.value)}
                        className="text-xs border rounded px-2 py-1 w-40"
                    />
                    <button
                        onClick={handleEnhanceObjects}
                        disabled={!aiPrompt.trim() || selectedShapes.length === 0 || isEnhancing}
                        className="px-2 py-1 bg-green-100 hover:bg-green-200 rounded disabled:opacity-50"
                    >
                        <Sparkles className="w-4 h-4 text-green-600" />
                    </button>

                    <input
                        aria-label="Generate image prompt"
                        placeholder="Generate image..."
                        value={generatePrompt}
                        onChange={(e) => setGeneratePrompt(e.target.value)}
                        className="text-xs border rounded px-2 py-1 w-40"
                    />
                    <button
                        onClick={handleGenerateImage}
                        disabled={!generatePrompt.trim() || isGenerating}
                        className="px-2 py-1 bg-blue-100 hover:bg-blue-200 rounded disabled:opacity-50"
                    >
                        <ImageIcon className="w-4 h-4 text-blue-600" />
                    </button>

                    <button
                        onClick={() => {
                            navigator.clipboard?.writeText(viewUrl || "");
                            toast.success("View link copied!");
                        }}
                        className="w-8 h-8 flex items-center justify-center rounded-md bg-blue-100 hover:bg-blue-200"
                    >
                        <LinkIcon className="w-4 h-4 text-blue-600" />
                    </button>

                    <ThemeToggle />
                </div>
            </header>

            {/* Main */}
            <main className="absolute top-14 bottom-0 left-0 right-48 flex">
                <div className="flex-1 relative">
                    <Canvas
                        showGrid={showGrid}
                        canvasRef={canvasRef}
                        editorRef={editorRef as unknown as React.RefObject<Editor>} // cast to satisfy LayersPanel contract
                        saveCanvasState={saveCanvasState}
                    />
                </div>

                <LayersPanel editorRef={editorRef as unknown as React.RefObject<Editor>} />
            </main>
        </div>
    );
}
