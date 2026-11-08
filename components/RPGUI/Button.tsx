"use client";

import Link from "next/link";
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ReactNode,
} from "react";

type RPGUIFont = "default" | "mono";

type BaseProps = {
  title: ReactNode;
  golden?: boolean;
  /**
   * Visual frame variant. Omitted (default) keeps the exact legacy
   * `rpgui-button` rendering. `"grey"` renders the `rpgui-container
   * framed-grey` look (e.g. submenu buttons) with the title rendered
   * verbatim — framed containers carry their own typography through the
   * caller's classes, so no `<p>` wrapper is added in framed mode.
   */
  framed?: "grey";
  children?: ReactNode;
  className?: string;
};

/** Pure class computation — unit-tested without a DOM. */
export function rpguiButtonClasses({
  golden = false,
  framed,
  className = "",
}: {
  golden?: boolean;
  framed?: "grey";
  className?: string;
}): string {
  if (framed === "grey") {
    return `rpgui-container framed-grey ${className}`;
  }
  return `rpgui-button
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
}

type RPGUIButtonProps =
  | (BaseProps & {
      as?: "button";
    } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "title">)
  | (BaseProps & {
      as: "a";
    } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "title">)
  | (BaseProps & {
      as: "link";
    } & Omit<
      React.ComponentProps<typeof Link>,
      "children" | "className" | "title"
    >);

export default function RPGUIButton({
  title,
  golden = false,
  framed,
  children,
  className = "",
  ...props
}: RPGUIButtonProps) {
  const buttonClassName = rpguiButtonClasses({ golden, framed, className });
  const content = framed === "grey" ? (
    <>
      {title}
      {children}
    </>
  ) : (
    <>
      <p>{title}</p>
      {children}
    </>
  );

  if (props.as === "a") {
    const { as: _as, ...anchorProps } = props;

    return (
      <a {...anchorProps} className={buttonClassName}>
        {content}
      </a>
    );
  }

  if (props.as === "link") {
    const { as: _as, ...linkProps } = props;

    return (
      <Link {...linkProps} className={buttonClassName}>
        {content}
      </Link>
    );
  }

  const { as: _as, ...buttonProps } = props;

  return (
    <button {...buttonProps} className={buttonClassName}>
      {content}
    </button>
  );
}
