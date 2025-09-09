"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import dynamic from "next/dynamic";
import { Editor, TLComponents, TLUnknownShape, StoreBeforeCreateHandler, RecordsDiff, TLRecord, ChangeSource } from "@tldraw/tldraw";
import "@tldraw/tldraw/tldraw.css";
import LayersPanel from "./LayersPanel";

// Dynamic import for Tldraw to disable SSR
const Tldraw = dynamic(() => import("@tldraw/tldraw").then((mod) => mod.Tldraw), {
    ssr: false,
});

interface ShapeMeta {
    name?: string;
    hidden?: boolean;
    originalX?: number;
    originalY?: number;
    force_show?: boolean;
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

    // Detect dark mode on client-side only
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

    // Define custom components for Tldraw
    const components: TLComponents = {
        InFrontOfTheCanvas: () => <LayersPanel editorRef={editorRef} />,
    };

    // Handle container click to focus editor
    useEffect(() => {
        if (isMounted.current || !containerRef.current) return;
        isMounted.current = true;

        const container = containerRef.current;
        const handleClick = () => {
            if (editorRef.current) {
                editorRef.current.focus();
            }
        };

        container.addEventListener("click", handleClick, { passive: true });
        if (editorRef.current) {
            editorRef.current.focus();
        }

        return () => {
            container.removeEventListener("click", handleClick);
        };
    }, [editorRef]);

    // Handle initial shape creation and shape creation events
    useEffect(() => {
        if (!editorRef.current) return;
        const editor = editorRef.current;

        // Add initial shapes if none exist
        if (editor.getCurrentPageShapes().length === 0) {
            editor.createShapes([
                {
                    type: "geo",
                    x: 100,
                    y: 100,
                    props: { geo: "rectangle", w: 100, h: 100 },
                    meta: { name: "Rectangle 1", hidden: false, originalX: 100, originalY: 100 },
                },
            ]);
        }

        const handleShapeCreate: StoreBeforeCreateHandler<TLUnknownShape> = (shape) => {
            if (!shape.meta || !("name" in shape.meta)) {
                const updatedShape: TLUnknownShape = {
                    ...shape,
                    meta: {
                        ...shape.meta,
                        name: `${shape.type} ${editor.getCurrentPageShapes().length + 1}`,
                        hidden: false,
                        originalX: shape.x,
                        originalY: shape.y,
                    },
                };
                return updatedShape;
            }
            return shape;
        };

        const unsubscribe = editor.sideEffects.registerBeforeCreateHandler("shape", handleShapeCreate);
        saveCanvasState();

        return () => {
            unsubscribe();
        };
    }, [editorRef, saveCanvasState]);

    // Save canvas state on user changes
    const handleStoreChange = useCallback(
        ({ changes, source }: { changes: RecordsDiff<TLRecord>; source: ChangeSource }) => {
            if (source === "user") {
                saveCanvasState();
            }
        },
        [saveCanvasState]
    );

    useEffect(() => {
        if (!editorRef.current) return;
        const editor = editorRef.current;

        const unsubscribe = editor.store.listen(handleStoreChange, { scope: "all" });

        return () => {
            unsubscribe();
        };
    }, [editorRef, handleStoreChange]);

    // Handle Tldraw mount
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
                    shape.meta?.force_show ? "visible" : shape.meta?.hidden ? "hidden" : "inherit"
                }
            >
                <canvas ref={canvasRef} style={{ display: "none" }} aria-hidden="true" />
            </Tldraw>
        </div>
    );
}