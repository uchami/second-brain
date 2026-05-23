"use client";

import { useEffect, useState } from "react";
import { X, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

// Subset of the BeforeInstallPromptEvent API we use.
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "sb_install_banner_dismissed";

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  // iOS Safari exposes this non-standard prop when launched from home screen.
  return (window.navigator as { standalone?: boolean }).standalone === true;
}

function isSafari(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  return /^((?!chrome|android|crios|fxios).)*safari/i.test(ua);
}

export function InstallBanner() {
  const [mode, setMode] = useState<"hidden" | "install" | "safari">("hidden");
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(
    null,
  );

  useEffect(() => {
    if (isStandalone()) return;
    if (localStorage.getItem(DISMISS_KEY)) return;

    const onPrompt = (e: Event) => {
      // Stop Chrome's default mini-infobar; we render our own UI.
      e.preventDefault();
      setPromptEvent(e as InstallPromptEvent);
      setMode("install");
    };
    window.addEventListener("beforeinstallprompt", onPrompt);

    // Safari (incl. iOS) never fires beforeinstallprompt. Fall back to the
    // manual-instructions banner so the user knows there's a way.
    if (isSafari()) setMode("safari");

    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setMode("hidden");
  }

  async function install() {
    if (!promptEvent) return;
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    if (choice.outcome === "accepted") setMode("hidden");
    setPromptEvent(null);
  }

  if (mode === "hidden") return null;

  return (
    <div className="border-b border-neutral-200 bg-neutral-50 px-4 py-2 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 text-sm">
        {mode === "install" ? (
          <>
            <span className="text-neutral-700 dark:text-neutral-200">
              Instalá Second brain como app
            </span>
            <div className="flex items-center gap-1">
              <Button size="sm" onClick={install} className="h-7 px-2 text-xs">
                <Download size={12} />
                Instalar
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={dismiss}
                aria-label="Descartar"
                className="h-7 w-7"
              >
                <X size={14} />
              </Button>
            </div>
          </>
        ) : (
          <>
            <span className="text-neutral-700 dark:text-neutral-200">
              Safari es medio gato. Para instalar la app, usá Chrome o googleá
              cómo instalar PWAs en Safari.
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={dismiss}
              aria-label="Descartar"
              className="h-7 w-7"
            >
              <X size={14} />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
