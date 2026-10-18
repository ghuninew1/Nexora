import { Upload } from "lucide-react";

function DragDropOverlay() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="flex w-full max-w-md flex-col items-center justify-center rounded-2xl border-2 border-dashed border-primary bg-card px-8 py-12 text-center shadow-lg">
        <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-primary/10">
          <Upload className="size-7 text-primary" />
        </div>

        <h2 className="text-lg font-semibold text-foreground">
          Drop files here
        </h2>

        <p className="mt-1 text-sm text-muted-foreground">
          Release to upload your files
        </p>
      </div>
    </div>
  );
}

export default DragDropOverlay;