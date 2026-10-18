import { useCallback, useEffect, useMemo, useRef, useState } from "react";

function useUploadQueue({ onComplete } = {}) {
    const [items, setItems] = useState([]);
    const [elapsed, setElapsed] = useState(0);
    const [speed, setSpeed] = useState(0);

    const startedAtRef = useRef(null);
    const completedIdsRef = useRef(new Set());
    const previousProgressRef = useRef({
        bytes: 0,
        time: null,
    });

    const uploadingId = useMemo(() => items.find((item) => item.status === "uploading")?.id ?? null, [items]);

    const totalBytes = useMemo(() => items.reduce((total, item) => total + item.file.size, 0), [items]);

    const uploadedBytes = useMemo(
        () => items.reduce((total, item) => total + (item.file.size * item.progress) / 100, 0),
        [items],
    );

    const progress = totalBytes > 0 ? Math.round((uploadedBytes / totalBytes) * 100) : 0;

    const completedFiles = useMemo(() => items.filter((item) => item.status === "completed").length, [items]);

    const totalFiles = items.length;

    const addFiles = useCallback((files) => {
        const newItems = files.map((file) => ({
            id: crypto.randomUUID(),
            file,
            name: file.name,
            status: "pending",
            progress: 0,
        }));

        setItems((current) => {
            const hasUploading = current.some((item) => item.status === "uploading");

            if (!startedAtRef.current) {
                startedAtRef.current = Date.now();
            }

            return [
                ...current,
                ...newItems.map((item, index) => ({
                    ...item,
                    status: !hasUploading && index === 0 ? "uploading" : "pending",
                })),
            ];
        });
    }, []);

    const isCompleted = items.length > 0 && items.every((item) => item.status === "completed");

    useEffect(() => {
        if (!isCompleted) {
            return undefined;
        }

        const timer = setTimeout(() => {
            setItems([]);
            setElapsed(0);
            setSpeed(0);
            startedAtRef.current = null;
            completedIdsRef.current.clear();
            previousProgressRef.current = {
                bytes: 0,
                time: null,
            };
        }, 1000);

        return () => {
            clearTimeout(timer);
        };
    }, [isCompleted]);

    useEffect(() => {
        if (!startedAtRef.current || items.length === 0) {
            return undefined;
        }

        const timer = setInterval(() => {
            const currentElapsed = Date.now() - startedAtRef.current;

            setElapsed(currentElapsed);
        }, 100);

        return () => {
            clearInterval(timer);
        };
    }, [items.length]);

    useEffect(() => {
        if (!uploadingId) {
            return undefined;
        }

        const timer = setInterval(() => {
            setItems((current) => {
                const uploadingItem = current.find((item) => item.id === uploadingId);

                if (!uploadingItem) {
                    return current;
                }

                const nextProgress = Math.min(uploadingItem.progress + 10, 100);

                if (nextProgress < 100) {
                    return current.map((item) =>
                        item.id === uploadingId
                            ? {
                                  ...item,
                                  progress: nextProgress,
                              }
                            : item,
                    );
                }

                let nextStarted = false;

                return current.map((item) => {
                    if (item.id === uploadingId) {
                        return {
                            ...item,
                            progress: 100,
                            status: "completed",
                        };
                    }

                    if (!nextStarted && item.status === "pending") {
                        nextStarted = true;

                        return {
                            ...item,
                            status: "uploading",
                        };
                    }

                    return item;
                });
            });
        }, 300);

        return () => {
            clearInterval(timer);
        };
    }, [uploadingId]);

    useEffect(() => {
        if (!onComplete) {
            return;
        }

        items.forEach((item) => {
            if (item.status === "completed" && !completedIdsRef.current.has(item.id)) {
                completedIdsRef.current.add(item.id);
                onComplete(item);
            }
        });
    }, [items, onComplete]);

    useEffect(() => {
        const now = Date.now();
        const previous = previousProgressRef.current;

        if (previous.time === null) {
            previousProgressRef.current = {
                bytes: uploadedBytes,
                time: now,
            };

            return;
        }

        const elapsedSeconds = (now - previous.time) / 1000;

        if (elapsedSeconds <= 0) {
            return;
        }

        const bytesUploaded = uploadedBytes - previous.bytes;
        const bytesPerSecond = bytesUploaded / elapsedSeconds;

        setSpeed(Math.max(0, bytesPerSecond));

        previousProgressRef.current = {
            bytes: uploadedBytes,
            time: now,
        };
    }, [uploadedBytes]);

    return {
        items,
        totalFiles,
        completedFiles,
        totalBytes,
        uploadedBytes,
        progress,
        speed,
        elapsed,
        isCompleted,
        addFiles,
    };
}

export default useUploadQueue;
