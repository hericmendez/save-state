import type { TextareaHTMLAttributes } from "react";

interface RpgTextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  className?: string;
}

export default function RPGUITextArea({ className = "", ...props }: RpgTextAreaProps) {
  return (
    <textarea
      {...props}
      className={`
        rpgui-container
        framed-grey
        w-full
        text-white!
        placeholder:text-gray-400
        focus:outline-none
        ${className}
      `}
    />
  );
}
