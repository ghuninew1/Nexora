import {
  ChevronDown,
  Download,
  FolderPlus,
  Grid2X2,
  List,
  Pencil,
  Plus,
  Search,
  Share2,
  Trash2,
} from "lucide-react";

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Separator } from "../ui/separator";
import UploadButton from "./UploadButton";

function FileToolbar({ selectedCount, onNewFolder, onRename, onDelete, onFilesSelected }) {
  const hasSelection = selectedCount > 0;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        {hasSelection ? (
          <>
            <span className="mr-1 text-sm font-medium text-foreground">{selectedCount} selected</span>

            <Button variant="outline" size="sm">
              <Download />
              Download
            </Button>

            <Button variant="outline" size="sm">
              <Share2 />
              Share
            </Button>

            <Button variant="outline" size="sm" onClick={onDelete}>
              <Trash2 />
              Delete
            </Button>

            {selectedCount === 1 && (
              <Button variant="outline" size="sm" onClick={onRename}>
                <Pencil />
                Rename
              </Button>
            )}
          </>
        ) : (
          <>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button>
                    <Plus />
                    New
                    <ChevronDown />
                  </Button>
                }
              />

              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={onNewFolder}>
                  <FolderPlus />
                  Folder
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <UploadButton onFilesSelected={onFilesSelected} />
          </>
        )}
      </div>

      <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />

          <Input type="search" placeholder="Search files..." className="pl-9" />
        </div>

        <Separator orientation="vertical" className="hidden h-6 sm:block" />

        <Button variant="outline">
          Sort
          <ChevronDown />
        </Button>

        <div className="hidden items-center rounded-lg border border-border p-0.5 sm:flex">
          <Button variant="ghost" size="icon-sm" aria-label="List view">
            <List />
          </Button>

          <Button variant="ghost" size="icon-sm" aria-label="Grid view">
            <Grid2X2 />
          </Button>
        </div>
      </div>
    </div>
  );
}

export default FileToolbar;
