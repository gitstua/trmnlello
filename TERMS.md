# Terms of Use

**Trmnlello - Trello private board**
Operated by Stuart Eggerton ("the operator")

Last updated: June 2026

## 1. Acceptance

By installing and using this plugin you agree to these terms. If you do not agree, do not install the plugin.

## 2. What this service does

Trmnlello connects your Trello account to your TRMNL e-ink device, displaying the contents of a board you choose. It requests **read-only** access to Trello — it cannot create, modify, or delete any Trello data.

## 3. Data we store

To operate the service, the following data is stored in Cloudflare KV (a cloud key-value store):

- Your Trello OAuth token (read-only scope)
- The Trello board ID and name you selected
- A TRMNL access token used to authenticate display requests

This data is stored only as long as needed. Tokens are deleted immediately when you uninstall the plugin, or automatically after 90 days of inactivity.

No data is sold or shared with third parties. Data is only used to fetch your Trello board and render it on your device.

## 4. Security

Data is encrypted at rest by Cloudflare. Reasonable precautions are taken, but **no security guarantee is made**. In the event of a breach, your read-only Trello token could be exposed. This token can only be used to read Trello data — it cannot be used to modify your account.

You can revoke access at any time by:
- Uninstalling the plugin from TRMNL, or
- Visiting your [Trello Power-Ups settings](https://trello.com/your-account/power-ups) and revoking the Trmnlello authorisation

## 5. Availability

This service is provided free of charge on a best-effort basis. The operator reserves the right to modify, suspend, or withdraw the service at any time without notice.

## 6. No warranty

This plugin is provided **as-is, without any warranty of any kind**, express or implied. The operator makes no guarantees about uptime, accuracy, or fitness for any particular purpose.

## 7. Limitation of liability

To the fullest extent permitted by law, the operator accepts no liability for any loss or damage — direct, indirect, or consequential — arising from your use of this plugin.

## 8. Changes to these terms

These terms may be updated at any time. Continued use of the plugin after changes are posted constitutes acceptance of the new terms.

## 9. Contact

For questions or concerns, please open an issue at [https://github.com/gitstua/trmnlello](https://github.com/gitstua/trmnlello).
