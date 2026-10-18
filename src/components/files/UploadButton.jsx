import { useRef } from "react";
import { Upload } from "lucide-react";

import { Button } from "../ui/button";

function UploadButton({ onFilesSelected }) {
  const inputRef = useRef(null);

  function handleChange(event) {
    const files = Array.from(event.target.files ?? []);

    if (files.length === 0) {
      return;
    }

    onFilesSelected(files);
    event.target.value = "";
  }

  function handleClick() {
    inputRef.current?.click();
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={handleClick}
      >
        <Upload />
        Upload
      </Button>

      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleChange}
      />
    </>
  );
}

export default UploadButton;
