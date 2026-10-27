import { Download, FileText, LoaderCircle } from "lucide-react";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { cx } from "../../utils/cx";

function PreviewBody({ preview, maxTextPreviewBytes }) {
  if (!preview) return null;
  if (preview.status === "loading") return <div className={cx("flex min-h-48 items-center justify-center gap-3 text-sm text-muted-foreground")} role="status" aria-live="polite"><LoaderCircle className={cx("size-5 animate-spin motion-reduce:animate-none")} aria-hidden="true" />Loading preview…</div>;
  if (preview.status === "ready" && preview.kind === "image") return <div className={cx("flex min-h-48 items-center justify-center overflow-auto rounded-lg bg-muted/40 p-2")}><img src={preview.objectUrl} alt={preview.file.name} className={cx("max-h-[65dvh] max-w-full object-contain")} /></div>;
  if (preview.status === "ready" && preview.kind === "pdf") return <iframe title={`Preview of ${preview.file.name}`} src={preview.objectUrl} sandbox="" className={cx("h-[65dvh] min-h-64 w-full rounded-lg border border-border bg-background")} />;
  if (preview.status === "ready" && preview.kind === "text") return <div className={cx("max-h-[65dvh] min-h-48 overflow-auto rounded-lg border border-border bg-muted/30 p-4")}><pre className={cx("whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-foreground")}>{preview.text}</pre></div>;
  const message = preview.message || (preview.status === "too-large"
    ? preview.kind === "text" ? `Text previews are limited to ${Math.floor(maxTextPreviewBytes / 1024)} KiB.` : "This file exceeds the preview size limit."
    : "Preview is not available for this file.");
  return <div className={cx("flex min-h-48 flex-col items-center justify-center gap-3 rounded-lg border border-border bg-muted/30 p-6 text-center")} role={preview.status === "error" ? "alert" : "status"} aria-live="polite"><FileText className={cx("size-8 text-muted-foreground")} aria-hidden="true" /><p className={cx("text-sm text-muted-foreground")}>{message}</p></div>;
}

export default function StorageFilePreviewDialog({ preview, onOpenChange, onDownload, maxTextPreviewBytes }) {
  const file = preview?.file;
  return (
    <Dialog open={Boolean(preview)} onOpenChange={onOpenChange}>
      {file && <DialogContent className={cx("h-[calc(100dvh-1rem)] max-h-[calc(100dvh-1rem)] w-[calc(100%-1rem)] max-w-none grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden p-4 sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:max-w-4xl sm:p-6")} aria-busy={preview.status === "loading"}>
        <DialogHeader className={cx("min-w-0 pr-8")}>
          <DialogTitle className={cx("truncate")}><span className={cx("sr-only")}>Preview: </span>{file.name}</DialogTitle>
          <DialogDescription>{preview.status === "ready" ? `${preview.mimeType} · ${file.size || "Size unavailable"}` : "On-demand preview from connected storage"}</DialogDescription>
        </DialogHeader>
        <div className={cx("min-h-0 overflow-auto")}><PreviewBody preview={preview} maxTextPreviewBytes={maxTextPreviewBytes} /></div>
        <DialogFooter className={cx("-mx-4 -mb-4 sm:-mx-6 sm:-mb-6")}>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button type="button" onClick={() => onDownload(file)} disabled={preview.status === "loading"}><Download aria-hidden="true" />Download</Button>
        </DialogFooter>
      </DialogContent>}
    </Dialog>
  );
}
