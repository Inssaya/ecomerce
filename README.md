# Mostyle

## Run on your LAN

The frontend now listens on `0.0.0.0` for both development and production-style local runs, so other devices on the same Wi-Fi or wired LAN can open it.

Use your machine's LAN IP in the browser, for example:

- `http://192.168.1.20:3000` for `npm run dev` or `npm run start`
- `http://192.168.1.20:80` if you are serving through the production nginx stack

If the page still does not load from another device, check the host firewall and make sure the machine IP did not change.
