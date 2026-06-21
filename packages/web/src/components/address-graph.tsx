import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { AddressGraph, AddressGraphLink, AddressGraphNode } from '@polyrader/core';
import { useI18n } from '../hooks/use-i18n';

interface SimNode extends AddressGraphNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  role: 'buyer' | 'seller' | 'mixed';
  fx: boolean;
}

interface SimState {
  nodes: SimNode[];
  nodeMap: Map<string, SimNode>;
  alpha: number;
}

interface AddressGraphProps {
  graph: AddressGraph;
}

const NODE_MIN_R = 6;
const NODE_MAX_R = 22;
const EDGE_MIN_W = 1;
const EDGE_MAX_W = 4;
const SIM_HEIGHT = 460;
const EDGE_COLOR = 'rgba(148, 163, 184, 0.35)';
const NODE_STROKE = 'rgba(15, 23, 42, 0.55)';

function colorFor(role: SimNode['role']): string {
  switch (role) {
    case 'buyer':
      return '#22c55e';
    case 'seller':
      return '#ef4444';
    default:
      return '#f59e0b';
  }
}

function initSim(graph: AddressGraph, width: number, height: number): SimState {
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) * 0.35;

  const buyerCount = new Map<string, number>();
  const sellerCount = new Map<string, number>();
  for (const l of graph.links) {
    buyerCount.set(l.source, (buyerCount.get(l.source) ?? 0) + 1);
    sellerCount.set(l.target, (sellerCount.get(l.target) ?? 0) + 1);
  }

  const vols = graph.nodes.map((n) => n.volume);
  const maxVol = Math.max(...vols, 1);
  const minVol = Math.min(...vols, 0);

  const nodes: SimNode[] = graph.nodes.map((n, i) => {
    const angle = (i / Math.max(1, graph.nodes.length)) * Math.PI * 2;
    const bc = buyerCount.get(n.id) ?? 0;
    const sc = sellerCount.get(n.id) ?? 0;
    const role: SimNode['role'] = bc > sc ? 'buyer' : sc > bc ? 'seller' : 'mixed';
    const t = maxVol === minVol ? 0.5 : (n.volume - minVol) / (maxVol - minVol);
    return {
      ...n,
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
      vx: 0,
      vy: 0,
      r: NODE_MIN_R + t * (NODE_MAX_R - NODE_MIN_R),
      role,
      fx: false,
    };
  });

  return { nodes, nodeMap: new Map(nodes.map((n) => [n.id, n])), alpha: 0.3 };
}

function stepSimulation(
  nodes: SimNode[],
  nodeMap: Map<string, SimNode>,
  links: AddressGraphLink[],
  alpha: number,
  width: number,
  height: number,
  computeRepulsion: boolean,
): void {
  const cx = width / 2;
  const cy = height / 2;
  const kRepel = 1400;
  const kLink = 0.05;
  const linkDist = Math.min(width, height) * 0.16;
  const kCenter = 0.02;
  const damping = 0.6;

  // Repulsion between every pair of nodes (skipped on alternate frames for large graphs)
  if (computeRepulsion) {
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 0.01) {
          dx = (Math.random() - 0.5) * 2;
          dy = (Math.random() - 0.5) * 2;
          d2 = 0.01;
        }
        const d = Math.sqrt(d2);
        const f = (kRepel / d2) * alpha;
        const fx = (dx / d) * f;
        const fy = (dy / d) * f;
        a.vx += fx;
        a.vy += fy;
        b.vx -= fx;
        b.vy -= fy;
      }
    }
  }

  // Spring attraction along links
  for (const l of links) {
    const s = nodeMap.get(l.source);
    const t = nodeMap.get(l.target);
    if (!s || !t) continue;
    const dx = t.x - s.x;
    const dy = t.y - s.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
    const diff = d - linkDist;
    const f = kLink * diff * alpha;
    const fx = (dx / d) * f;
    const fy = (dy / d) * f;
    s.vx += fx;
    s.vy += fy;
    t.vx -= fx;
    t.vy -= fy;
  }

  // Centering force + velocity integration
  for (const n of nodes) {
    if (n.fx) continue;
    n.vx += (cx - n.x) * kCenter * alpha;
    n.vy += (cy - n.y) * kCenter * alpha;
    n.vx *= damping;
    n.vy *= damping;
    n.x += n.vx;
    n.y += n.vy;
    n.x = Math.max(n.r, Math.min(width - n.r, n.x));
    n.y = Math.max(n.r, Math.min(height - n.r, n.y));
  }
}

