import type { SelectHTMLAttributes } from "react";

interface RpgSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  className?: string;
  density?: "default" | "compact";
}

export default function RPGUISelect({
  className = "",
  density = "default",
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
        ${density === "compact" ? "ss-rpgui-control--compact" : ""}
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
