import { useRef } from "react";
import { Upload } from "lucide-react";
import { cx } from "../../utils/cx";
import { Button } from "../ui/button";

function UploadButton({ onFilesSelected, disabled = false }) {
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
        disabled={disabled}
      >
        <Upload />
        Upload
      </Button>

      <input
        ref={inputRef}
        type="file"
        multiple
        className={cx("hidden")}
        disabled={disabled}
        onChange={handleChange}
      />
    </>
  );
}

export default UploadButton;
