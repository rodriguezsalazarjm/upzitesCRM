# OUR WORK Scene — V3

The visual behavior is based on the reuploaded reference clip:
- `OUR WORK` remains on one line.
- Brand tiles are composed around the title first.
- On scroll, only a minor initial parallax occurs.
- Then `WORK` falls apart letter by letter and each brand tile exits on a different path.
- Scrolling upward reverses the full sequence.

## Next.js setup
1. Copy `OurWorkScene.tsx` and `OurWorkScene.module.css` into the same component directory.
2. Copy `public/work-brands` to your app `public/work-brands`.
3. Ensure Framer Motion is installed: `npm i framer-motion`.
4. Render `<OurWorkScene />` wherever the portfolio scene belongs.

The editable arrays at the top of `OurWorkScene.tsx` are:
- `brands`: positions and exit paths.
- `letters`: exact motion of each title letter.

## Typography
The `OUR WORK` title uses `Bebas Neue` through `next/font/google`, so it is optimized and self-hosted by Next.js at build time.
