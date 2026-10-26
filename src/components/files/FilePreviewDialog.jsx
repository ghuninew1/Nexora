import { useEffect, useState } from "react";
import { File, FileText, Image as ImageIcon } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import { cx } from "../../utils/cx";

function FilePreviewDialog({ file, open, onOpenChange }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (!open || !file?.sourceFile) { setUrl(null); return undefined; }
    const objectUrl = URL.createObjectURL(file.sourceFile);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [open, file]);

  const isImage = Boolean(file?.sourceFile?.type.startsWith("image/"));
  const isPdf = file?.sourceFile?.type === "application/pdf" || file?.extension === "pdf";
  const Icon = isImage ? ImageIcon : isPdf ? FileText : File;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cx("sm:max-w-3xl")}>
        <DialogHeader>
          <DialogTitle className={cx("truncate pr-8")}>{file?.name ?? "File preview"}</DialogTitle>
          <DialogDescription>{file?.size ?? "File"} · {file?.modified ?? ""}</DialogDescription>
        </DialogHeader>
        {file?.sourceFile && url ? (
          isImage ? <img src={url} alt={file.name} className={cx("max-h-[65dvh] w-full rounded-lg object-contain")} />
            : isPdf ? <iframe title={`Preview of ${file.name}`} src={url} className={cx("h-[65dvh] w-full rounded-lg border border-border")} />
              : <div className={cx("flex min-h-56 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/30 text-center")}><Icon className={cx("size-8 text-muted-foreground")} /><p className={cx("text-sm text-muted-foreground")}>Preview is not available for this file type.</p></div>
        ) : <div className={cx("flex min-h-56 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/30 px-6 text-center")}><Icon className={cx("size-8 text-muted-foreground")} /><p className={cx("max-w-md text-sm text-muted-foreground")}>This sample entry contains file details only. Preview becomes available for files uploaded in this browser session.</p></div>}
      </DialogContent>
    </Dialog>
  );
}

export default FilePreviewDialog;
