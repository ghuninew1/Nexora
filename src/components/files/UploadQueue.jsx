import { CheckCircle2, File, Loader2, XCircle } from "lucide-react";
import { cx } from "../../utils/cx";

const statusConfig = {
  pending: { label: "Waiting", icon: File },
  uploading: { label: "Preparing locally", icon: Loader2 },
  completed: { label: "Ready in this session", icon: CheckCircle2 },
  error: { label: "Failed", icon: XCircle },
};

function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / (1024 ** index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatElapsed(milliseconds) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  return `${String(Math.floor(totalSeconds / 60)).padStart(2, "0")}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

function UploadQueue({ items, totalFiles, completedFiles, totalBytes, uploadedBytes, progress, speed, elapsed, isCompleted }) {
  if (items.length === 0) return null;
  if (isCompleted) {
    return <div role="status" aria-live="polite" className={cx("rounded-xl border border-border bg-card")}>
      <div className={cx("flex items-center gap-3 px-4 py-4")}>
        <CheckCircle2 className={cx("size-5 text-primary")} aria-hidden="true" />
        <div><div className={cx("text-sm font-semibold text-foreground")}>Demo upload ready</div><div className={cx("text-xs text-muted-foreground")}>{completedFiles} / {totalFiles} files · available until refresh</div></div>
      </div>
    </div>;
  }
  return <section aria-label="Demo upload progress" className={cx("overflow-hidden rounded-xl border border-border bg-card")}>
    <div className={cx("border-b border-border px-4 py-3")}>
      <div className={cx("flex items-center justify-between gap-4")}><h2 className={cx("text-sm font-semibold text-foreground")}>Preparing demo files</h2><span className={cx("text-sm font-semibold text-foreground")}>{progress}%</span></div>
      <div role="progressbar" aria-label="Overall demo upload progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-valuetext={`${progress}% complete`} className={cx("mt-3 h-2 overflow-hidden rounded-full bg-muted")}>
        <div className={cx("h-full rounded-full bg-primary transition-[width] duration-200 motion-reduce:transition-none")} style={{ width: `${progress}%` }} />
      </div>
      <div className={cx("mt-3 grid grid-cols-2 gap-3 text-xs text-muted-foreground sm:grid-cols-4")}>
        <div><div className={cx("font-medium text-foreground")}>Files</div><div>{completedFiles} / {totalFiles}</div></div>
        <div><div className={cx("font-medium text-foreground")}>Size</div><div>{formatBytes(uploadedBytes)} / {formatBytes(totalBytes)}</div></div>
        <div><div className={cx("font-medium text-foreground")}>Speed</div><div>{formatBytes(speed)}/s</div></div>
        <div><div className={cx("font-medium text-foreground")}>Elapsed</div><div>{formatElapsed(elapsed)}</div></div>
      </div>
    </div>
    <div className={cx("divide-y divide-border")}>
      {items.map((item) => {
        const config = statusConfig[item.status] ?? statusConfig.pending;
        const Icon = config.icon;
        return <div key={item.id} role="group" aria-label={`${item.name}: ${config.label}`} className={cx("flex items-center gap-3 px-4 py-3")}>
          <Icon className={cx("size-5 shrink-0 text-muted-foreground", item.status === "uploading" && "motion-safe:animate-spin", item.status === "completed" && "text-primary", item.status === "error" && "text-destructive")} aria-hidden="true" />
          <div className={cx("min-w-0 flex-1")}>
            <div className={cx("flex items-center justify-between gap-3")}><span className={cx("truncate text-sm font-medium text-foreground")}>{item.name}</span><span className={cx("shrink-0 text-xs text-muted-foreground")}>{config.label}</span></div>
            <div role="progressbar" aria-label={`Progress for ${item.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={item.progress} aria-valuetext={`${item.progress}% complete`} className={cx("mt-2 h-1.5 overflow-hidden rounded-full bg-muted")}>
              <div className={cx("h-full rounded-full bg-primary transition-[width] duration-200 motion-reduce:transition-none")} style={{ width: `${item.progress}%` }} />
            </div>
            <div className={cx("mt-1 text-xs text-muted-foreground")}>{item.progress}%</div>
          </div>
        </div>;
      })}
    </div>
  </section>;
}

export default UploadQueue;