export function AddressGraph({ graph }: AddressGraphProps) {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(800);
  const [, setTick] = useState(0);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const simRef = useRef<SimState>({ nodes: [], nodeMap: new Map(), alpha: 0 });
  const rafRef = useRef<number>(0);
  const dragRef = useRef<{ id: string } | null>(null);
  const reheatRef = useRef<() => void>(() => {});

  const render = useCallback(() => setTick((x) => x + 1), []);

  const maxVal = useMemo(() => Math.max(...graph.links.map((l) => l.value), 1), [graph]);

  // Responsive container width
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setWidth(w);
    });
    ro.observe(el);
    setWidth(el.clientWidth || 800);
    return () => ro.disconnect();
  }, []);

  // Initialize layout + run force simulation
  useEffect(() => {
    simRef.current = initSim(graph, width, SIM_HEIGHT);
    render();

    const FRAME_INTERVAL = 1000 / 30; // 30fps frame rate limit
    const REPULSION_SKIP_THRESHOLD = 30; // skip repulsion on alternate frames above this node count
    let lastFrameTime = 0;
    let frameCount = 0;

    const tick = (now: number) => {
      // Frame rate limiting: throttle to 30fps
      if (now - lastFrameTime < FRAME_INTERVAL) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      lastFrameTime = now;

      const sim = simRef.current;
      sim.alpha *= 0.95; // 5% decay per frame — faster convergence
      if (sim.alpha < 0.01) {
        rafRef.current = 0;
        render();
        return;
      }

      // When the graph is large, compute repulsion every other frame to reduce O(n²) cost
      const computeRepulsion = sim.nodes.length <= REPULSION_SKIP_THRESHOLD || frameCount % 2 === 0;
      frameCount++;

      stepSimulation(sim.nodes, sim.nodeMap, graph.links, sim.alpha, width, SIM_HEIGHT, computeRepulsion);
      render();
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    reheatRef.current = () => {
      const sim = simRef.current;
      sim.alpha = Math.max(sim.alpha, 0.3);
      if (rafRef.current === 0) {
        lastFrameTime = 0; // reset so the first reheated frame is processed immediately
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      reheatRef.current = () => {};
    };
  }, [graph, width, render]);

  const toSvgCoords = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } => {
      const svg = svgRef.current;
      if (!svg) return { x: 0, y: 0 };
      const rect = svg.getBoundingClientRect();
      const x = (clientX - rect.left) * (width / (rect.width || 1));
      const y = (clientY - rect.top) * (SIM_HEIGHT / (rect.height || 1));
      return { x, y };
    },
    [width],
  );

  const handleNodePointerDown = (e: ReactPointerEvent<SVGCircleElement>, node: SimNode) => {
    e.preventDefault();
    const svg = svgRef.current;
    if (svg) {
      try {
        svg.setPointerCapture(e.pointerId);
      } catch {
        // pointer capture may fail on some browsers — non-fatal
      }
    }
    dragRef.current = { id: node.id };
    node.fx = true;
    reheatRef.current();
  };

  const handlePointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const { x, y } = toSvgCoords(e.clientX, e.clientY);
    const node = simRef.current.nodeMap.get(drag.id);
    if (node) {
      node.x = x;
      node.y = y;
      node.vx = 0;
      node.vy = 0;
      render();
    }
  };

  const handlePointerUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const node = simRef.current.nodeMap.get(drag.id);
    if (node) node.fx = false;
    dragRef.current = null;
    const svg = svgRef.current;
    if (svg) {
      try {
        svg.releasePointerCapture(e.pointerId);
      } catch {
        // release may fail if capture was never set — non-fatal
      }
    }
  };

  const sim = simRef.current;
  const nodeMap = sim.nodeMap;
  const hoveredNode = hoveredId ? nodeMap.get(hoveredId) ?? null : null;

  if (sim.nodes.length === 0) {
    return (
      <div ref={containerRef} className="flex items-center justify-center w-full text-sm text-muted-foreground" style={{ height: SIM_HEIGHT }}>
        {t('addressGraph.empty')}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative w-full" style={{ height: SIM_HEIGHT }}>
      <svg
        ref={svgRef}
        width="100%"
        height={SIM_HEIGHT}
        viewBox={`0 0 ${width} ${SIM_HEIGHT}`}
        className="touch-none select-none"
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        <g>
          {graph.links.map((l, i) => {
            const s = nodeMap.get(l.source);
            const tg = nodeMap.get(l.target);
            if (!s || !tg) return null;
            const w = EDGE_MIN_W + (l.value / maxVal) * (EDGE_MAX_W - EDGE_MIN_W);
            return (
              <line
                key={`link-${i}`}
                x1={s.x}
                y1={s.y}
                x2={tg.x}
                y2={tg.y}
                stroke={EDGE_COLOR}
                strokeWidth={w}
              />
            );
          })}
        </g>
        <g>
          {sim.nodes.map((n) => (
            <circle
              key={n.id}
              cx={n.x}
              cy={n.y}
              r={n.r}
              fill={colorFor(n.role)}
              stroke={NODE_STROKE}
              strokeWidth={2}
              className="cursor-grab active:cursor-grabbing"
              onPointerDown={(e) => handleNodePointerDown(e, n)}
              onPointerEnter={() => setHoveredId(n.id)}
              onPointerLeave={() => setHoveredId(null)}
            />
          ))}
        </g>
      </svg>

      {hoveredNode && (
        <div
          className="absolute pointer-events-none z-10 rounded-md border bg-popover px-3 py-2 text-xs shadow-md"
          style={{
            left: `${(hoveredNode.x / width) * 100}%`,
            top: hoveredNode.y - hoveredNode.r - 10,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <div className="font-mono font-medium">{hoveredNode.label}</div>
          <div className="mt-1 text-muted-foreground">
            {t('addressGraph.volume')}: <span className="tabular-nums text-foreground">${(hoveredNode.volume / 1000).toFixed(1)}K</span>
          </div>
          <div className="text-muted-foreground">
            {t('addressGraph.tradeCount')}: <span className="tabular-nums text-foreground">{hoveredNode.tradeCount}</span>
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute bottom-2 right-3 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: '#22c55e' }} />
          {t('addressGraph.legend.buyer')}
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: '#ef4444' }} />
          {t('addressGraph.legend.seller')}
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: '#f59e0b' }} />
          {t('addressGraph.legend.mixed')}
        </span>
      </div>
    </div>
  );
}
