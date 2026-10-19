import {unionWithKeyholes} from "./geometry.mjs";

const MODULE_ID = "breweries-corner-vision";

/* -------------------------------------------- */
/*  Settings                                    */
/* -------------------------------------------- */

function registerSettings() {
  const refresh = () => canvas.ready && canvas.perception.update({initializeVision: true});
  game.settings.register(MODULE_ID, "enabled", {
    name: "Enable corner vision",
    hint: "Tokens see from every corner of their space, not just the center.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    onChange: refresh
  });
  game.settings.register(MODULE_ID, "tokens", {
    name: "Apply to",
    hint: "Which tokens get corner vision.",
    scope: "world",
    config: true,
    type: String,
    choices: {
      all: "All tokens",
      players: "Player-owned tokens only"
    },
    default: "all",
    onChange: refresh
  });
  game.settings.register(MODULE_ID, "inset", {
    name: "Corner inset (% of a grid space)",
    hint: "How far the corners are pulled in toward the center, so a corner never sits exactly on a wall.",
    scope: "world",
    config: true,
    type: Number,
    range: {min: 0.5, max: 25, step: 0.5},
    default: 2,
    onChange: refresh
  });
  game.settings.register(MODULE_ID, "edgeSamples", {
    name: "Extra points per side",
    hint: "Also see from evenly spaced points along each side of the token. 0 is corners only. "
      + "Helps with arrow slits and narrow gaps; each point costs one more vision calculation.",
    scope: "world",
    config: true,
    type: Number,
    range: {min: 0, max: 3, step: 1},
    default: 0,
    onChange: refresh
  });
}

/* -------------------------------------------- */
/*  Vision Source                               */
/* -------------------------------------------- */

/**
 * Wrap whatever vision source class is configured, so other modules that replace it still work.
 * @param {typeof foundry.canvas.sources.PointVisionSource} Base
 */
function makeCornerVisionSource(Base) {
  return class CornerVisionSource extends Base {

    /** @inheritDoc */
    _createShapes() {
      super._createShapes();
      if ( !this.#appliesHere() ) return;
      const extra = [];
      for ( const origin of this.#viewpoints() ) {
        const poly = this._getPolygonBackend().create(origin, this._getPolygonConfiguration());
        if ( poly.points.length >= 6 ) extra.push(poly.points);
      }
      if ( !extra.length ) return;
      const points = unionWithKeyholes([this.los.points, ...extra], this.origin);
      if ( !points ) return;

      // Swap in the merged line of sight, then rebuild the range-limited shapes from it around the center
      const los = this.los.clone();
      los.points = points;
      los.bounds = los.getBounds();
      this.los = los;
      this.light = this._createLightPolygon();
      this.shape = this._createRestrictedPolygon();
    }

    /* -------------------------------------------- */

    #appliesHere() {
      if ( !game.settings.get(MODULE_ID, "enabled") ) return false;
      if ( this.data.disabled || this.suppressed || this.blinded.darkness ) return false;
      if ( !this.data.walls || (this.data.angle < 360) ) return false;
      if ( this.los.points.length < 6 ) return false;
      if ( game.settings.get(MODULE_ID, "tokens") === "players" ) return !!this.object.actor?.hasPlayerOwner;
      return true;
    }

    /* -------------------------------------------- */

    /**
     * The extra points this token sees from: its corners (and optional points along its sides), pulled in by the
     * inset, and pulled back short of any wall between the center and that point.
     * @returns {ElevatedPoint[]}
     */
    #viewpoints() {
      const {x: cx, y: cy, elevation} = this.origin;
      const gridSize = canvas.dimensions.size;
      const inset = Math.max(1, gridSize * game.settings.get(MODULE_ID, "inset") / 100);
      const {width, height} = canvas.dimensions;
      const type = this.constructor.sourceType;
      const backend = this._getPolygonBackend();
      const config = this._getPolygonConfiguration();
      const results = [];

      for ( const p of this.#outlinePoints() ) {
        let dx = p.x - cx;
        let dy = p.y - cy;
        let d = Math.hypot(dx, dy);
        if ( d <= inset * 2 ) continue;
        dx /= d;
        dy /= d;
        d -= inset;

        // Stop short of a wall between the center and this point
        const target = {x: cx + (dx * d), y: cy + (dy * d), elevation};
        const hit = backend.testCollision(this.origin, target, {...config, mode: "closest"});
        if ( hit ) d = Math.hypot(hit.x - cx, hit.y - cy) - inset;
        if ( d <= inset ) continue;

        const point = {x: cx + (dx * d), y: cy + (dy * d), elevation};
        if ( !((point.x >= 0) && (point.x <= width) && (point.y >= 0) && (point.y <= height)) ) continue;
        if ( canvas.scene.testSurfaceCollision?.(this.origin, point, {type, mode: "any", level: this.level}) ) continue;
        if ( results.some(r => Math.hypot(r.x - point.x, r.y - point.y) < 1) ) continue;
        results.push(point);
      }
      return results;
    }

    /* -------------------------------------------- */

    /**
     * Points around the outline of the token's space, in canvas coordinates, centered on the vision origin.
     * @returns {Point[]}
     */
    #outlinePoints() {
      const shape = this.object.getShape();
      let corners;
      if ( shape instanceof PIXI.Polygon ) corners = dropCollinear(pairs(shape.points));
      else if ( shape instanceof PIXI.Rectangle ) {
        const {x, y, width: w, height: h} = shape;
        corners = [{x, y}, {x: x + w, y}, {x: x + w, y: y + h}, {x, y: y + h}];
      }
      else {
        // Circle or ellipse on gridless scenes: sample around it
        const b = shape.getBounds();
        const rx = b.width / 2;
        const ry = b.height / 2;
        corners = Array.fromRange(8).map(i => {
          const a = (i / 8) * 2 * Math.PI;
          return {x: b.x + rx + (rx * Math.cos(a)), y: b.y + ry + (ry * Math.sin(a))};
        });
      }

      // Optional points along each side
      const samples = game.settings.get(MODULE_ID, "edgeSamples");
      let points = corners;
      if ( samples > 0 ) {
        points = [];
        for ( let i = 0; i < corners.length; i++ ) {
          const a = corners[i];
          const b = corners[(i + 1) % corners.length];
          points.push(a);
          for ( let s = 1; s <= samples; s++ ) {
            const t = s / (samples + 1);
            points.push({x: a.x + ((b.x - a.x) * t), y: a.y + ((b.y - a.y) * t)});
          }
        }
      }

      // Shape coordinates are local to the token; center them on the vision origin
      const b = shape.getBounds();
      const ox = this.origin.x - (b.x + (b.width / 2));
      const oy = this.origin.y - (b.y + (b.height / 2));
      return points.map(p => ({x: p.x + ox, y: p.y + oy}));
    }
  };
}

/* -------------------------------------------- */

function pairs(flat) {
  const out = [];
  for ( let i = 0; i < flat.length; i += 2 ) out.push({x: flat[i], y: flat[i + 1]});
  return out;
}

function dropCollinear(points) {
  const n = points.length;
  return points.filter((p, i) => {
    const a = points[(i + n - 1) % n];
    const b = points[(i + 1) % n];
    return Math.abs(((p.x - a.x) * (b.y - a.y)) - ((p.y - a.y) * (b.x - a.x))) > 1e-6;
  });
}

/* -------------------------------------------- */

Hooks.once("init", () => {
  registerSettings();
  CONFIG.Canvas.visionSourceClass = makeCornerVisionSource(CONFIG.Canvas.visionSourceClass);
});
