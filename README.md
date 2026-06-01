# trmnlello - Trello for private boards

A [TRMNL](https://usetrmnl.com) plugin that displays your Trello kanban board on your e-ink device. Shows all lists and cards including completed ones, with colour-coded labels and due dates.

## Installing

1. In your TRMNL dashboard, find **trmnlello** in the plugin marketplace and click **Install**
2. You'll be redirected to Trello to authorise read-only access to your boards
3. Pick which board you want to display
4. Your device will show the board on its next refresh

To switch boards later, use the **Configure** button on the plugin settings page.

## Display

The board is shown as a kanban — one column per list, cards stacked within each. Lists with names like *Done*, *Complete*, or *Shipped* get a green header. Labels appear as coloured dots, and due dates are shown in red if overdue.

The plugin supports all four TRMNL layout sizes (full screen, half vertical, half horizontal, and quadrant).

## Privacy & data

- Read-only Trello access is requested — the plugin cannot create, edit, or delete anything in Trello
- Your Trello OAuth token is stored in Cloudflare KV (hosted by the plugin operator) and is never sent to TRMNL — TRMNL only calls the `/markup` endpoint to fetch display content
- Tokens are automatically deleted after 90 days of inactivity, or immediately when you uninstall the plugin

## Acknowledgements

Thanks to [@ucffool](https://github.com/ucffool) who independently created a public Trello board viewer for TRMNL.

## Issues

If something isn't working, open an issue on [GitHub](https://github.com/gitstua/trmnlello).
