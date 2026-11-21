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

/** Icon-only controls must always provide a non-visual accessible name. */
type RPGUIButtonSizeProps =
  | { size?: "default" | "compact" }
  | { size: "icon"; "aria-label": string };

/** Pure class computation — unit-tested without a DOM. */
export function rpguiButtonClasses({
  golden = false,
  framed,
  size = "default",
  className = "",
}: {
  golden?: boolean;
  framed?: "grey";
  size?: "default" | "compact" | "icon";
  className?: string;
}): string {
  const responsiveClasses =
    size === "default"
      ? ""
      : `ss-rpgui-button--${size}${size === "icon" ? " ss-rpgui-button--icon-only" : ""}`;
  if (framed === "grey") {
    return `rpgui-container framed-grey ${responsiveClasses} ${className}`;
  }
  return `rpgui-button
        ${golden ? "golden" : ""}
        ${responsiveClasses}

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
  | (BaseProps & RPGUIButtonSizeProps & {
      as?: "button";
    } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "title" | "size">)
  | (BaseProps & RPGUIButtonSizeProps & {
      as: "a";
    } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "title">)
  | (BaseProps & RPGUIButtonSizeProps & {
      as: "link";
    } & Omit<
      React.ComponentProps<typeof Link>,
      "children" | "className" | "title" | "size"
    >);

export default function RPGUIButton({
  title,
  golden = false,
  framed,
  size = "default",
  children,
  className = "",
  "aria-label": ariaLabel,
  ...props
}: RPGUIButtonProps) {
  const iconOnly = size === "icon";
  const buttonClassName = rpguiButtonClasses({
    golden,
    framed,
    size,
    className,
  });
  const accessibleName =
    ariaLabel ??
    (iconOnly && typeof title === "string" ? title : undefined);
  const content = framed === "grey" ? (
    <>
      {iconOnly ? (
        <span className="ss-rpgui-button__label">{title}</span>
      ) : (
        title
      )}
      {children}
    </>
  ) : (
    <>
      {iconOnly ? (
        <p className="ss-rpgui-button__label">{title}</p>
      ) : (
        <p>{title}</p>
      )}
      {children}
    </>
  );

  if (props.as === "a") {
    const { as: _as, ...anchorProps } = props;

    return (
      <a {...anchorProps} aria-label={accessibleName} className={buttonClassName}>
        {content}
      </a>
    );
  }

  if (props.as === "link") {
    const { as: _as, ...linkProps } = props;

    return (
      <Link {...linkProps} aria-label={accessibleName} className={buttonClassName}>
        {content}
      </Link>
    );
  }

  const { as: _as, ...buttonProps } = props;

  return (
    <button {...buttonProps} aria-label={accessibleName} className={buttonClassName}>
      {content}
    </button>
  );
}
