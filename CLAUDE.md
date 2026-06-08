# Purpose
This is a TRMNL e-ink display plugin which shows a Trello board. It is designed to be used with the [TRMNL](https://trmnl.com/) e-ink display, but may be adaptable to other e-ink displays with some modifications.

The codebase deploys using wrangler, and is written in TypeScript. It uses the Trello API to fetch data about the specified board and displays it on the e-ink display.

The plugin is deployed using a Cloudflare Worker using GitHub Actions workflow.

## Approach
1. Try to keep codebase simple
2. If there is a better way to do something then ask
3. Keep docs in alignment with the code

## Models
There are 3 models of the TTMNL device, each with different screen sizes and capabilities. Consider all 3
- TRMNL OG: 7.5", 800×480, 128 PPI, ePaper, 4-level grayscale (B&W + 2 grays)
- TRMNL BWRY: 7.5" ePaper, black / white / red / yellow
- TRMNL X: 10.3", 1872×1404, 227 PPI, HD ePaper, 16-level grayscale

## TRMNL Design System
There is a design system for TRMNL. Where it gives the best outcome leverage the design system, but if there is a better way to do something then ask. https://trmnl.com/framework/examples