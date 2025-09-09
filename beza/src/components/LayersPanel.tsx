
import "./layer-panel.css";
import { useState, useEffect, useRef, useCallback } from "react";
import { Editor } from "@tldraw/tldraw";
import { Eye, EyeOff, Layers, MoveUp, MoveDown, Edit2 } from "lucide-react";

interface Layer {
    id: string;
    name: string;
    isHidden: boolean;
    depth: number;
}

interface LayersPanelProps {
    editorRef: React.RefObject<Editor>;
}

export default function LayersPanel({ editorRef }: LayersPanelProps) {
    const [layers, setLayers] = useState<Layer[]>([]);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState<string>("");
    const inputRef = useRef<HTMLInputElement>(null);
    const updateTimeout = useRef<NodeJS.Timeout | null>(null);

    const buildLayerTree = useCallback((editor: Editor, parentId: string, depth: number = 0): Layer[] => {
        const shapeIds = editor.getSortedChildIdsForParent(parentId);
        const layers: Layer[] = [];
        shapeIds.forEach((id, index) => {
            const shape = editor.getShape(id);
            if (!shape) {
                console.warn("Shape not found:", id);
                return;
            }
            const meta = shape.meta as { name?: string; hidden?: boolean } | undefined;
            layers.push({
                id,
                name: meta?.name || `Layer ${index + 1}`,
                isHidden: editor.isShapeHidden(id) || false,
                depth,
            });
            if (editor.getSortedChildIdsForParent(id).length > 0) {
                layers.push(...buildLayerTree(editor, id, depth + 1));
            }
        });
        return layers;
    }, []);

    const updateLayers = useCallback(() => {
        if (!editorRef.current) return;
        try {
            const newLayers = buildLayerTree(editorRef.current, editorRef.current.getCurrentPageId());
            setLayers((prev) => {
                if (JSON.stringify(newLayers) === JSON.stringify(prev)) return prev;
                console.log("Layers updated:", newLayers);
                return newLayers;
            });
        } catch (error) {
            console.error("Error updating layers:", error);
        }
    }, [editorRef, buildLayerTree]);

    useEffect(() => {
        if (!editorRef.current) return;
        const editor = editorRef.current;

        updateLayers();
        const handleStoreUpdate = () => {
            if (updateTimeout.current) clearTimeout(updateTimeout.current);
            updateTimeout.current = setTimeout(updateLayers, 300);
        };

        const unsubscribe = editor.store.listen(handleStoreUpdate, { scope: "shape" });
        return () => {
            unsubscribe();
            if (updateTimeout.current) clearTimeout(updateTimeout.current);
        };
    }, [editorRef, updateLayers]);

    const toggleVisibility = (id: string) => {
        if (!editorRef.current) return;
        const editor = editorRef.current;
        const shape = editor.getShape(id);
        if (!shape) return;
        editor.setShapeHidden(id, !editor.isShapeHidden(id));
    };

    const moveLayerUp = (id: string) => {
        if (!editorRef.current) return;
        const editor = editorRef.current;
        const shapes = editor.getSortedChildIdsForParent(editor.getCurrentPageId());
        const index = shapes.indexOf(id);
        if (index < shapes.length - 1) editor.bringForward([id]);
    };

    const moveLayerDown = (id: string) => {
        if (!editorRef.current) return;
        const editor = editorRef.current;
        const shapes = editor.getSortedChildIdsForParent(editor.getCurrentPageId());
        const index = shapes.indexOf(id);
        if (index > 0) editor.sendBackward([id]);
    };

    const startEditing = (id: string, currentName: string) => {
        setEditingId(id);
        setEditName(currentName);
    };

    const saveName = (id: string) => {
        if (!editorRef.current || !editName.trim()) {
            setEditingId(null);
            return;
        }
        const editor = editorRef.current;
        const shape = editor.getShape(id);
        if (!shape) {
            setEditingId(null);
            return;
        }
        editor.updateShapes([
            {
                id,
                type: shape.type,
                meta: { ...shape.meta, name: editName.trim() },
            },
        ]);
        setEditingId(null);
    };

    const handleKeyDown = (e: React.KeyboardEvent, id: string) => {
        if (e.key === "Enter") saveName(id);
        else if (e.key === "Escape") setEditingId(null);
    };

    useEffect(() => {
        if (editingId && inputRef.current) inputRef.current.focus();
    }, [editingId]);

    return (
        <div className="layer-panel">
            <div className="layer-panel-title">
                <Layers className="w-4 h-4" />
                <h2>Layers</h2>
            </div>
            {layers.length === 0 && (
                <div className="text-xs text-gray-500 dark:text-gray-400 p-1">No shapes</div>
            )}
            {layers.map((layer) => (
                <div
                    key={layer.id}
                    className="flex items-center justify-between p-1 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded"
                    style={{ paddingLeft: `${layer.depth * 12 + 8}px` }}
                >
                    {editingId === layer.id ? (
                        <input
                            ref={inputRef}
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onKeyDown={(e) => handleKeyDown(e, layer.id)}
                            onBlur={() => saveName(layer.id)}
                            className="text-xs bg-transparent border border-gray-300 dark:border-zinc-600 rounded px-1 w-20"
                        />
                    ) : (
                        <span className="text-xs truncate flex-1" title={layer.name}>
                            {layer.name}
                        </span>
                    )}
                    <div className="flex gap-1">
                        <button
                            onClick={() => toggleVisibility(layer.id)}
                            className="p-1 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded"
                            title={layer.isHidden ? "Show layer" : "Hide layer"}
                        >
                            {layer.isHidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                        <button
                            onClick={() => startEditing(layer.id, layer.name)}
                            className="p-1 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded"
                            title="Rename layer"
                        >
                            <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => moveLayerUp(layer.id)}
                            className="p-1 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded"
                            title="Move layer up"
                        >
                            <MoveUp className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => moveLayerDown(layer.id)}
                            className="p-1 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded"
                            title="Move layer down"
                        >
                            <MoveDown className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            ))}
        </div>
    );
}