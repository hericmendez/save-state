import type { InputHTMLAttributes } from "react";

interface RpgInputProps extends InputHTMLAttributes<HTMLInputElement> {
  className?: string;
  density?: "default" | "compact";
}

export default function RPGUInput({
  className = "",
  density = "default",
  ...props
}: RpgInputProps) {
  return (
    <input
      {...props}
      className={`
        rpgui-container
        framed-grey
        rpgui-input
        w-full
        ${density === "compact" ? "ss-rpgui-control--compact" : ""}
        text-white!
        placeholder:text-gray-300!
        focus:outline-none
        ${className}
      `}
    />
  );
}
