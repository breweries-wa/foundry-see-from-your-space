# Corner Vision

A Foundry VTT v14 module that lets tokens see from every corner of their space, not just the center.

Foundry draws a token's vision from the center of the token. In D&D a creature can see out of anywhere in its
space, so standing at a corridor corner should let it peek further down the side passage. This module adds
viewpoints at each corner of the token and merges what they see into the token's vision.

## How it works

- Each corner is pulled in slightly toward the center, so it never sits exactly on a wall.
- If a wall lies between the token's center and a corner, that corner is pulled back to just short of the wall.
  A token straddling a wall never sees out the far side of it.
- The merged view is used for everything: the rendered vision, fog of war exploration, and spotting other tokens.
- Shadows behind narrow pillars stay dark where none of the viewpoints can see.
- Vision range and darkvision are still measured from the token's center.
- Tokens with a limited vision angle (cones) keep core behavior.

## Settings

| Setting | Default | Meaning |
| --- | --- | --- |
| Enable corner vision | On | Master switch. Changes apply immediately. |
| Apply to | All tokens | Or only player-owned tokens. |
| Corner inset | 2% of a grid space | How far corners are pulled in toward the center. |
| Extra points per side | 0 | Also see from points along each side. Helps with arrow slits; costs performance. |

Each viewpoint is one more vision calculation per token, so a token with corner vision costs about five times
the core vision work. That's fine for a party; very wall-heavy maps with many sighted tokens may notice it.

## Install

In Foundry (or The Forge's Bazaar), use **Install Module** and paste this manifest URL:

```
https://github.com/breweries-wa/foundry-corner-vision/releases/latest/download/module.json
```

## Compatibility

Foundry v14. Wraps `CONFIG.Canvas.visionSourceClass` rather than replacing it, so it stacks on top of other modules
that customize vision sources, but modules that also change how token line of sight is computed may conflict.

## License

MIT
