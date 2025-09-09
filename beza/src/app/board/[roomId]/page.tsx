"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import io, { Socket } from "socket.io-client";
import { toast } from "sonner";
import { Editor } from "@tldraw/tldraw";
import { Home, Sparkles, Link as LinkIcon } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import Canvas from "@/components/Canvas";
import LayersPanel from "@/components/LayersPanel";
import { PageData } from "@/lib/types";

const generateShortId = () => {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    const segmentLength = 3;
    const segments = 3;
    let id = "";
    for (let i = 0; i < segments; i++) {
        for (let j = 0; j < segmentLength; j++) {
            id += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        if (i < segments - 1) id += "-";
    }
    return id;
};

export default function Board() {
    const { roomId } = useParams();
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const editorRef = useRef<Editor | null>(null);
    const socketRef = useRef<Socket | null>(null);
    const lastSavedState = useRef<string | null>(null);

    const initialPage = { id: generateShortId(), name: "Page 1", canvasData: null };
    const [pages, setPages] = useState<PageData[]>([initialPage]);
    const [activePageId, setActivePageId] = useState(initialPage.id);
    const [aiPrompt, setAiPrompt] = useState("");
    const [showGrid, setShowGrid] = useState(true);
    const [showRulers, setShowRulers] = useState(false);
    const [isMounted, setIsMounted] = useState(false);
    const [viewUrl, setViewUrl] = useState<string>("");
    const [selectedShapes, setSelectedShapes] = useState<string[]>([]);

    const saveCanvasState = useCallback(() => {
        if (!editorRef.current) return;
        const snapshot = editorRef.current.store.getSnapshot();
        const snapshotJSON = JSON.stringify(snapshot);
        if (snapshotJSON === lastSavedState.current) return;
        setPages((prevPages) =>
            prevPages.map((p) => (p.id === activePageId ? { ...p, canvasData: snapshot } : p))
        );
        lastSavedState.current = snapshotJSON;
        console.log("Canvas state saved, active page:", activePageId);
    }, [activePageId]);

    const exportShapeAsImage = async (editor: Editor, shapeId: string) => {
        try {
            const svg = await editor.getSvg([shapeId]);
            if (!svg) {
                console.error("No SVG for shape:", shapeId);
                return null;
            }

            const svgString = new XMLSerializer().serializeToString(svg);
            const blob = new Blob([svgString], { type: "image/svg+xml" });
            const url = URL.createObjectURL(blob);

            return new Promise<string>((resolve) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement("canvas");
                    canvas.width = img.width || 200;
                    canvas.height = img.height || 200;
                    const ctx = canvas.getContext("2d");
                    if (!ctx) {
                        console.error("No canvas context");
                        resolve(null);
                        return;
                    }
                    ctx.drawImage(img, 0, 0);
                    const dataUrl = canvas.toDataURL("image/png").replace(/^data:image\/png;base64,/, "");
                    URL.revokeObjectURL(url);
                    resolve(dataUrl);
                };
                img.onerror = () => {
                    console.error("Failed to load SVG:", shapeId);
                    resolve(null);
                    URL.revokeObjectURL(url);
                };
                img.src = url;
            });
        } catch (error) {
            console.error("Export shape error:", error);
            return null;
        }
    };

    const replaceShapeWithImage = (editor: Editor, shapeId: string, imageUrl: string) => {
        const shape = editor.getShape(shapeId);
        if (!shape) {
            console.error("Shape not found:", shapeId);
            return;
        }
        console.log("Replacing shape with enhanced image:", shapeId, imageUrl);
        editor.updateShapes([
            {
                id: shape.id,
                type: "image",
                props: { w: shape.props.w || 200, h: shape.props.h || 200, url: imageUrl },
            },
        ]);
    };

    const handleEnhanceObjects = async () => {
        const editor = editorRef.current;
        if (!editor || !aiPrompt) {
            toast.error("Enter a prompt");
            return;
        }

        const selected = editor.getSelectedShapeIds();
        if (selected.length === 0) {
            toast.error("Select an object");
            return;
        }

        try {
            const streamResponse = await fetch("/api/daydream/stream", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ pipeline_id: "pip_qpUgXycjWF6YMeSL" }),
            });

            if (!streamResponse.ok) {
                throw new Error("Failed to create stream");
            }

            const { id: streamId, output_url } = await streamResponse.json();

            for (const shapeId of selected) {
                const dataUrl = await exportShapeAsImage(editor, shapeId);
                if (!dataUrl) {
                    toast.error("Failed to export shape");
                    continue;
                }

                const promptResponse = await fetch(`/api/daydream/prompt`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        stream_id: streamId,
                        prompt: aiPrompt,
                        image: dataUrl,
                    }),
                });

                if (!promptResponse.ok) {
                    throw new Error("Failed to submit prompt");
                }

                const result = await promptResponse.json();
                const enhancedImageUrl = result.output_url || `data:image/png;base64,${dataUrl}`;
                replaceShapeWithImage(editor, shapeId, enhancedImageUrl);
            }

            saveCanvasState();
            toast.success("Object(s) enhanced!");
        } catch (error: any) {
            toast.error(`Enhance failed: ${error.message}`);
        }
    };

    const handleAddPage = () => {
        const newPage = { id: generateShortId(), name: `Page ${pages.length + 1}`, canvasData: null };
        setPages((prev) => [...prev, newPage]);
        setActivePageId(newPage.id);
        lastSavedState.current = null;
        if (editorRef.current) {
            editorRef.current.history.clear();
            editorRef.current.store.clear();
        }
        saveCanvasState();
    };

    const handleRenamePage = (id: string, newName: string) => {
        if (newName.trim() === "") {
            toast.error("Page name cannot be empty.");
            return;
        }
        setPages((prev) => prev.map((p) => (p.id === id ? { ...p, name: newName } : p)));
    };

    const handleDeletePage = (id: string) => {
        if (pages.length === 1) {
            toast.error("Cannot delete the last page.");
            return;
        }
        setPages((prev) => {
            const remaining = prev.filter((p) => p.id !== id);
            if (activePageId === id) {
                setActivePageId(remaining[0].id);
                lastSavedState.current = null;
            }
            return remaining;
        });
    };

    useEffect(() => {
        if (!editorRef.current) return;

        const unsubscribe = editorRef.current.store.listen(
            (changes) => {
                if (changes.source === "user" && changes.changes.updated["tl:selection"]) {
                    const selected = editorRef.current?.getSelectedShapeIds() || [];
                    setSelectedShapes(selected);
                    console.log("Selection changed, selected shapes:", selected);
                }
            },
            { scope: "selection" }
        );

        return () => {
            unsubscribe();
            console.log("Unsubscribed from selection changes");
        };
    }, []);

    useEffect(() => {
        if (!editorRef.current) return;
        const activePage = pages.find((p) => p.id === activePageId);
        if (!activePage) return;

        const snapshotJSON = JSON.stringify(activePage.canvasData);
        if (snapshotJSON === lastSavedState.current) return;

        if (!activePage.canvasData) {
            editorRef.current.history.clear();
            editorRef.current.store.clear();
            lastSavedState.current = null;
            return;
        }

        editorRef.current.store.loadSnapshot(activePage.canvasData);
        lastSavedState.current = snapshotJSON;
    }, [activePageId]);

    useEffect(() => {
        setIsMounted(true);
        if (typeof window !== "undefined") {
            setViewUrl(`${window.location.origin}/board/${roomId}/view`);
        }
    }, [roomId]);

    useEffect(() => {
        const socket = io(process.env.NEXT_PUBLIC_SIGNALING_URL || "http://localhost:3001", {
            reconnectionDelay: 5000,
            reconnectionAttempts: 10,
        });
        socketRef.current = socket;
        socket.on("connect", () => {
            socket.emit("joinSession", roomId);
            console.log("Socket connected, joined room:", roomId);
        });
        socket.on("connect_error", (error) => {
            console.error("Socket connect error:", error.message);
            toast.error("Failed to connect to server. Retrying...");
        });
        return () => {
            socket.disconnect();
        };
    }, [roomId]);

    const copyLink = () => {
        if (!viewUrl) return;
        navigator.clipboard.writeText(viewUrl);
        toast.success("View link copied to clipboard!");
    };

    if (!roomId || typeof roomId !== "string") {
        return <div className="text-red-500">Error: Invalid or missing roomId</div>;
    }

    return (
        <div className="relative w-screen h-screen bg-neutral-100 dark:bg-zinc-900">
            <header className="fixed top-0 left-0 right-0 h-14 z-[9999] flex items-center justify-between px-4 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md border-b border-gray-200 dark:border-zinc-700">
                <div className="flex items-center gap-3">
                    <Link href="/" title="Back to Home">
                        <Home className="w-5 h-5 text-gray-800 dark:text-gray-200 hover:text-blue-600 dark:hover:text-blue-400 transition" />
                    </Link>
                    <h1 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                        Bezalel Board
                    </h1>
                    <span className="text-xs text-gray-500 dark:text-gray-400">/ {roomId}</span>
                </div>
                <div className="flex items-center gap-2">
                    <div
                        className="flex items-center gap-2 z-[10001]"
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <input
                            tabIndex={0}
                            title="Object enhancement prompt"
                            placeholder="Object prompt..."
                            value={aiPrompt}
                            onChange={(e) => setAiPrompt(e.target.value)}
                            className="text-xs text-gray-800 dark:text-gray-200 placeholder-gray-400 
                         bg-gray-50 dark:bg-zinc-800 border border-gray-200 
                         dark:border-zinc-700 rounded px-2 py-1 w-40 
                         focus:outline-none focus:ring-1 focus:ring-green-400"
                        />
                        <button
                            title="Enhance Selected Objects"
                            disabled={!aiPrompt.trim() || selectedShapes.length === 0}
                            onClick={handleEnhanceObjects}
                            className={`w-8 h-8 flex items-center justify-center rounded-md transition 
                         ${aiPrompt.trim() && selectedShapes.length > 0
                                    ? "hover:bg-green-50 cursor-pointer bg-green-100"
                                    : "opacity-50 cursor-not-allowed"
                                }`}
                        >
                            <Sparkles className="w-4 h-4 text-green-600" />
                        </button>
                        <button
                            title="Copy View Link"
                            onClick={copyLink}
                            className="w-8 h-8 flex items-center justify-center rounded-md transition bg-blue-100 hover:bg-blue-200"
                        >
                            <LinkIcon className="w-4 h-4 text-blue-600" />
                        </button>
                    </div>
                    <ThemeToggle />
                </div>
            </header>

            <main className="absolute top-14 bottom-0 left-0 right-48 flex">
                <div className="flex-1 relative">
                    <Canvas
                        showGrid={showGrid}
                        canvasRef={canvasRef}
                        editorRef={editorRef}
                        saveCanvasState={saveCanvasState}
                    />
                </div>

                <LayersPanel editorRef={editorRef} />
            </main>
        </div>
    );
}