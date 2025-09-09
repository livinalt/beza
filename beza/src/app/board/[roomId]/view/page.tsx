
"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { io, Socket } from "socket.io-client";
import { toast } from "sonner";

export default function View() {
    const { roomId } = useParams();
    const socketRef = useRef<Socket | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        console.log("Viewer joining room:", roomId);
        const socket = io(process.env.NEXT_PUBLIC_SIGNALING_URL || "http://localhost:3001");
        socketRef.current = socket;

        socket.on("connect", () => {
            console.log("Socket connected:", socket.id);
            socket.emit("joinSession", roomId);
        });

        socket.on("connect_error", (err) => {
            console.error("Socket connection error:", err);
            setError(`Socket connection failed: ${err.message}`);
            toast.error(`Socket connection failed: ${err.message}`);
        });

        return () => {
            console.log("Disconnecting socket");
            socket.disconnect();
        };
    }, [roomId]);

    return (
        <div className="relative flex w-screen h-screen items-center justify-center bg-black">
            {error && (
                <div className="absolute inset-0 flex items-center justify-center text-red-500 bg-black/80">
                    <p>{error}</p>
                </div>
            )}
            <div className="text-white text-center">
                <h2 className="text-2xl font-bold mb-4">Streaming Disabled</h2>
                <p>Canvas streaming is no longer available. Contact the board owner for details.</p>
            </div>
        </div>
    );
}