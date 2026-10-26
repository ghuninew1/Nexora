import { Upload } from "lucide-react";
import { cx } from "../../utils/cx";

function DragDropOverlay() {
  return (
    <div role="status" aria-live="polite" className={cx("fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm")}>
      <div className={cx("flex w-full max-w-md flex-col items-center justify-center rounded-2xl border-2 border-dashed border-primary bg-card px-6 py-10 text-center shadow-lg sm:px-8 sm:py-12")}>
        <div className={cx("mb-4 flex size-14 items-center justify-center rounded-full bg-primary/10")}>
          <Upload className={cx("size-7 text-primary")} aria-hidden="true" />
        </div>

        <h2 className={cx("text-lg font-semibold text-foreground")}>
          Drop files here
        </h2>

        <p className={cx("mt-1 text-sm text-muted-foreground")}>
          Release to upload your files
        </p>
      </div>
    </div>
  );
}

export default DragDropOverlay;
