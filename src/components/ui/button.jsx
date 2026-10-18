import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cx } from "../../utils/cx";

import { buttonVariants } from "./button-variants";

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cx(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button };