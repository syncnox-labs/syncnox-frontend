"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type AutoSaveSource = "auto" | "manual";
export type AutoSaveStatus = "idle" | "saving" | "saved";

interface UseQueuedAutoSaveOptions {
  enabled: boolean;
  save: (source: AutoSaveSource) => Promise<unknown>;
  onError?: (error: unknown, source: AutoSaveSource) => void;
  delay?: number;
}

/**
 * Debounces edits, always invokes the latest save callback, and serializes
 * requests so an older response cannot race a newer save.
 */
export const useQueuedAutoSave = ({
  enabled,
  save,
  onError,
  delay = 1500,
}: UseQueuedAutoSaveOptions) => {
  const [status, setStatus] = useState<AutoSaveStatus>("idle");

  const saveRef = useRef(save);
  const onErrorRef = useRef(onError);
  const enabledRef = useRef(enabled);
  const mountedRef = useRef(true);
  const dirtyRef = useRef(false);
  const changeVersionRef = useRef(0);
  const saveChainRef = useRef<Promise<unknown>>(Promise.resolve());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    saveRef.current = save;
    onErrorRef.current = onError;
    enabledRef.current = enabled;
  }, [enabled, onError, save]);

  const clearTimers = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (statusResetTimerRef.current) {
      clearTimeout(statusResetTimerRef.current);
      statusResetTimerRef.current = null;
    }
  }, []);

  const queueSave = useCallback((source: AutoSaveSource, version: number) => {
    const run = async () => {
      if (!enabledRef.current) return;

      if (mountedRef.current) setStatus("saving");

      try {
        await saveRef.current(source);

        if (changeVersionRef.current === version) {
          dirtyRef.current = false;
          if (mountedRef.current) {
            setStatus("saved");
            statusResetTimerRef.current = setTimeout(() => {
              if (mountedRef.current && changeVersionRef.current === version) {
                setStatus("idle");
              }
            }, 2000);
          }
        }
      } catch (error) {
        onErrorRef.current?.(error, source);
        if (mountedRef.current && changeVersionRef.current === version) {
          setStatus("idle");
        }
        if (source === "manual") throw error;
      }
    };

    const queued = saveChainRef.current.catch(() => undefined).then(run);
    saveChainRef.current = queued.catch(() => undefined);
    return queued;
  }, []);

  const scheduleAutoSave = useCallback(() => {
    if (!enabledRef.current) return;

    clearTimers();
    dirtyRef.current = true;
    const version = ++changeVersionRef.current;
    if (mountedRef.current) setStatus("saving");

    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void queueSave("auto", version);
    }, delay);
  }, [clearTimers, delay, queueSave]);

  const saveNow = useCallback(() => {
    if (!enabledRef.current) return Promise.resolve();

    clearTimers();
    dirtyRef.current = true;
    const version = ++changeVersionRef.current;
    return queueSave("manual", version);
  }, [clearTimers, queueSave]);

  const flushPendingOnUnmount = useCallback(() => {
    mountedRef.current = false;
    clearTimers();

    // Preserve the last valid edit when the user immediately switches rows.
    if (dirtyRef.current && enabledRef.current) {
      void queueSave("auto", changeVersionRef.current);
    }
  }, [clearTimers, queueSave]);

  useEffect(() => {
    mountedRef.current = true;
    return flushPendingOnUnmount;
  }, [flushPendingOnUnmount]);

  return { status, scheduleAutoSave, saveNow };
};
