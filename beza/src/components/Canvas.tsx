"use client";

import { useEffect, useRef } from "react";
import { Editor, Tldraw } from "@tldraw/tldraw";
import "@tldraw/tldraw/tldraw.css";

const MockTranslationProvider = ({ children }: { children: React.ReactNode }) => {
    return <>{children}</>;
};

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

    useEffect(() => {
        if (isMounted.current || !containerRef.current) {
            console.log("Canvas mount skipped, already mounted");
            return;
        }
        isMounted.current = true;
        console.log("Canvas mounting, container:", containerRef.current);

        const container = containerRef.current;
        const handleClick = () => {
            if (!editorRef.current) return;
            editorRef.current.focus();
            console.log("Click, editor focused");
        };

        container.addEventListener("click", handleClick);

        return () => {
            console.log("Canvas unmounting");
            container.removeEventListener("click", handleClick);
        };
    }, [editorRef]);

    useEffect(() => {
        if (!editorRef.current) return;

        const unsubscribe = editorRef.current.store.listen(
            (changes) => {
                if (changes.source === "user") {
                    saveCanvasState();
                    console.log("Canvas state changed, saving...");
                }
            },
            { scope: "document" }
        );

        return () => {
            unsubscribe();
            console.log("Unsubscribed from editor changes");
        };
    }, [editorRef, saveCanvasState]);

    return (
        <div className="absolute inset-0 z-[1000]" ref={containerRef}>
            <MockTranslationProvider>
                <Tldraw
                    onMount={(editor: Editor) => {
                        editorRef.current = editor;
                        editor.setCurrentTool("select");
                        editor.updateInstanceState({ isGridMode: showGrid });
                        canvasRef.current = editor.getContainer().querySelector("canvas") || canvasRef.current;
                        editor.focus();
                        console.log("Tldraw editor mounted:", editor);
                    }}
                >
                    <canvas ref={canvasRef} style={{ display: "none" }} />
                </Tldraw>
            </MockTranslationProvider>
        </div>
    );
}