"use client";

export function Content({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`
        rpgui-container
        framed
        w-full
        layout-frame
   
        overflow-y-auto
        overflow-x-hidden
        content-scroll
        z-1
      `}
    >
      <div
        className={`
          mb-5
          pb-25
          pt-5
          !px-0
          layout-zoom
        `}
      >
        {children}
      </div>
    </div>
  );
}
