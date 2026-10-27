import {
  ChevronDown, FolderPlus, Grid2X2, List, Plus, RefreshCw,
  Search, Trash2, ArrowUpDown,
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "../ui/dropdown-menu";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Separator } from "../ui/separator";
import { cx } from "../../utils/cx";
import UploadButton from "./UploadButton";

function FileToolbar({ selectedCount, onNewFolder, canCreateFolder, isCreatingFolder, canUpload, onUploadFiles, onRefresh, isRefreshing, query, onQueryChange, sortBy, onSortChange, sortDirection, onSortDirectionChange, view, onViewChange, onClearSelection }) {
  const hasSelection = selectedCount > 0;
  const isBusy = isRefreshing || isCreatingFolder;
  return (
    <div className={cx("flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between")}>
      <div className={cx("flex min-w-0 items-center gap-2 overflow-x-auto")}>
        {hasSelection ? <>
          <span className={cx("shrink-0 text-sm font-medium text-foreground")}>{selectedCount} selected</span>
          <span className={cx("shrink-0 text-xs text-muted-foreground")}>Use each item’s menu for file actions.</span>
          <Button variant="outline" size="sm" disabled title="Delete and Trash actions are not available yet"><Trash2 />Delete</Button>
          <Button variant="ghost" size="sm" onClick={onClearSelection}>Clear selection</Button>
        </> : <>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button disabled={isBusy}><Plus />New<ChevronDown /></Button>} />
            <DropdownMenuContent align="start">
              <DropdownMenuItem disabled={!canCreateFolder || isBusy} onClick={onNewFolder}><FolderPlus />Folder</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <UploadButton onFilesSelected={onUploadFiles} disabled={!canUpload || isBusy} />
        </>}
      </div>
      <div className={cx("flex min-w-0 items-center gap-2")}>
        <Button variant="outline" size="icon-sm" onClick={() => void onRefresh()} disabled={isBusy} aria-label="Refresh current folder" aria-busy={isRefreshing} title="Refresh current folder"><RefreshCw className={cx(isRefreshing && "motion-safe:animate-spin")} /></Button>
        <div className={cx("relative min-w-0 flex-1 sm:w-52 sm:flex-none")}>
          <Search className={cx("pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground")} aria-hidden="true" />
          <Input type="search" value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Search loaded items..." aria-label="Search loaded items" className={cx("pl-9")} />
        </div>
        <Separator orientation="vertical" className={cx("hidden h-6 sm:block")} />
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" size="icon-sm" aria-label={`Sort loaded items by ${sortBy}, ${sortDirection}ending`}><ArrowUpDown /></Button>} />
          <DropdownMenuContent align="end">
            <DropdownMenuRadioGroup value={sortBy} onValueChange={onSortChange}>
              {[{ key: "name", label: "Name" }, { key: "modified", label: "Last modified" }, { key: "size", label: "File size" }].map((item) => <DropdownMenuRadioItem key={item.key} value={item.key} closeOnClick>{item.label}</DropdownMenuRadioItem>)}
            </DropdownMenuRadioGroup>
            <Separator className={cx("my-1")} />
            <DropdownMenuItem onClick={onSortDirectionChange}>Order: {sortDirection === "asc" ? "Ascending" : "Descending"}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <div className={cx("flex items-center rounded-lg border border-border p-0.5")} role="group" aria-label="File view">
          <Button variant={view === "list" ? "secondary" : "ghost"} size="icon-sm" aria-label="List view" aria-pressed={view === "list"} onClick={() => onViewChange("list")}><List /></Button>
          <Button variant={view === "grid" ? "secondary" : "ghost"} size="icon-sm" aria-label="Grid view" aria-pressed={view === "grid"} onClick={() => onViewChange("grid")}><Grid2X2 /></Button>
        </div>
      </div>
    </div>
  );
}

export default FileToolbar;
