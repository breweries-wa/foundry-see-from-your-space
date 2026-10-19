# See From Your Space

A Foundry VTT v14 module that lets tokens see from anywhere in their own space, not just its center.

Foundry draws a token's vision from a single point at the center of the token. In D&D a creature can see out of
anywhere in the space it occupies, so a token standing at a corridor corner should see a little further down the
side passage than its center point can. This module adds viewpoints at the corners of the token's space and
merges what they see into the token's vision. Sight still starts inside the token's space and is still stopped
by walls, including any wall that runs through the space itself.

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
| See from your space | On | Master switch for the world. Changes apply immediately. |
| Use on this device | On | Per player, per computer. A player whose vision feels slow can turn it off; their tokens then see from the center only. |
| Apply to | All tokens | Or only player-owned tokens. |
| Corner inset | 2% of a grid space | How far corners are pulled in toward the center. |
| Extra points per side | 0 | Also see from points along each side. Helps with arrow slits; costs performance. |

Each viewpoint is one more vision calculation per token, so a token that sees from its whole space costs about five times
the core vision work. That's fine for a party; very wall-heavy maps with many sighted tokens may notice it.
Players on slower computers can switch it off for themselves with **Use on this device**.

## Install

In Foundry (or The Forge's Bazaar), use **Install Module** and paste this manifest URL:

```
https://github.com/breweries-wa/foundry-see-from-your-space/releases/latest/download/module.json
```

## Compatibility

Foundry v14. Wraps `CONFIG.Canvas.visionSourceClass` rather than replacing it, so it stacks on top of other modules
that customize vision sources, but modules that also change how token line of sight is computed may conflict.

## License

MIT
