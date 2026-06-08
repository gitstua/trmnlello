# trmnlello - Trello for private boards

A [TRMNL](https://trmnl.com) plugin that displays your Trello kanban board on your e-ink device. Shows all lists and cards including completed ones, with colour-coded labels and due dates.

## Don't have a TRMNL yet?

TRMNL is a low-power e-ink dashboard for calendars, to-dos, and plugins like this one. If you'd like one, using my referral link gets you a discount and sends a little my way at no extra cost to you:

**[trmnl.com?ref=eggerton](https://trmnl.com?ref=eggerton)**

## Installing

1. In your TRMNL dashboard, find **Trello for private boards** in the plugin marketplace and click **Install**
2. You'll be redirected to Trello to authorise read-only access to your boards
3. Pick which board you want to display
4. Your device will show the board on its next refresh

To switch boards later, use the **Configure** button on the plugin settings page.

## Display

The board is shown as a kanban — one column per list, cards stacked within each. Lists with names like *Done*, *Complete*, or *Shipped* get a green header. Labels appear as coloured dots, and due dates are shown in red if overdue.

The plugin supports all four TRMNL layout sizes (full screen, half vertical, half horizontal, and quadrant).

## Trello permissions

When you connect Trello, you will be asked to grant **read-only** access. This allows the plugin to:

- Read the names and lists on your boards
- Read card titles, labels, and due dates

It cannot create, edit, or delete anything in Trello. It cannot access your Trello account details, email address, or any boards you don't explicitly choose to display.

The token is scoped to `read` access and does not expire — this avoids you needing to reconnect periodically. It is stored securely and deleted when you uninstall the plugin or after 90 days of inactivity.

## Privacy & data

- Read-only Trello access is requested — the plugin cannot create, edit, or delete anything in Trello
- Your Trello OAuth token is stored in Cloudflare KV (hosted by the plugin operator) and is never sent to TRMNL — TRMNL only calls the `/markup` endpoint to fetch display content
- Tokens are automatically deleted after 90 days of inactivity, or immediately when you uninstall the plugin

## Acknowledgements

Thanks to [@ucffool](https://github.com/ucffool) who independently created a public Trello board viewer for TRMNL.

## Disclaimer

This plugin is provided **as-is, without any warranty**. Use at your own risk.

While reasonable precautions are taken (read-only Trello access, encrypted-at-rest storage, automatic token expiry), no security guarantee is made. In the event of a breach of the underlying infrastructure, Trello OAuth tokens stored in Cloudflare KV could be exposed. These tokens grant read-only access to whichever Trello board you selected — they cannot be used to modify or delete your Trello data.

You can revoke access at any time by visiting [https://trello.com/your-account/power-ups](https://trello.com/your-account/power-ups) and removing the Trmnlello authorisation, or by uninstalling the plugin from TRMNL.

The author accepts no liability for any loss or damage arising from use of this plugin.

## Issues

If something isn't working, open an issue on [GitHub](https://github.com/gitstua/trmnlello).
