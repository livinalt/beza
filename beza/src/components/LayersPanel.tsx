import "./layer-panel.css";
import { useState, useEffect, useRef, useCallback } from "react";
import { Editor, TLShapeId, TLParentId, JsonObject } from "@tldraw/tldraw";
import { Eye, EyeOff, Layers, MoveUp, MoveDown, Edit2 } from "lucide-react";

// Define stricter type for shape metadata
interface ShapeMeta {
    name?: string;
    hidden?: boolean;
    originalX?: number;
    originalY?: number;
}

// Define type for shape update
interface ShapeUpdate {
    id: TLShapeId;
    type: string;
    meta?: Partial<JsonObject>;
    x?: number;
    y?: number;
}

// Define Layer interface
interface Layer {
    id: TLShapeId;
    name: string;
    isHidden: boolean;
    depth: number;
}

interface LayersPanelProps {
    editorRef: React.MutableRefObject<Editor | null>; // Updated to allow null
    selectedShapes: TLShapeId[];  // Added selectedShapes prop to track selected layers
}

export default function LayersPanel({ editorRef, selectedShapes }: LayersPanelProps) {
    const [layers, setLayers] = useState<Layer[]>([]);
    const [editingId, setEditingId] = useState<TLShapeId | null>(null);
    const [editName, setEditName] = useState<string>("");
    const inputRef = useRef<HTMLInputElement>(null);

    // Build the layer tree recursively
    const buildLayerTree = useCallback(
        (editor: Editor, parentId: TLParentId, depth: number = 0): Layer[] => {
            const shapeIds = editor.getSortedChildIdsForParent(parentId);
            const layers: Layer[] = [];

            shapeIds.forEach((id, index) => {
                const shape = editor.getShape(id);
                if (!shape) return;

                const meta = (shape.meta ?? {}) as ShapeMeta;
                const shapeName = meta.name ?? shape.type ?? `Layer ${index + 1}`;
                const isHidden = !!meta.hidden;

                layers.push({
                    id,
                    name: shapeName,
                    isHidden,
                    depth,
                });

                if (editor.getSortedChildIdsForParent(id as TLParentId).length > 0) {
                    layers.push(...buildLayerTree(editor, id as TLParentId, depth + 1));
                }
            });

            return layers;
        },
        []
    );

    // Update layers when shapes change
    const updateLayers = useCallback(() => {
        if (!editorRef.current) return;
        try {
            const newLayers = buildLayerTree(editorRef.current, editorRef.current.getCurrentPageId());
            setLayers((prev) => {
                if (JSON.stringify(newLayers) === JSON.stringify(prev)) return prev;
                return newLayers;
            });
        } catch (error) {
            console.error("Error updating layers:", error);
        }
    }, [editorRef, buildLayerTree]);

    // Subscribe to editor store changes
    useEffect(() => {
        if (!editorRef.current) return;
        const editor = editorRef.current;

        updateLayers();

        const unsubscribe = editor.store.listen(() => {
            updateLayers();
        }, { scope: "all" });

        return () => unsubscribe();
    }, [editorRef, updateLayers]);

    // Toggle layer visibility
    const toggleVisibility = useCallback(
        (id: TLShapeId) => {
            if (!editorRef.current) return;
            const editor = editorRef.current;
            const shape = editor.getShape(id);
            if (!shape) return;

            const meta = (shape.meta ?? {}) as ShapeMeta;
            const currentHidden = !!meta.hidden;
            const newHidden = !currentHidden;

            const update: ShapeUpdate = {
                id,
                type: shape.type,
                meta: {
                    ...meta,
                    hidden: newHidden,
                    originalX: newHidden ? (meta.originalX ?? shape.x) : meta.originalX,
                    originalY: newHidden ? (meta.originalY ?? shape.y) : meta.originalY,
                },
                x: newHidden ? -99999 : (meta.originalX ?? shape.x),
                y: newHidden ? (meta.originalY ?? shape.y) : meta.originalY,
            };

            editor.updateShapes([update]);

            // Remove hidden layer from selection to keep selection state sane
            if (newHidden) {
                const newSelection = editor.getSelectedShapeIds().filter((selId) => selId !== id);
                editor.setSelectedShapes(newSelection);
            }
        },
        [editorRef]
    );

    // Move layer up in the z-index
    const moveLayerUp = useCallback(
        (id: TLShapeId) => {
            if (!editorRef.current) return;
            const editor = editorRef.current;
            const shapes = editor.getSortedChildIdsForParent(editor.getCurrentPageId());
            const index = shapes.indexOf(id);
            if (index < shapes.length - 1) {
                editor.bringForward([id]);
            }
        },
        [editorRef]
    );

    // Move layer down in the z-index
    const moveLayerDown = useCallback(
        (id: TLShapeId) => {
            if (!editorRef.current) return;
            const editor = editorRef.current;
            const shapes = editor.getSortedChildIdsForParent(editor.getCurrentPageId());
            const index = shapes.indexOf(id);
            if (index > 0) {
                editor.sendBackward([id]);
            }
        },
        [editorRef]
    );

    // Start editing a layer's name
    const startEditing = useCallback((id: TLShapeId, currentName: string) => {
        setEditingId(id);
        setEditName(currentName);
    }, []);

    // Save the edited layer name
    const saveName = useCallback(
        (id: TLShapeId) => {
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
            const update: ShapeUpdate = {
                id,
                type: shape.type,
                meta: { ...shape.meta, name: editName.trim() },
            };
            editor.updateShapes([update]);
            setEditingId(null);
        },
        [editorRef, editName]
    );

    // Handle keyboard events for editing
    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent, id: TLShapeId) => {
            if (e.key === "Enter") {
                saveName(id);
            } else if (e.key === "Escape") {
                setEditingId(null);
            }
        },
        [saveName]
    );

    // Focus input when editing starts
    useEffect(() => {
        if (editingId && inputRef.current) {
            inputRef.current.focus();
        }
    }, [editingId]);

    // Render fallback if editor is unavailable
    if (!editorRef.current) {
        return (
            <div className="layer-panel">
                <div className="layer-panel-title">
                    <Layers className="w-4 h-4" aria-hidden="true" />
                    <h2>Layers</h2>
                </div>
                <div className="text-xs text-gray-500 p-1">Editor unavailable</div>
            </div>
        );
    }

    return (
        <div className="layer-panel" role="region" aria-label="Layers Panel">
            <div className="layer-panel-title">
                <Layers className="w-4 h-4" aria-hidden="true" />
                <h2>Layers</h2>
            </div>
            <div className="text-xs text-gray-500 p-1">Layers: {layers.length}</div>
            {layers.length === 0 && (
                <div className="text-xs text-gray-500 dark:text-gray-400 p-1">No shapes</div>
            )}
            {layers.map((layer) => (
                <div
                    key={layer.id}
                    className={`flex items-center justify-between p-1 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded ${selectedShapes.includes(layer.id) ? "bg-blue-200 dark:bg-blue-900" : ""
                        }`}
                    style={{ paddingLeft: `${layer.depth * 12 + 8}px` }}
                    role="listitem"
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
                            aria-label={`Edit name for layer ${layer.name}`}
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
                            aria-label={layer.isHidden ? `Show layer ${layer.name}` : `Hide layer ${layer.name}`}
                        >
                            {layer.isHidden ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                        <button
                            onClick={() => startEditing(layer.id, layer.name)}
                            className="p-1 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded"
                            title="Rename layer"
                            aria-label={`Rename layer ${layer.name}`}
                        >
                            <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => moveLayerUp(layer.id)}
                            className="p-1 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded"
                            title="Move layer up"
                            aria-label={`Move layer ${layer.name} up`}
                            disabled={
                                editorRef.current
                                    ? editorRef.current.getSortedChildIdsForParent(editorRef.current.getCurrentPageId()).indexOf(layer.id) >=
                                    editorRef.current.getSortedChildIdsForParent(editorRef.current.getCurrentPageId()).length - 1
                                    : true
                            }
                        >
                            <MoveUp className="w-4 h-4" />
                        </button>
                        <button
                            onClick={() => moveLayerDown(layer.id)}
                            className="p-1 hover:bg-gray-200 dark:hover:bg-zinc-700 rounded"
                            title="Move layer down"
                            aria-label={`Move layer ${layer.name} down`}
                            disabled={
                                editorRef.current
                                    ? editorRef.current.getSortedChildIdsForParent(editorRef.current.getCurrentPageId()).indexOf(layer.id) <= 0
                                    : true
                            }
                        >
                            <MoveDown className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            ))}
        </div>
    );
}
