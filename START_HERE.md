# GRID Modernization Laboratory research



For integration with the Python GML website and cPanel, read **[CPANEL.md](CPANEL.md)**. The included WSGI backend serves the console and API, and its separate MQTT collector writes the same SQLite database.

Open PowerShell and run:

```powershell
cd "D:\GML Final System\gml-platform-mqtt"
npm.cmd start
```

Keep that terminal open. Open **http://localhost:5173** in your browser. This starts both the website and MQTT bridge. `npm.cmd run dev` also starts both; `npm.cmd run preview` serves the built system with the bridge at http://localhost:4173. Press Ctrl+C to stop them. Node.js **22.13 or later** is required; this build was tested with Node 24.13.

If dependencies are missing, install once:

```powershell
npm.cmd ci
npm.cmd --prefix server ci
```

The active project is `gml-platform-mqtt`

## MQTT credentials

The bridge reads `server/.env`. Enter your dedicated MQTT username and password there. If the file is missing, copy `server/.env.example` to `server/.env`. Do not overwrite an existing configured file. Restart the bridge after editing it. Keep the password out of screenshots, source control and chat. Rotate the password shared in this conversation.

Default connection: `mqtt.iammeter.com:1883`, topic `device/<SN>/realtime`. This uses unencrypted MQTT. The password stays in the local backend; it is never sent to the website.

## Verify the meters

In another terminal:

```powershell
cd "D:\GML Final System\gml-platform-mqtt"
npm.cmd run check:meters
```

This observes all seven topics for five minutes and prints message counts, measured intervals and power. It never prints credentials. A successful broker connection alone does not verify a meter. A meter needs multiple fresh validated messages.

Observed on 8 November 2026: Main Transformer, Bio-Tech, Physics and Electrical reported about every 59 seconds. Management later reported about every 115–117 seconds. Civil and Boys Hostel had no messages during the observation. Check MQTT publishing on those meters. No meter configuration was changed by this work. The dashboard cannot make meters publish faster; publishing interval changes must be made in their supported settings.

## Use the dashboard

- **Live meters** uses received MQTT data. Missing meters remain unavailable. No automatic demo fallback.
- **Demo dataset** explicitly selects synthetic inputs. The map includes normal, low-voltage and silent-meter scenarios.
- **Transformer thermal** uses Main Transformer inputs, formula steps, a detailed 3D model, simulation and stored replay.
- **Energy analytics** selects any of the seven meters and shows demand, power quality, daily history and seasonal coverage.
- **Live grid map** shows the campus study topology, building readings and estimated downstream demand. Meter-to-bus locations require on-site confirmation. No breaker or conductor telemetry is available, so the map cannot identify a failed wire or transformer.
- **PV inverter** is an independent simulation; IAMMETER data does not control it.
- **Data path** illustrates meter-to-dashboard communication and the TCP/IP model. Animation timings are conceptual.

Freshness uses at least 120 seconds and allows for the observed meter interval. LIVE means a valid recent received message. Payloads without a verifiable device timestamp are labeled as reception time in the backend. Low measured voltage creates a warning, not an equipment diagnosis.

## History and backup

Readings and events persist in **`server/data/gml.sqlite`** using SQLite WAL. History begins when the bridge runs; previous days are not imported or invented. Daily energy integrates raw received power and excludes long gaps. Partial-day totals cover observed time only. Seasonal comparisons display coverage. Forecasting waits for at least 24 hours and observations in all local hours.

Keep the bridge running to collect history. To back up, stop both services, then copy the complete `server/data/` directory, including any SQLite WAL files, to your backup location. Do not delete the database when updating application files. Storage has no automatic retention limit; monitor disk capacity.

## Checks and build

```powershell
npm.cmd test
npm.cmd run test:server
npm.cmd run build
```

Frontend tests include formulas, topology, forecasting and rendering every project section with measured, demo and missing readings in both themes. Backend tests exercise strict parsing, all seven injected streams, WebSocket delivery, HTTP history, stale recovery, SQLite reopening and Nepal midnight. Injected test streams are not evidence of seven physical meters working.

Browser controls were unavailable in this environment. Visual appearance, touch interactions and WebGL should still be reviewed in a real browser.

## Hosting

`dist/` is a static frontend. A remotely hosted website needs a reachable HTTPS/WSS bridge; it cannot open a TCP MQTT connection itself. Configure `VITE_LIVE_WS=wss://your-lab-bridge.example` before building, allow the website's exact origin in `server/.env`, and put the bridge behind an authenticated TLS reverse proxy. The bridge binds to `127.0.0.1` by default. A hosted frontend without a bridge URL shows unavailable data rather than contacting localhost.

The private Sites publication attempt did not complete because the source workflow helper could not prepare its checkout. No successful hosted URL is claimed. The local build works independently.

## IAMMETER references

- [MQTT integration and topics](https://www.iammeter.com/docs/integrate-with-mqtt-server)
- [JSON phase field ordering](https://www.iammeter.com/newsshow/energy-meter-json-value)
- [IAMMETER broker service](https://www.iammeter.com/blog/subscribe-real-time-energy-data-mqtt)
- [Firmware and upload interval features](https://www.iammeter.com/newsshow/blog-fw-features)
- [Laboratory campus study map](https://gmlab.ku.edu.np/gml_grid.html)
