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
import Canvas from "@/components/Canvas";
import LayersPanel from "@/components/LayersPanel";
import FloatingCam from "@/components/FloatingCam";
import type { DaydreamStreamResponse } from "@/lib/types";

// ---------------- Types ----------------
type SerializedStoreSnapshot = ReturnType<Editor["store"]["getSnapshot"]>;
type PageData = {
    id: string;
    name: string;
    canvasData: SerializedStoreSnapshot | null;
};
type DaydreamPayload = {
    stream_id: string;
    prompt: string;
    input_stream?: MediaStream;
};

// ---------------- Helpers ----------------
const generateShortId = (): string => {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    return Array.from({ length: 3 }, () =>
        Array.from({ length: 3 }, () => chars[Math.floor(Math.random() * chars.length)]).join("")
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

// ---------------- Main Component ----------------
export default function Board(): React.ReactElement {
    const { roomId } = useParams();
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const editorRef = useRef<Editor | null>(null);
    const socketRef = useRef<Socket | null>(null);
    const lastSavedState = useRef<string | null>(null);
    const videoStreamRef = useRef<MediaStream | null>(null);
    const [useEnhanced, setUseEnhanced] = useState<boolean>(false);
    const videoElementRef = useRef<HTMLVideoElement | null>(null);

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
                localStorage.setItem(`canvas-state-${roomId}`, JSON.stringify(newPages));
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

    const handleGenerateVideo = async (): Promise<void> => {
        const editor = editorRef.current;
        if (!editor) {
            toast.error("Editor not ready");
            return;
        }
        if (!generatePrompt.trim()) {
            toast.error("Enter a generation prompt");
            return;
        }
        if (!videoStreamRef.current) {
            toast.error("Webcam stream not available");
            return;
        }

        setIsGenerating(true);
        try {
            // Create stream
            const streamResponse = await fetch("/api/daydream/stream", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ pipeline_id: "pip_qpUgXycjWF6YMeSL" }),
            });
            if (!streamResponse.ok) throw new Error("Failed to create stream");
            const { id: streamId, whip_url } = await streamResponse.json();

            // Send webcam stream to WHIP endpoint
            const peerConnection = new RTCPeerConnection();
            videoStreamRef.current.getTracks().forEach(track => peerConnection.addTrack(track, videoStreamRef.current!));
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            const whipResponse = await fetch(whip_url, {
                method: "POST",
                headers: { "Content-Type": "application/sdp" },
                body: offer.sdp,
            });
            if (!whipResponse.ok) throw new Error("Failed to send stream to WHIP");
            const answer = await whipResponse.text();
            await peerConnection.setRemoteDescription({ type: "answer", sdp: answer });

            // Submit prompt
            const promptResponse = await fetch(`/api/daydream/prompt`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    stream_id: streamId,
                    prompt: generatePrompt,
                }),
            });
            if (!promptResponse.ok) throw new Error("Failed to submit prompt");
            const result = await promptResponse.json();
            const videoUrl = result.output_rtmp_url;
            if (!videoUrl) {
                toast.error("No video generated");
                return;
            }

            // Add video to canvas
            editor.createShapes([
                {
                    type: "geo",
                    x: 100,
                    y: 100,
                    props: { geo: "rectangle", w: 280, h: 180 },
                    meta: {
                        name: `Video ${editor.getCurrentPageShapes().length + 1}`,
                        hidden: false,
                        videoUrl,
                    },
                },
            ]);

            // Update video element
            if (videoElementRef.current) {
                videoElementRef.current.src = videoUrl;
                videoElementRef.current.play().catch(() => { });
            }

            saveCanvasState();
            toast.success("Video stream added");
        } catch (err) {
            toast.error("Video generation failed");
            console.error("GenerateVideo error:", err);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleEnhanceVideo = async (): Promise<void> => {
        const editor = editorRef.current;
        if (!editor) {
            toast.error("Editor not ready");
            return;
        }
        if (!aiPrompt.trim()) {
            toast.error("Enter an enhancement prompt");
            return;
        }
        if (!videoStreamRef.current) {
            toast.error("Webcam stream not available");
            return;
        }

        setIsEnhancing(true);
        try {
            // Create stream
            const streamResponse = await fetch("/api/daydream/stream", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ pipeline_id: "pip_qpUgXycjWF6YMeSL" }),
            });
            if (!streamResponse.ok) throw new Error("Failed to create stream");
            const { id: streamId, whip_url } = await streamResponse.json();

            // Send webcam stream to WHIP endpoint
            const peerConnection = new RTCPeerConnection();
            videoStreamRef.current.getTracks().forEach(track => peerConnection.addTrack(track, videoStreamRef.current!));
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            const whipResponse = await fetch(whip_url, {
                method: "POST",
                headers: { "Content-Type": "application/sdp" },
                body: offer.sdp,
            });
            if (!whipResponse.ok) throw new Error("Failed to send stream to WHIP");
            const answer = await whipResponse.text();
            await peerConnection.setRemoteDescription({ type: "answer", sdp: answer });

            // Submit prompt
            const promptResponse = await fetch(`/api/daydream/prompt`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    stream_id: streamId,
                    prompt: aiPrompt,
                }),
            });
            if (!promptResponse.ok) throw new Error("Failed to submit prompt");
            const result = await promptResponse.json();
            const videoUrl = result.output_rtmp_url;
            if (!videoUrl) {
                toast.error("No enhanced video generated");
                return;
            }

            // Update video element
            if (videoElementRef.current) {
                videoElementRef.current.src = videoUrl;
                videoElementRef.current.play().catch(() => { });
            }

            saveCanvasState();
            toast.success("Video stream enhanced");
        } catch (err) {
            toast.error("Video enhancement failed");
            console.error("EnhanceVideo error:", err);
        } finally {
            setIsEnhancing(false);
        }
    };

    // Sync video stream and enhancement state from FloatingCam
    const handleCamStateChange = useCallback((stream: MediaStream | null, enhanced: boolean) => {
        videoStreamRef.current = stream;
        setUseEnhanced(enhanced);
        if (enhanced && aiPrompt.trim()) {
            handleEnhanceVideo();
        }
    }, [aiPrompt]);

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
        socket.on("connect_error", (err: Error) => console.warn("Socket connect error:", err));
        return () => {
            try {
                socket.disconnect();
            } catch {
                /* ignore */
            }
        };
    }, [roomId]);

    if (!roomId || typeof roomId !== "string") {
        return <div className="text-red-500 p-4">Error: Invalid or missing roomId</div>;
    }

    return (
        <div className="relative w-screen h-screen bg-neutral-50 dark:bg-zinc-900 text-neutral-900 dark:text-neutral-100">
            <header className="fixed top-0 left-0 right-0 h-14 z-[9999] flex items-center justify-between px-4 bg-white/70 dark:bg-zinc-900/70 backdrop-blur-md border-b border-neutral-200 dark:border-zinc-800">
                <div className="flex items-center gap-3">
                    <Link href="/" title="Back to Home">
                        <Home className="w-5 h-5" />
                    </Link>
                    <h1 className="text-sm font-semibold">Bezalel Board</h1>
                </div>
                <div className="flex items-center gap-2">
                    <input
                        aria-label="Enhance video prompt"
                        placeholder="Enhance video..."
                        value={aiPrompt}
                        onChange={(e) => setAiPrompt(e.target.value)}
                        className="text-xs border border-neutral-300 dark:border-zinc-800 rounded-lg px-2 py-1 w-40 bg-white dark:bg-zinc-800 text-neutral-900 dark:text-neutral-100"
                    />
                    <button
                        onClick={handleEnhanceVideo}
                        title="Enhance video stream"
                        disabled={!aiPrompt.trim() || isEnhancing}
                        className="px-2 py-1 rounded-lg bg-gradient-to-r from-indigo-600 to-fuchsia-500 text-white disabled:opacity-40 transition-all hover:scale-105 active:scale-95"
                    >
                        <Sparkles className="w-4 h-4" />
                    </button>
                    <input
                        aria-label="Generate video prompt"
                        placeholder="Generate video..."
                        value={generatePrompt}
                        onChange={(e) => setGeneratePrompt(e.target.value)}
                        className="text-xs border border-neutral-300 dark:border-zinc-800 rounded-lg px-2 py-1 w-40 bg-white dark:bg-zinc-800 text-neutral-900 dark:text-neutral-100"
                    />
                    <button
                        onClick={handleGenerateVideo}
                        title="Generate new video"
                        disabled={!generatePrompt.trim() || isGenerating}
                        className="px-2 py-1 rounded-lg bg-gradient-to-r from-indigo-600 to-fuchsia-500 text-white disabled:opacity-40 transition-all hover:scale-105 active:scale-95"
                    >
                        <ImageIcon className="w-4 h-4" />
                    </button>
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
            <main className="absolute top-14 bottom-0 left-0 right-0 flex">
                <FloatingCam onStateChange={handleCamStateChange} />
                <div className="flex-1 relative">
                    <Canvas
                        showGrid={showGrid}
                        canvasRef={canvasRef}
                        editorRef={editorRef as React.RefObject<Editor>}
                        saveCanvasState={saveCanvasState}
                    />
                    <video
                        ref={videoElementRef}
                        muted
                        playsInline
                        className="absolute"
                        style={{ display: "none" }}
                    />
                    <div className="absolute top-16 left-4 text-xs text-neutral-500 dark:text-neutral-400">
                        Selected Shapes: {selectedShapes.length} ({selectedShapes.join(", ")})
                    </div>
                </div>
            </main>
        </div>
    );
}