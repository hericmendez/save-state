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
        w-full
        text-white!
        placeholder:text-gray-500
        focus:outline-none
        ${className}
      `}
    />
  );
}