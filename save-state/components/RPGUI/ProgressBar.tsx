import { FC } from "react";

interface ProgressBarProps {
  label?: string;
  color?: "blue" | "red" | "green" |"purple";
  value: number; 
  max: number;
}

const RPGUIProgressBar: FC<ProgressBarProps> = ({ label, color, value, max }) => {
    const width = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    
    <div className="w-full flex flex-col justify-center whitespace-nowrap">
      <label>{label ? label : "Progress:"}(<span>{value.toLocaleString("pt-BR")}</span>)</label>
      <div className="rpgui-progress" data-rpguitype="progress">
        <div className=" rpgui-progress-track">
          <div
            className={`rpgui-progress-fill ${color ? color : ""}`}
            style={{ left: "0px", width: `${width}%` }}
          ></div>
        </div>
        <div className=" rpgui-progress-left-edge"></div>
        <div className=" rpgui-progress-right-edge"></div>
      </div>
    </div>
  );
};

export default RPGUIProgressBar;
