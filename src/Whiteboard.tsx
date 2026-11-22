import { useRef, useState } from 'react';
import type { PointerEvent } from 'react';

export type Point = { x: number; y: number };
export type Stroke = {
  id: string;
  color: string;
  width: number;
  points: Point[];
};

type Props = {
  strokes: Stroke[];
  tool: 'pen' | 'eraser' | 'select';
  color: string;
  onStroke: (stroke: Stroke) => void;
};

const width = 1000;
const height = 650;

export default function Whiteboard({ strokes, tool, color, onStroke }: Props) {
  const [draft, setDraft] = useState<Point[]>([]);
  const active = useRef(false);
  const draftRef = useRef<Point[]>([]);

  function pointFromEvent(event: PointerEvent<SVGSVGElement>): Point {
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(width, ((event.clientX - bounds.left) / bounds.width) * width)),
      y: Math.max(0, Math.min(height, ((event.clientY - bounds.top) / bounds.height) * height)),
    };
  }

  function startStroke(event: PointerEvent<SVGSVGElement>) {
    if (tool === 'select') return;
    event.currentTarget.setPointerCapture(event.pointerId);
    active.current = true;
    const point = pointFromEvent(event);
    draftRef.current = [point];
    setDraft(draftRef.current);
  }

  function continueStroke(event: PointerEvent<SVGSVGElement>) {
    if (!active.current) return;
    const point = pointFromEvent(event);
    const previous = draftRef.current[draftRef.current.length - 1];
    if (previous && Math.hypot(previous.x - point.x, previous.y - point.y) < 1.8) return;
    draftRef.current = [...draftRef.current, point];
    setDraft(draftRef.current);
  }

  function finishStroke() {
    if (!active.current) return;
    active.current = false;
    const points = draftRef.current;
    draftRef.current = [];
    setDraft([]);
    if (points.length) {
      onStroke({
        id: crypto.randomUUID(),
        color,
        width: color === '#ffffff' ? 22 : 3.2,
        points: points.length === 1 ? [points[0], { ...points[0], x: points[0].x + 0.1 }] : points,
      });
    }
  }

  function pointsToString(points: Point[]) {
    return points.map((point) => `${point.x},${point.y}`).join(' ');
  }

  return (
    <div className={`board-canvas-wrap ${tool === 'select' ? 'cursor-select' : tool === 'eraser' ? 'cursor-erase' : 'cursor-draw'}`}>
      <svg
        className="board-canvas"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        onPointerDown={startStroke}
        onPointerMove={continueStroke}
        onPointerUp={finishStroke}
        onPointerCancel={finishStroke}
        aria-label="Collaborative whiteboard"
      >
        <defs>
          <pattern id="board-grid" width="24" height="24" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill="#e7e9f0" />
          </pattern>
        </defs>
        <rect width={width} height={height} fill="#fcfcfe" />
        <rect width={width} height={height} fill="url(#board-grid)" />
        {strokes.map((stroke) => (
          <polyline
            key={stroke.id}
            points={pointsToString(stroke.points)}
            fill="none"
            stroke={stroke.color}
            strokeWidth={stroke.width}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {draft.length > 0 && (
          <polyline
            points={pointsToString(draft)}
            fill="none"
            stroke={color}
            strokeWidth={color === '#ffffff' ? 22 : 3.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      {strokes.length === 0 && draft.length === 0 && (
        <div className="board-empty-state">
          <span className="board-empty-icon"><PencilIcon /></span>
          <strong>A blank canvas, together.</strong>
          <span>Pick a color and sketch your next idea.</span>
        </div>
      )}
    </div>
  );
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m15.7 5.3 3 3M4 20l4.3-.9L19 8.4a2.1 2.1 0 0 0-3-3L5.3 16.1 4 20Z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
