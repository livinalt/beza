"use client";

import ThemeToggle from "@/components/ThemeToggle";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { v4 as uuidv4 } from "uuid";

export default function Home() {
  const router = useRouter();

  const createBoard = () => {
    const roomId = uuidv4();
    router.push(`/board/${roomId}`);
  };

  return (
    <div className="h-screen flex flex-col bg-neutral-100 dark:bg-zinc-900 text-neutral-900 dark:text-neutral-100 transition-colors duration-500">
      {/* Navbar */}
      <header className="shrink-0 backdrop-blur-md bg-white/80 dark:bg-zinc-900/80 border-b border-neutral-200 dark:border-neutral-700">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 to-fuchsia-500 text-white font-bold">
              BZ
            </span>
            <span className="font-semibold tracking-tight text-xl">
              Bezalel
            </span>
          </div>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <button
              className="rounded-xl bg-gradient-to-r from-indigo-600 to-fuchsia-500 text-white px-5 py-2 text-sm font-medium hover:scale-105 transition-all"
              onClick={createBoard}
              aria-label="Create a new drawing board"
            >
              Create New Board
            </button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-grow flex items-center">
        <div className="mx-auto max-w-6xl px-6 grid md:grid-cols-2 gap-12 items-center">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-neutral-200 dark:border-neutral-700 px-3 py-1 text-xs text-neutral-600 dark:text-neutral-300 bg-white/60 dark:bg-zinc-800/60 backdrop-blur-sm">
              <span className="h-2 w-2 rounded-full bg-green-500" /> Live & Fun
            </div>
            <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight leading-tight bg-gradient-to-r from-indigo-600 to-fuchsia-500 bg-clip-text text-transparent">
              Draw, Enhance, Stream
            </h1>
            <p className="text-lg text-neutral-600 dark:text-neutral-300 max-w-prose">
              Create sketches, enhance them with AI, and stream your art live to
              the world. Simple, fun, and browser-based.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-4">
              <button
                onClick={createBoard}
                className="inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-indigo-600 to-fuchsia-500 px-6 py-3 text-white font-medium hover:scale-105 transition-all"
                aria-label="Start drawing now"
              >
                Start Drawing Now
              </button>
              <Link
                href="/view/demo"
                className="inline-flex items-center justify-center rounded-2xl border border-neutral-300 dark:border-neutral-700 px-6 py-3 font-medium hover:bg-neutral-50 dark:hover:bg-zinc-800 transition-all"
                aria-label="Watch a live demo"
              >
                Watch a Demo
              </Link>
            </div>
            <div className="text-sm text-neutral-500 dark:text-neutral-400">
              No sign-up required. Works in your browser.
            </div>
          </div>

          {/* Preview Card */}
          <div className="relative">
            <div className="rounded-3xl border border-neutral-200 dark:border-neutral-700 bg-white/70 dark:bg-zinc-800/70 backdrop-blur-md shadow-2xl overflow-hidden hover:scale-[1.02] transition-transform">
              <div className="border-b border-neutral-100 dark:border-neutral-800 px-4 py-3 text-sm flex items-center gap-2 bg-neutral-50/60 dark:bg-zinc-900/50">
                <span className="h-3 w-3 rounded-full bg-rose-400" />
                <span className="h-3 w-3 rounded-full bg-amber-400" />
                <span className="h-3 w-3 rounded-full bg-emerald-400" />
                <span className="ml-2 opacity-60">Live Canvas</span>
              </div>
              <div className="aspect-video bg-gradient-to-br from-indigo-100 to-fuchsia-100 dark:from-zinc-800 dark:to-zinc-900 flex items-center justify-center">
                <div className="rounded-2xl bg-white/80 dark:bg-zinc-800/70 px-6 py-5 shadow-lg text-center">
                  <div className="text-sm text-neutral-600 dark:text-neutral-300">
                    Live Preview
                  </div>
                  <div className="mt-2 text-xl font-semibold">
                    Your canvas stream appears here
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="shrink-0 border-t border-neutral-200 dark:border-neutral-700 bg-white/60 dark:bg-zinc-900/60 backdrop-blur-md">
        <div className="mx-auto max-w-6xl px-6 py-4 flex flex-col sm:flex-row items-center justify-between text-sm text-neutral-500 dark:text-neutral-400">
          <p>© {new Date().getFullYear()} Bezalel. All rights reserved.</p>
          <div className="flex gap-4 mt-3 sm:mt-0">
            <Link href="/privacy" className="hover:underline">
              Privacy
            </Link>
            <Link href="/terms" className="hover:underline">
              Terms
            </Link>
            <Link href="/about" className="hover:underline">
              About
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
