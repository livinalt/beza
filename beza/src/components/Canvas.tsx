"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import dynamic from "next/dynamic";
import {
    Editor,
    TLComponents,
    TLUnknownShape,
    StoreBeforeCreateHandler,
    RecordsDiff,
    TLRecord,
    ChangeSource,
} from "@tldraw/tldraw";
import { getSnapshot } from "tldraw";
import debounce from "lodash.debounce";
import "@tldraw/tldraw/tldraw.css";
import LayersPanel from "./LayersPanel";
import FloatingCam from "./FloatingCam";

// Dynamic import for Tldraw
const Tldraw = dynamic(() => import("@tldraw/tldraw").then((mod) => mod.Tldraw), {
    ssr: false,
});

interface ShapeMeta {
    name?: string;
    hidden?: boolean;
    originalX?: number;
    originalY?: number;
    videoUrl?: string;
}

interface CanvasProps {
    showGrid: boolean;
    canvasRef: React.MutableRefObject<HTMLCanvasElement | null>;
    editorRef: React.MutableRefObject<Editor | null>;
    saveCanvasState: () => void;
}

export default function Canvas({
    showGrid,
    canvasRef,
    editorRef,
    saveCanvasState,
}: CanvasProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const isMounted = useRef(false);
    const [isDarkMode, setIsDarkMode] = useState(false);

    const debouncedSave = useCallback(
        debounce(() => {
            const editor = editorRef.current;
            if (!editor) return;
            try {
                const snapshot = getSnapshot(editor.store);
                const save = () => {
                    try {
                        saveCanvasState();
                    } catch (err) {
                        console.error("Failed to save snapshot:", err);
                    }
                };
                if (typeof window !== "undefined" && window.requestIdleCallback) {
                    window.requestIdleCallback(save);
                } else {
                    setTimeout(save, 0);
                }
            } catch (err) {
                console.error("Snapshot error:", err);
            }
        }, 800),
        [editorRef, saveCanvasState]
    );

    useEffect(() => {
        if (typeof window === "undefined") return;
        const updateDarkMode = () => {
            setIsDarkMode(document.documentElement.classList.contains("dark"));
        };
        updateDarkMode();
        const observer = new MutationObserver(updateDarkMode);
        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ["class"],
        });
        return () => observer.disconnect();
    }, []);

    const components: TLComponents = {
        InFrontOfTheCanvas: () => (
            <>
                <LayersPanel editorRef={editorRef} selectedShapes={[]} />
                {editorRef.current?.getCurrentPageShapes().map(shape => {
                    const meta = shape.meta as ShapeMeta;
                    if (meta.videoUrl && !meta.hidden) {
                        return (
                            <video
                                key={shape.id}
                                src={meta.videoUrl}
                                muted
                                autoPlay
                                loop
                                playsInline
                                style={{
                                    position: "absolute",
                                    left: shape.x,
                                    top: shape.y,
                                    width: (shape.props as any).w,
                                    height: (shape.props as any).h,
                                    zIndex: 1000,
                                }}
                            />
                        );
                    }
                    return null;
                })}
            </>
        ),
    };

    useEffect(() => {
        if (isMounted.current || !containerRef.current) return;
        isMounted.current = true;
        const container = containerRef.current;
        const handleClick = () => {
            editorRef.current?.focus();
        };
        container.addEventListener("click", handleClick, { passive: true });
        editorRef.current?.focus();
        return () => {
            container.removeEventListener("click", handleClick);
        };
    }, [editorRef]);

    useEffect(() => {
        if (!editorRef.current) return;
        const editor = editorRef.current;
        if (editor.getCurrentPageShapes().length === 0) {
            editor.createShapes([
                {
                    type: "geo",
                    x: 100,
                    y: 100,
                    props: { geo: "rectangle", w: 100, h: 100 },
                    meta: {
                        name: "Rectangle 1",
                        hidden: false,
                        originalX: 100,
                        originalY: 100,
                    },
                },
            ]);
        }

        const handleShapeCreate: StoreBeforeCreateHandler<TLUnknownShape> = (shape) => {
            if (!shape.meta || !("name" in shape.meta)) {
                return {
                    ...shape,
                    meta: {
                        ...shape.meta,
                        name: `${shape.type} ${editor.getCurrentPageShapes().length + 1}`,
                        hidden: false,
                        originalX: shape.x,
                        originalY: shape.y,
                    },
                };
            }
            return shape;
        };

        const unsubscribe = editor.sideEffects.registerBeforeCreateHandler(
            "shape",
            handleShapeCreate
        );

        debouncedSave();
        return () => {
            unsubscribe();
        };
    }, [editorRef, debouncedSave]);

    const handleStoreChange = useCallback(
        ({ source }: { changes: RecordsDiff<TLRecord>; source: ChangeSource }) => {
            if (source === "user") {
                debouncedSave();
            }
        },
        [debouncedSave]
    );

    useEffect(() => {
        if (!editorRef.current) return;
        const editor = editorRef.current;
        const unsubscribe = editor.store.listen(handleStoreChange, { scope: "all" });
        return () => unsubscribe();
    }, [editorRef, handleStoreChange]);

    const handleMount = useCallback(
        (editor: Editor) => {
            editorRef.current = editor;
            editor.setCurrentTool("select");
            editor.updateInstanceState({ isGridMode: showGrid });
            const canvas = editor.getContainer().querySelector("canvas");
            if (canvas) {
                canvasRef.current = canvas;
            }
            editor.focus();
        },
        [editorRef, canvasRef, showGrid]
    );

    return (
        <div
            className="absolute inset-0 z-[1000] bg-neutral-50 dark:bg-zinc-900 border border-neutral-200 dark:border-zinc-700 rounded-lg shadow-sm"
            ref={containerRef}
            role="region"
            aria-label="Drawing Canvas"
        >
            <Tldraw
                className={isDarkMode ? "dark" : ""}
                onMount={handleMount}
                components={components}
                persistenceKey="bezalel-board"
                getShapeVisibility={(shape: TLUnknownShape) =>
                    shape.meta?.force_show
                        ? "visible"
                        : shape.meta?.hidden
                            ? "hidden"
                            : "inherit"
                }
            >
                <canvas ref={canvasRef} style={{ display: "none" }} aria-hidden="true" />
            </Tldraw>
        </div>
    );
}