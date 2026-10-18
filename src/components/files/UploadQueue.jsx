import {
  CheckCircle2,
  File,
  Loader2,
  XCircle,
} from "lucide-react";

import { cx } from "../../utils/cx";

const statusConfig = {
  pending: {
    label: "Waiting",
    icon: File,
  },
  uploading: {
    label: "Uploading",
    icon: Loader2,
  },
  completed: {
    label: "Completed",
    icon: CheckCircle2,
  },
  error: {
    label: "Failed",
    icon: XCircle,
  },
};

function formatBytes(bytes) {
  if (bytes === 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );

  return `${(bytes / (1024 ** index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatSpeed(bytesPerSecond) {
  return `${formatBytes(bytesPerSecond)}/s`;
}

function formatElapsed(milliseconds) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function UploadQueue({
  items,
  totalFiles,
  completedFiles,
  totalBytes,
  uploadedBytes,
  progress,
  speed,
  elapsed,
  isCompleted,
}) {
  if (items.length === 0) {
    return null;
  }

  if (isCompleted) {
    return (
      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center gap-3 px-4 py-4">
          <CheckCircle2 className="size-5 text-primary" />

          <div>
            <div className="text-sm font-semibold text-foreground">
              Upload completed
            </div>

            <div className="text-xs text-muted-foreground">
              {completedFiles} / {totalFiles} files
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (



    <div className="rounded-xl border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-sm font-semibold text-foreground">
            Uploads
          </h2>

          <span className="text-sm font-semibold text-foreground">
            {progress}%
          </span>
        </div>

        <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-200"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-muted-foreground sm:grid-cols-4">
          <div>
            <div className="font-medium text-foreground">
              Files
            </div>
            <div>
              {completedFiles} / {totalFiles}
            </div>
          </div>

          <div>
            <div className="font-medium text-foreground">
              Size
            </div>
            <div>
              {formatBytes(uploadedBytes)} / {formatBytes(totalBytes)}
            </div>
          </div>

          <div>
            <div className="font-medium text-foreground">
              Speed
            </div>
            <div>
              {formatSpeed(speed)}
            </div>
          </div>

          <div>
            <div className="font-medium text-foreground">
              Elapsed
            </div>
            <div>
              {formatElapsed(elapsed)}
            </div>
          </div>
        </div>
      </div>

      <div className="divide-y divide-border">
        {items.map((item) => {
          const config = statusConfig[item.status];
          const Icon = config.icon;

          return (
            <div
              key={item.id}
              className="flex items-center gap-3 px-4 py-3"
            >
              <Icon
                className={cx(
                  "size-5 shrink-0 text-muted-foreground",
                  item.status === "uploading"
                  && "animate-spin",
                  item.status === "completed"
                  && "text-primary",
                  item.status === "error"
                  && "text-destructive",
                )}
              />

              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate text-sm font-medium text-foreground">
                    {item.name}
                  </span>

                  <span className="shrink-0 text-xs text-muted-foreground">
                    {config.label}
                  </span>
                </div>

                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-200"
                    style={{
                      width: `${item.progress}%`,
                    }}
                  />
                </div>

                <div className="mt-1 text-xs text-muted-foreground">
                  {item.progress}%
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default UploadQueue;