import {
  File,
  FileCode2,
  FileText,
  Folder,
} from "lucide-react";

import { cx } from "../../utils/cx";

const fileIcons = {
  md: FileCode2,
  pdf: FileText,
};

function FileListItem({
  file,
  selected,
  onSelect,
  onOpenFolder,
}) {
  const Icon = file.type === "folder"
    ? Folder
    : fileIcons[file.extension] ?? File;

  function handleContentClick() {
    if (file.type === "folder") {
      onOpenFolder(file.id);
      return;
    }

    onSelect(file.id);
  }

  function handleSelectClick(event) {
    event.stopPropagation();
    onSelect(file.id);
  }

  return (
    <div
      className={cx(
        "grid w-full items-center border-b border-border px-4 py-3 transition-colors last:border-b-0",
        "grid-cols-[minmax(0,1fr)] gap-1 sm:grid-cols-[minmax(0,1fr)_180px_120px] sm:gap-0",
        selected
          ? "bg-muted"
          : "hover:bg-muted/50",
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={handleSelectClick}
          aria-label={`Select ${file.name}`}
          aria-pressed={selected}
          className={cx(
            "flex size-4 shrink-0 items-center justify-center rounded border text-[10px] transition-colors",
            selected
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border hover:border-primary",
          )}
        >
          {selected && "✓"}
        </button>

        <button
          type="button"
          onClick={handleContentClick}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <Icon className="size-5 shrink-0 text-muted-foreground" />

          <div className="min-w-0">
            <span className="block truncate text-sm font-medium text-foreground">
              {file.name}
            </span>

            <span className="block truncate text-xs text-muted-foreground sm:hidden">
              {file.modified}
              {file.size && (
                <>
                  {" • "}
                  {file.size}
                </>
              )}
            </span>
          </div>
        </button>
      </div>

      <span className="hidden text-sm text-muted-foreground sm:block">
        {file.modified}
      </span>

      <span className="hidden text-right text-sm text-muted-foreground sm:block">
        {file.size ?? "—"}
      </span>
    </div>
  );
}

export default FileListItem;
