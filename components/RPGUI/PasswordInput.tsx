"use client";

import { useState } from "react";
import type { InputHTMLAttributes } from "react";
import { FaEye, FaEyeSlash } from "react-icons/fa6";
import RPGUInput from "@/components/RPGUI/Input";

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

/**
 * Password field with an independent show/hide control.
 *
 * Wraps the shared RPGUInput so every auth form keeps the same RPGUI surface.
 * The toggle only changes the input `type`; it never touches the value, the
 * form validation, or the autocomplete hints supplied by the caller.
 */
export default function PasswordInput({
  className = "",
  ...props
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <span className="relative block">
      <RPGUInput
        {...props}
        type={visible ? "text" : "password"}
        className={`pr-11 ${className}`}
      />
      <button
        type="button"
        aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
        onClick={() => setVisible((current) => !current)}
        className="absolute inset-y-0 right-0 flex w-10 cursor-pointer items-center justify-center text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white"
      >
        {visible ? (
          <FaEyeSlash aria-hidden="true" />
        ) : (
          <FaEye aria-hidden="true" />
        )}
      </button>
    </span>
  );
}
