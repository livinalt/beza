"use client";

import React, { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Video, VideoOff, Sparkles, Minus, Camera } from "lucide-react";

type Position = { x: number; y: number };

interface FloatingCamProps {
    onStateChange?: (stream: MediaStream | null, useEnhanced: boolean) => void;
}

export default function FloatingCam({ onStateChange }: FloatingCamProps) {
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const streamRef = useRef<MediaStream | null>(null);

    const [position, setPosition] = useState<Position>({ x: 0, y: 0 });
    const [dragging, setDragging] = useState(false);
    const dragOffset = useRef<Position>({ x: 0, y: 0 });

    const [audioOn, setAudioOn] = useState(true);
    const [videoOn, setVideoOn] = useState(true);
    const [useEnhanced, setUseEnhanced] = useState(false);
    const [minimized, setMinimized] = useState(false);
    const rafRef = useRef<number | null>(null);

    const [size, setSize] = useState({ width: 280, height: 180 });
    const CIRCLE_SIZE = 56;

    // Responsive sizing
    useEffect(() => {
        function updateSize() {
            const w = Math.min(Math.max(window.innerWidth * 0.2, 200), 360);
            const h = (w * 9) / 16;
            setSize({ width: Math.round(w), height: Math.round(h) });
        }
        updateSize();
        window.addEventListener("resize", updateSize);
        return () => window.removeEventListener("resize", updateSize);
    }, []);

    // Default position: bottom-right
    useEffect(() => {
        const handleResize = () => {
            setPosition({
                x: window.innerWidth - size.width - 24,
                y: window.innerHeight - size.height - 24,
            });
        };
        handleResize();
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, [size]);

    // Camera + mic setup
    useEffect(() => {
        let mounted = true;
        async function start() {
            try {
                const s = await navigator.mediaDevices.getUserMedia({
                    video: true,
                    audio: true,
                });
                if (!mounted) return;
                streamRef.current = s;
                if (videoRef.current) {
                    videoRef.current.srcObject = s;
                    await videoRef.current.play().catch(() => { });
                }
                onStateChange?.(s, useEnhanced);
            } catch (err) {
                console.error("Couldn't get media:", err);
            }
        }
        start();
        return () => {
            mounted = false;
            streamRef.current?.getTracks().forEach((t) => t.stop());
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, [onStateChange]);

    // Toggle audio
    useEffect(() => {
        streamRef.current?.getAudioTracks().forEach((t) => (t.enabled = audioOn));
    }, [audioOn]);

    // Toggle video
    useEffect(() => {
        streamRef.current?.getVideoTracks().forEach((t) => (t.enabled = videoOn));
        if (videoRef.current) {
            if (!videoOn) videoRef.current.pause();
            else videoRef.current.play().catch(() => { });
        }
    }, [videoOn]);

    // Update parent on enhancement toggle
    useEffect(() => {
        onStateChange?.(streamRef.current, useEnhanced);
    }, [useEnhanced, onStateChange]);

    // Fake filter loop (fallback if API fails)
    useEffect(() => {
        const canvas = canvasRef.current;
        const video = videoRef.current;
        if (!canvas || !video) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        let running = true;
        function tick() {
            if (!running) return;
            const w = (canvas.width = size.width);
            const h = (canvas.height = size.height);
            ctx.drawImage(video, 0, 0, w, h);
            if (useEnhanced) {
                const img = ctx.getImageData(0, 0, w, h);
                const data = img.data;
                for (let i = 0; i < data.length; i += 4) {
                    data[i] = Math.min(255, data[i] + 10);
                    data[i + 1] = Math.min(255, data[i + 1] + 5);
                }
                ctx.putImageData(img, 0, 0);
            }
            rafRef.current = requestAnimationFrame(tick);
        }
        if (videoOn) tick();
        return () => {
            running = false;
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, [useEnhanced, videoOn, size]);

    // Dragging with viewport clamping
    function onPointerDown(e: React.PointerEvent) {
        if (!containerRef.current) return;
        (e.target as Element).setPointerCapture(e.pointerId);
        setDragging(true);
        const rect = containerRef.current.getBoundingClientRect();
        dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    function onPointerMove(e: React.PointerEvent) {
        if (!dragging) return;
        const newX = e.clientX - dragOffset.current.x;
        const newY = e.clientY - dragOffset.current.y;
        const clampedX = Math.max(0, Math.min(newX, window.innerWidth - size.width));
        const clampedY = Math.max(0, Math.min(newY, window.innerHeight - size.height));
        setPosition({ x: clampedX, y: clampedY });
    }

    function onPointerUp(e: React.PointerEvent) {
        setDragging(false);
        try {
            (e.target as Element).releasePointerCapture(e.pointerId);
        } catch { }

        const midX = window.innerWidth / 2;
        const midY = window.innerHeight / 2;
        const x = position.x + size.width / 2 < midX ? 24 : window.innerWidth - size.width - 24;
        const y = position.y + size.height / 2 < midY ? 24 : window.innerHeight - size.height - 24;
        setPosition({ x, y });
    }

    return (
        <div
            ref={containerRef}
            className="fixed z-[9999] transition-transform duration-200 ease-out"
            style={{
                transform: `translate(${position.x}px, ${position.y}px)`,
                width: minimized ? CIRCLE_SIZE : size.width,
                height: minimized ? CIRCLE_SIZE : size.height,
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
        >
            {minimized ? (
                <button
                    onClick={() => setMinimized(false)}
                    className="w-full h-full rounded-full bg-white/70 dark:bg-zinc-800/70 border border-zinc-200/50 dark:border-zinc-700/50 shadow-lg flex items-center justify-center"
                >
                    <Camera className="w-5 h-5 text-zinc-700 dark:text-zinc-300" />
                </button>
            ) : (
                <div
                    className="w-full h-full rounded-xl overflow-hidden shadow-xl bg-white/80 dark:bg-zinc-800/80 border border-zinc-200/50 dark:border-zinc-700/50 backdrop-blur-md relative"
                >
                    <video
                        ref={videoRef}
                        muted={!audioOn}
                        playsInline
                        className={`w-full h-full object-contain transition-opacity ${useEnhanced ? "opacity-0" : "opacity-100"}`}
                        style={{ display: videoOn ? undefined : "none" }}
                    />
                    <canvas
                        ref={canvasRef}
                        className={`absolute inset-0 w-full h-full object-contain ${useEnhanced ? "block" : "hidden"}`}
                    />
                    <div className="absolute inset-x-0 bottom-2 flex items-center justify-center gap-3">
                        <button
                            onClick={() => setAudioOn((v) => !v)}
                            className="p-2 rounded-full bg-white/80 dark:bg-zinc-800/80 hover:bg-zinc-200/70 dark:hover:bg-zinc-700/70 shadow-md"
                        >
                            {audioOn ? (
                                <Mic className="w-5 h-5 text-zinc-800 dark:text-zinc-200" />
                            ) : (
                                <MicOff className="w-5 h-5 text-red-500" />
                            )}
                        </button>
                        <button
                            onClick={() => setVideoOn((v) => !v)}
                            className="p-2 rounded-full bg-white/80 dark:bg-zinc-800/80 hover:bg-zinc-200/70 dark:hover:bg-zinc-700/70 shadow-md"
                        >
                            {videoOn ? (
                                <Video className="w-5 h-5 text-zinc-800 dark:text-zinc-200" />
                            ) : (
                                <VideoOff className="w-5 h-5 text-red-500" />
                            )}
                        </button>
                        <button
                            onClick={() => setUseEnhanced((v) => !v)}
                            className="p-2 rounded-full bg-white/80 dark:bg-zinc-800/80 hover:bg-zinc-200/70 dark:hover:bg-zinc-700/70 shadow-md"
                        >
                            <Sparkles className="w-5 h-5 text-indigo-500" />
                        </button>
                        <button
                            onClick={() => setMinimized(true)}
                            className="p-2 rounded-full bg-white/80 dark:bg-zinc-800/80 hover:bg-zinc-200/70 dark:hover:bg-zinc-700/70 shadow-md"
                        >
                            <Minus className="w-5 h-5 text-zinc-800 dark:text-zinc-200" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}