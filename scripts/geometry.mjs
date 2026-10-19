/**
 * Pure geometry helpers for Corner Vision. No Foundry globals besides ClipperLib, so these can be tested outside
 * the client.
 */

const SCALE = 100;

/**
 * Union several polygons into a single polygon. Any holes in the union are stitched into the outer boundary with
 * zero-width bridges ("keyholes"), because Foundry's vision pipeline only handles simple point arrays.
 * @param {number[][]} polygons     Flat [x0, y0, x1, y1, ...] point arrays
 * @param {{x: number, y: number}} anchor   A point that must be inside the result (the token center)
 * @returns {number[]|null}         The flat point array of the union, or null if it could not be computed
 */
export function unionWithKeyholes(polygons, anchor) {
  const paths = [];
  for ( const pts of polygons ) {
    if ( pts.length < 6 ) continue;
    const path = toClipper(pts);
    if ( !ClipperLib.Clipper.Orientation(path) ) path.reverse();
    paths.push(path);
  }
  if ( !paths.length ) return null;

  const clipper = new ClipperLib.Clipper();
  clipper.AddPaths(paths, ClipperLib.PolyType.ptSubject, true);
  const tree = new ClipperLib.PolyTree();
  const fill = ClipperLib.PolyFillType.pftNonZero;
  if ( !clipper.Execute(ClipperLib.ClipType.ctUnion, tree, fill, fill) ) return null;

  // Every input polygon contains the anchor, so the union is one region; pick the outer ring around the anchor
  const a = {X: Math.round(anchor.x * SCALE), Y: Math.round(anchor.y * SCALE)};
  const outers = tree.Childs().filter(n => !n.IsHole());
  if ( !outers.length ) return null;
  const node = outers.find(n => ClipperLib.Clipper.PointInPolygon(a, n.Contour()) !== 0)
    ?? outers.reduce((best, n) => Math.abs(ClipperLib.Clipper.Area(n.Contour()))
      > Math.abs(ClipperLib.Clipper.Area(best.Contour())) ? n : best);

  const outer = node.Contour().map(p => ({X: p.X, Y: p.Y}));
  const holes = node.Childs().filter(n => n.IsHole()).map(n => n.Contour().map(p => ({X: p.X, Y: p.Y})));
  const merged = bridgeHoles(outer, holes);
  return fromClipper(merged);
}

/* -------------------------------------------- */

/**
 * Stitch each hole into the outer ring through a bridge that crosses no other edge.
 * A hole that cannot be bridged is dropped, which fills it in (a slight over-reveal rather than a broken polygon).
 * @param {ClipperPoint[]} outer    The outer ring
 * @param {ClipperPoint[][]} holes  Hole rings, oriented opposite to the outer ring
 * @returns {ClipperPoint[]}
 */
export function bridgeHoles(outer, holes) {
  // Rightmost holes first, as earcut does, so later bridges see the earlier ones as ordinary edges
  const pending = holes.filter(h => h.length >= 3)
    .sort((h1, h2) => maxX(h2) - maxX(h1));
  let ring = outer;
  while ( pending.length ) {
    const hole = pending.shift();
    const bridge = findBridge(ring, hole, pending);
    if ( !bridge ) {
      console.debug("Corner Vision | Could not bridge a vision hole; filling it.");
      continue;
    }
    const {oi, hi} = bridge;
    ring = [
      ...ring.slice(0, oi + 1),
      ...hole.slice(hi),
      ...hole.slice(0, hi + 1),
      ...ring.slice(oi)
    ];
  }
  return ring;
}

/* -------------------------------------------- */

const MAX_HOLE_VERTICES_TRIED = 12;

function findBridge(ring, hole, otherHoles) {
  const rings = [ring, hole, ...otherHoles];

  // Try the hole's vertices from the rightmost inward
  const order = hole.map((p, i) => i).sort((i, j) => hole[j].X - hole[i].X)
    .slice(0, MAX_HOLE_VERTICES_TRIED);
  for ( const hi of order ) {
    const h = hole[hi];
    const candidates = ring.map((p, i) => i)
      .sort((i, j) => dist2(ring[i], h) - dist2(ring[j], h));
    for ( const oi of candidates ) {
      const o = ring[oi];
      if ( (o.X === h.X) && (o.Y === h.Y) ) continue;
      if ( !segmentIsClear(h, o, rings) ) continue;
      const mid = {X: Math.round((h.X + o.X) / 2), Y: Math.round((h.Y + o.Y) / 2)};
      if ( ClipperLib.Clipper.PointInPolygon(mid, ring) !== 1 ) continue;
      if ( rings.slice(1).some(r => ClipperLib.Clipper.PointInPolygon(mid, r) !== 0) ) continue;
      return {oi, hi};
    }
  }
  return null;
}

/* -------------------------------------------- */

function segmentIsClear(p, q, rings) {
  for ( const r of rings ) {
    const n = r.length;
    for ( let i = 0; i < n; i++ ) {
      const a = r[i];
      const b = r[(i + 1) % n];
      if ( samePoint(a, p) || samePoint(a, q) || samePoint(b, p) || samePoint(b, q) ) continue;
      if ( segmentsTouch(p, q, a, b) ) return false;
    }
  }
  return true;
}

function segmentsTouch(p, q, a, b) {
  const d1 = orient(a, b, p);
  const d2 = orient(a, b, q);
  const d3 = orient(p, q, a);
  const d4 = orient(p, q, b);
  if ( (((d1 > 0) && (d2 < 0)) || ((d1 < 0) && (d2 > 0)))
    && (((d3 > 0) && (d4 < 0)) || ((d3 < 0) && (d4 > 0))) ) return true;
  if ( (d3 === 0) && onSegment(p, q, a) ) return true;
  if ( (d4 === 0) && onSegment(p, q, b) ) return true;
  if ( (d1 === 0) && onSegment(a, b, p) ) return true;
  if ( (d2 === 0) && onSegment(a, b, q) ) return true;
  return false;
}

function orient(a, b, c) {
  const v = ((b.X - a.X) * (c.Y - a.Y)) - ((b.Y - a.Y) * (c.X - a.X));
  return v > 0 ? 1 : (v < 0 ? -1 : 0);
}

function onSegment(a, b, c) {
  return (Math.min(a.X, b.X) <= c.X) && (c.X <= Math.max(a.X, b.X))
    && (Math.min(a.Y, b.Y) <= c.Y) && (c.Y <= Math.max(a.Y, b.Y));
}

function samePoint(a, b) {
  return (a.X === b.X) && (a.Y === b.Y);
}

function dist2(a, b) {
  return ((a.X - b.X) ** 2) + ((a.Y - b.Y) ** 2);
}

function maxX(ring) {
  return ring.reduce((m, p) => Math.max(m, p.X), -Infinity);
}

/* -------------------------------------------- */

function toClipper(pts) {
  const path = [];
  for ( let i = 0; i < pts.length; i += 2 ) {
    path.push({X: Math.round(pts[i] * SCALE), Y: Math.round(pts[i + 1] * SCALE)});
  }
  return path;
}

function fromClipper(path) {
  const pts = new Array(path.length * 2);
  for ( let i = 0; i < path.length; i++ ) {
    pts[2 * i] = path[i].X / SCALE;
    pts[(2 * i) + 1] = path[i].Y / SCALE;
  }
  return pts;
}
