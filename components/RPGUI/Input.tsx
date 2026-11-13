import type { InputHTMLAttributes } from "react";

interface RpgInputProps extends InputHTMLAttributes<HTMLInputElement> {
  className?: string;
}

export default function RPGUInput({
  className = "",
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
        text-white!
        placeholder:text-gray-300!
        focus:outline-none
        ${className}
      `}
    />
  );
}