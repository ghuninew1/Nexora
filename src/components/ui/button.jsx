import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cx } from "../../utils/cx";
import { glassHover, updateGlassPointer } from "../../utils/glass";
import { buttonVariants } from "./button-variants";

function Button({ className, onPointerMove, variant = "default", size = "default", ...props }) {
  function handlePointerMove(event) {
    updateGlassPointer(event);
    onPointerMove?.(event);
  }

  function getClassName(state) {
    return cx(
      variant !== "link" && glassHover,
      buttonVariants({ variant, size }),
      typeof className === "function" ? className(state) : className,
    );
  }

  return (
    <ButtonPrimitive
      data-slot="button"
      data-variant={variant}
      className={getClassName}
      onPointerMove={handlePointerMove}
      {...props}
    />
  );
}

export { Button };
