"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

export default function ThemeToggle() {
    const { theme, setTheme } = useTheme();
    const [mounted, setMounted] = useState(false);

    useEffect(() => setMounted(true), []);
    if (!mounted) return null; // avoids hydration issues

    return (
        <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label="Toggle theme"
            className="relative flex items-center justify-center w-9 h-9 rounded-full 
                 bg-white/70 hover:bg-white dark:bg-zinc-800/70 dark:hover:bg-zinc-700
                 border border-zinc-200/50 dark:border-zinc-700/50
                 transition-all"
        >
            {/* Sun Icon (visible in light mode) */}
            <Sun
                className={`absolute h-5 w-5 text-yellow-500 transition-transform duration-300 ${theme === "dark" ? "scale-0 opacity-0 rotate-90" : "scale-100 opacity-100 rotate-0"
                    }`}
            />
            {/* Moon Icon (visible in dark mode) */}
            <Moon
                className={`absolute h-5 w-5 text-indigo-400 transition-transform duration-300 ${theme === "dark" ? "scale-100 opacity-100 rotate-0" : "scale-0 opacity-0 -rotate-90"
                    }`}
            />
        </button>
    );
}
