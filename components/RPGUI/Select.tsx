import type { SelectHTMLAttributes } from "react";

interface RpgSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  className?: string;
}

export default function RPGUISelect({
  className = "",
  children,
  ...props
}: RpgSelectProps) {
  return (
    <select
      {...props}
      className={`
        rpgui-container
        rpgui-dropdown  
        framed-grey
        cursor-pointer
        bg-[#1e2022]!
        text-white!
        p-2.5!
        rounded-[5px]!
        ${className}
      `}
    >
      {children}
    </select>
  );
}