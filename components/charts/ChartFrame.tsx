import type { ReactNode, Ref } from "react";

export interface Margin {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface ChartDims {
  width: number;
  height: number;
  margin: Margin;
  innerWidth: number;
  innerHeight: number;
}

interface ChartFrameProps {
  /** Logical coordinate space. The SVG scales to its container via viewBox. */
  width: number;
  height: number;
  margin?: Partial<Margin>;
  ariaLabel: string;
  className?: string;
  svgRef?: Ref<SVGSVGElement>;
  onPointerMove?: (e: React.PointerEvent<SVGSVGElement>) => void;
  onPointerLeave?: (e: React.PointerEvent<SVGSVGElement>) => void;
  onClick?: (e: React.MouseEvent<SVGSVGElement>) => void;
  /** Receives the plot-area dimensions (inside the margins). */
  children: (dims: ChartDims) => ReactNode;
}

const DEFAULT_MARGIN: Margin = { top: 8, right: 8, bottom: 8, left: 8 };

/**
 * Responsive SVG container. Establishes a fixed logical coordinate space that
 * scales to the parent, applies consistent margins, and hands the inner plot
 * dimensions to its children. Every chart in the app is built on this.
 */
export function ChartFrame({
  width,
  height,
  margin: marginProp,
  ariaLabel,
  className,
  svgRef,
  onPointerMove,
  onPointerLeave,
  onClick,
  children,
}: ChartFrameProps) {
  const margin: Margin = { ...DEFAULT_MARGIN, ...marginProp };
  const dims: ChartDims = {
    width,
    height,
    margin,
    innerWidth: width - margin.left - margin.right,
    innerHeight: height - margin.top - margin.bottom,
  };

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${width} ${height}`}
      className={["chart-svg", className].filter(Boolean).join(" ")}
      role="img"
      aria-label={ariaLabel}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      onClick={onClick}
    >
      <g transform={`translate(${margin.left},${margin.top})`}>{children(dims)}</g>
    </svg>
  );
}
