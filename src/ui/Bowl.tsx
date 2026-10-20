import { useId } from 'preact/hooks';
import { BOX, bowlShapes, COLOUR, GHOST, type Op, type Shape } from './bowlArt.ts';

const transformOf = (ops: Op[]): string =>
  ops
    .map((op) =>
      op[0] === 'move'
        ? `translate(${String(op[1])} ${String(op[2])})`
        : op[0] === 'turn'
          ? `rotate(${String(op[1])})`
          : `scale(${String(op[1])})`,
    )
    .join(' ');

/** One shape as SVG; a fry's shading is the gradient `fry`, defined once per bowl and palette. */
function Drawn({ shape, fry }: { shape: Shape; fry: string }) {
  if (shape.kind === 'group')
    return (
      <g transform={transformOf(shape.ops)}>
        {shape.shapes.map((inner, i) => (
          <Drawn key={i} shape={inner} fry={fry} />
        ))}
      </g>
    );
  const stroke = { stroke: shape.stroke, 'stroke-width': shape.line };
  switch (shape.kind) {
    case 'rect':
      return (
        <rect
          x={shape.x}
          y={shape.y}
          width={shape.w}
          height={shape.h}
          rx={shape.r}
          fill={typeof shape.fill === 'string' ? shape.fill : `url(#${fry})`}
          {...stroke}
        />
      );
    case 'ellipse':
      return (
        <ellipse
          cx={shape.x}
          cy={shape.y}
          rx={shape.rx}
          ry={shape.ry}
          fill={shape.fill}
          {...stroke}
        />
      );
    case 'line':
      return <line x1={shape.x1} y1={shape.y1} x2={shape.x2} y2={shape.y2} {...stroke} />;
    case 'path':
      return <path d={shape.d} fill={shape.fill ?? 'none'} {...stroke} />;
  }
}

/** The nth poutine bowl (1 to 5), filled to `fill` (0, ½ or 1) from the left; grey where not given. */
export function Bowl({ nth, fill }: { nth: number; fill: number }) {
  const id = useId();
  const layer = (palette: typeof COLOUR, fry: string) => (
    <>
      <defs>
        <linearGradient id={fry} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stop-color={palette.fry.top} />
          <stop offset="0.55" stop-color={palette.fry.middle} />
          <stop offset="1" stop-color={palette.fry.bottom} />
        </linearGradient>
      </defs>
      {bowlShapes(nth, palette).map((shape, i) => (
        <Drawn key={i} shape={shape} fry={fry} />
      ))}
    </>
  );
  return (
    <svg
      viewBox={`${String(BOX.x)} ${String(BOX.y)} ${String(BOX.width)} ${String(BOX.height)}`}
      width="100%"
      height="100%"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      {fill < 1 && layer(GHOST, `${id}-g`)}
      {fill > 0 && (
        <>
          <defs>
            <clipPath id={`${id}-clip`}>
              <rect x={BOX.x} y={BOX.y} width={BOX.width * fill} height={BOX.height} />
            </clipPath>
          </defs>
          <g clip-path={`url(#${id}-clip)`}>{layer(COLOUR, `${id}-c`)}</g>
        </>
      )}
    </svg>
  );
}
