import type { FC } from "react";

interface ProgressBarProps {
  label?: string;
  color?: "blue" | "red" | "green" | "purple";
  value: number;
  max: number;
  /**
   * Marks the bar as indeterminate (simulated/unknown progress).
   * Visual fill still follows `value`; only the ARIA semantics change:
   * `aria-valuenow` is omitted so assistive tech does not announce a
   * fake percentage. Defaults to false (determinate).
   */
  indeterminate?: boolean;
}

const RPGUIProgressBar: FC<ProgressBarProps> = ({
  label,
  color = "green",
  value,
  max,
  indeterminate = false,
}) => {
  const percentage =
    max > 0
      ? Math.min(100, Math.max(0, (value / max) * 100))
      : 0;

  return (
    <div className="flex w-full flex-col gap-2">
      {label && <span>{label}</span>}

      <div
        className="rpgui-progress"
        data-rpguitype="progress"
        role="progressbar"
        aria-label={label ?? "Loading progress"}
        aria-valuemin={0}
        aria-valuemax={max}
        {...(indeterminate ? {} : { "aria-valuenow": Math.min(max, Math.max(0, value)) })}
      >
        <div className="rpgui-progress-track">
          <div
            className={`rpgui-progress-fill ${color}`}
            style={{
              left: "0px",
              width: `${percentage}%`,
              transition: "width 200ms ease-out",
            }}
          />
        </div>
        <div className="rpgui-progress-left-edge" />
        <div className="rpgui-progress-right-edge" />
      </div>
    </div>
  );
};

export default RPGUIProgressBar;
