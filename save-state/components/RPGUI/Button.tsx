"use client";

import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ReactNode,
} from "react";

type RPGUIFont = "default" | "mono";

type BaseProps = {
  title: ReactNode;
  golden?: boolean;
  children?: ReactNode;
  className?: string;
};

type RPGUIButtonProps =
  | (BaseProps & {
      as?: "button";
    } & ButtonHTMLAttributes<HTMLButtonElement>)
  | (BaseProps & {
      as: "a";
    } & AnchorHTMLAttributes<HTMLAnchorElement>);

export default function RPGUIButton({
  title,
  golden = false,
  children,
  className = "",
  ...props
}: RPGUIButtonProps) {
  const buttonClassName = `rpgui-button
        ${golden ? "golden" : ""}

        ${className}
          text-sm
          md:text-sm
          items-center
          justify-center
          text-center
          transition
          duration-300
          ease-in-out
  `;

  if (props.as === "a") {
    const { as: _as, ...anchorProps } = props;

    return (
      <a {...anchorProps} className={buttonClassName}>
        <p>{title}</p>
        {children}
      </a>
    );
  }

  const { as: _as, ...buttonProps } = props;

  return (
    <button {...buttonProps} className={buttonClassName}>
      <p>{title}</p>
      {children}
    </button>
  );
}
