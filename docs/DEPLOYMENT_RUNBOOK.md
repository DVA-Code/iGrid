# Deploy GML at /research
## A practical developer field guide
Target: https://gmlab.ku.edu.np/research/
Grid Modernization Laboratory, Kathmandu University | 13 November 2026

> **START HERE**
> Give the developer the production ZIP and this guide. Give credentials separately. Do not upload the backend into public_html.

```mermaid
flowchart LR
  n0["Get KU approval"]
  n1["Upload + extract"]
  n2["Configure Python"]
  n3["Mount /research"]
  n4["Run MQTT"]
  n5["Prove it works"]
  n0 --> n1 --> n2 --> n3 --> n4 --> n5
```


## The current problem
The account shows zero applications allowed. Files can be uploaded, but the Python API cannot be registered until KU changes the restriction. A second requirement is continuous MQTT collection: it must remain running after you close the terminal.

## The solution you are aiming for
> **FRONTEND**
> /home/gmlabatku/gml-console/dist - served by the Python application at /research/. Keep the compiled files here; do not move only index.html.

> **BACKEND**
> /home/gmlabatku/gml-console/python_backend plus passenger_wsgi.py - mounted by Passenger, with a separate supervised collector.

> **DATABASE + SECRETS**
> /home/gmlabatku/gml-private/gml.sqlite and gml.env - private, persistent and outside public_html.


## Follow the numbered stages
Each stage shows the owner, action and success check. Commands run in the location stated. Stop at a failed gate. Expected outputs are not evidence of completed KU deployment. The main website remains at /.

> **FINISH LINE**
> Website opens; API returns JSON; publishing meters have fresh timestamps; history grows; private files are denied; collection survives terminal closure and approved restart tests.



---

# 1. How the deployed system works
> **YOUR ACTION**
> Understand the two running components

> **PASS THIS GATE**
> Web workers serve requests; one separate collector writes history.


The data path is:

```text
Seven IAMMETER meters
        | meter uploads
IAMMETER MQTT broker
        | outbound subscriber connection from KU server
One Python MQTT collector (continuous service)
        | validates and stores incoming readings
Private SQLite database
        | read by Python WSGI API
Passenger + Apache/NGINX + HTTPS
        | /research/ and /research/api/...
Public browser dashboard
```

The web application serves the built dashboard and API. It may have multiple Passenger workers. The collector is a separate process and must have exactly one active instance for this database. It cannot depend on an open browser or a developer's laptop. Do not launch it from passenger_wsgi.py.

The database is SQLite, a file on the server, not a MySQL service. The application creates its schema: readings, events, bridge_state and predictions. No cPanel Database Wizard, database username, inbound database port or Remote Database Access entry is needed. Forecast records require sufficient measured history; deploying the site does not manufacture historic or seasonal data.

Public access means visitors can inspect/download readings delivered to their browsers. It does not give them MQTT credentials. The browser requests the site's HTTPS API; it does not log into the broker.

IAMMETER's documented broker is mqtt.iammeter.com, TCP 1883, non-SSL. Topics follow device/{SN}/realtime, resolved using private server/meters.json. Dedicated credentials come from IAMMETER MQTT Settings, not the normal cloud login. IAMMETER describes this broker as a development/testing service and recommends a privately operated broker for production [3]. HTTPS on the website does not encrypt this MQTT leg.

Do not change working meter upload settings simply to deploy the dashboard. For a meter that has no feed, the authorized meter administrator should verify its MQTT configuration, connectivity and topic access. Moving to a TLS broker requires separately confirmed meter/firmware compatibility and approved reconfiguration.

---

# 2. What the developer must ask KU
> **YOUR ACTION**
> Send the request before installation

> **PASS THIS GATE**
> KU confirms application capacity, interpreter, supervision, storage and network access.


Send this request to the hosting administrator using your normal approval channel. It is a draft, not a message already sent.

Subject: Enable GML research application and continuous MQTT collector

Please enable deployment of the GML research console for cPanel account gmlabatku, domain gmlab.ku.edu.np, at /research. Application Manager currently reports a zero-application limit. We need:

1. At least one Passenger Python application and permission to mount it at /research without replacing the existing website. Please resolve the account/package application limit as well as enabling the feature.
2. A supported Python 3 version with venv, pip and SQLite JSON support. The application declares Python 3.9+; please select a currently maintained runtime and validate it on this host. Confirm the per-application interpreter path.
3. Account Terminal/SSH access, or an administrator to run the installation commands. Shell access is for setup; it does not by itself provide a permanent collector.
4. One supervised long-running Python collector under user gmlabatku, started on boot and automatically restarted on failure. Confirm the approved process manager and resource limits.
5. DNS resolution and outbound TCP to mqtt.iammeter.com:1883, plus installation access to the Python package index. No inbound MQTT listener is required. Please assess the unencrypted broker connection; a TLS alternative needs separate meter configuration approval.
6. Private local storage writable by the app/collector account, with working SQLite WAL locking, backups and disk monitoring. The screenshot showed about 3 GB total account quota; agree retention and growth management.
7. Valid HTTPS for the domain, correct HTTPS detection behind the proxy, no cache for /research/api/*, and no public access to backend/configuration/database files.
8. A maintenance contact, approved log locations, rollback method and access for deployment troubleshooting.

Administrator notes: cPanel documents Application Manager as provider-controlled in WHM Feature Manager, with Passenger and mod_env prerequisites [1,2]. Module package names depend on the server OS; do not blindly install a package copied from another distribution. Do not change the server-wide Python default merely to configure this application. If persistent collection is prohibited, request an approved separate server and choose the alternative in section 12.

---

# 3. Prepare and upload the handover
> **YOUR ACTION**
> Extract at the account home, not the web root

> **PASS THIS GATE**
> gml-console/dist/index.html and passenger_wsgi.py exist at the paths shown.


Owner: developer. Do this only after KU confirms the required hosting capabilities.

On the Windows development computer, the existing ready-to-upload file is D:\GML Final System\gml-cpanel-v8.zip. If code changed, regenerate it from the working project:

```powershell
Set-Location "D:\GML Final System\gml-platform-mqtt"
npm.cmd run build
python scripts/package-source.py
Get-FileHash "D:\GML Final System\gml-cpanel-v8.zip" -Algorithm SHA256
```

Expected: the build exits successfully; packaging lists gml-cpanel-v8.zip and reports that credentials/history were excluded. Record the SHA256 with the handover. Dependencies must already be installed; on a new development checkout first run npm.cmd ci and npm.cmd ci --prefix server. Do not ZIP the entire working folder: it contains private .env, history and runtime data.

In cPanel: Files > File Manager > Home. Confirm the location is /home/gmlabatku, not public_html. Click Upload, upload gml-cpanel-v8.zip, return to File Manager, select it and choose Extract. Set extraction destination to /home/gmlabatku. The ZIP already contains a top-level gml-console folder. Do not create another gml-console folder inside it.

Equivalent commands in cPanel Terminal (Advanced > Terminal), if unzip is installed:

```bash
cd /home/gmlabatku
pwd
sha256sum gml-cpanel-v8.zip
unzip -l gml-cpanel-v8.zip | head -20
unzip -n gml-cpanel-v8.zip -d /home/gmlabatku
ls -l /home/gmlabatku/gml-console/passenger_wsgi.py
ls -l /home/gmlabatku/gml-console/dist/index.html
```

Expected: pwd is /home/gmlabatku, checksum matches the sender's value, and both files exist. -n avoids overwriting an existing installation; this is the first-install procedure. For an existing installation, use the update procedure instead of extracting over it. If Terminal is absent, KU must enable it or run these steps; Site Quality Monitoring does not substitute for it.

---

# 4. Folder layout and Python environment
> **YOUR ACTION**
> Keep the complete extracted structure

> **PASS THIS GATE**
> The frontend stays inside dist; backend stays alongside it; private data sits outside both.


Owner: developer using the hosting account. Preserve the existing public_html website.

```text
/home/gmlabatku/
  public_html/                 Existing GML website
  gml-console/                 Extracted application
    dist/                      Built browser files and assets
    python_backend/            WSGI API and MQTT collector
    server/meters.json         Private meter registry
    deploy/                    Setup and service helpers
    passenger_wsgi.py          WSGI entry point
    tmp/                       Passenger restart marker
  gml-venv/                    Python virtual environment
  gml-private/                 Created by setup; not public
    gml.env                    Private configuration
    gml.sqlite                 Database created at runtime
    collector.lock             Prevents duplicate collection
    collector.pid.json         Runtime identity
    collector.log              Private service log
```

The /research URL is a web-server mount. It does not mean copying all of gml-console into public_html/research. Passenger may create web routing files; retain its generated configuration and keep private application files outside the document root.

Run in cPanel Terminal or SSH as gmlabatku:

```bash
cd /home/gmlabatku/gml-console
python3 --version
python3 -m venv /home/gmlabatku/gml-venv
/home/gmlabatku/gml-venv/bin/python -m pip install -r python_backend/requirements.txt
/home/gmlabatku/gml-venv/bin/python -c "import sqlite3,paho.mqtt.client; print('Python dependencies OK')"
```

Expected: a supported interpreter, successful Paho installation and Python dependencies OK. If KU supplies a versioned Python binary, replace python3 in the venv creation step with that confirmed binary. If venv/pip is unavailable, ask KU to install the matching system support; do not install packages with sudo from the cPanel account.

Node.js, npm and the Vite development server are not needed on the production host. The ZIP already includes dist. Do not expose development ports 5173, 8787 or 8788 to the internet.

---

# 5. Configure MQTT and the database
> **YOUR ACTION**
> Configure dedicated MQTT credentials on the server

> **PASS THIS GATE**
> Preflight passes; config permissions are 600; no password is placed in frontend code.


Owner: developer with authorized dedicated MQTT credentials. Run interactively in the hosting terminal:

```bash
cd /home/gmlabatku/gml-console
/home/gmlabatku/gml-venv/bin/python -m deploy.setup --public
```

Answer the prompts:
- Broker host: mqtt.iammeter.com for the existing route.
- Verified TLS: N for the documented port 1883 service. Do not select TLS unless a working TLS broker and meter route are confirmed.
- Port: 1883 for that service.
- Plaintext acknowledgement: type ACCEPT PLAINTEXT only if the deployment owner accepts the stated network risk. Otherwise stop and arrange the approved TLS route.
- Dedicated MQTT username and password: enter privately. The password prompt hides typing.

Expected output includes Private configuration created and GML_ENV=/home/gmlabatku/gml-private/gml.env. --public allows anyone to view readings/history. The configuration still remains private. Setup refuses to overwrite an existing configuration; edit it privately for credential rotation rather than deleting it.

The setup selects GML_DB=/home/gmlabatku/gml-private/gml.sqlite. The file and schema are created when the backend/collector first opens storage. No SQL import is required for a new empty history. MQTT starts only when the collector runs; there is no cPanel MQTT switch.

```bash
export GML_ENV=/home/gmlabatku/gml-private/gml.env
/home/gmlabatku/gml-venv/bin/python -m deploy.preflight --network
ls -ld /home/gmlabatku/gml-private
stat -c '%a %n' /home/gmlabatku/gml-private/gml.env
```

Expected: all preflight checks PASS; private directory 700 and configuration 600. The network probe checks TCP/TLS reachability, not successful authentication or actual readings. The export applies only to this shell; Passenger and the service need their own settings. Both processes must run as an account able to access the same private database. Do not fix permission failures with chmod 777. Keep credentials out of screenshots, shell command arguments, public logs and VITE_ variables.

---

# 6. Make /research open the system
> **YOUR ACTION**
> Register the Python mount at /research

> **PASS THIS GATE**
> /research/ returns the console; /research/api/status returns JSON.


Owner: developer in cPanel, with KU assistance for Passenger configuration.

Open Software > Application Manager > Register Application. If the zero-application message remains, return to KU; uploading files cannot bypass it. Use these values:

```text
Application Name:       GML Research
Deployment Domain:      gmlab.ku.edu.np
Base Application URL:   /research
Application Path:       gml-console
Deployment Environment: Production
Environment variable:
GML_ENV = /home/gmlabatku/gml-private/gml.env
```

Click Deploy. Application Path is relative to the home directory. KU must confirm the Python WSGI application type, entry passenger_wsgi.py, callable application, and interpreter /home/gmlabatku/gml-venv/bin/python. Standard Application Manager may not show a Python interpreter selector. If KU offers a different Setup Python App interface, use the equivalent fields, but do not register a duplicate app through both interfaces.

Do not use Enable Dependencies as a substitute for pip: cPanel describes that action as npm-related [1]. The Python dependency installation is in section 4. Preserve the supplied passenger_wsgi.py; the collector does not belong in it.

Check from the hosting terminal:

```bash
curl -I https://gmlab.ku.edu.np/research
curl -I https://gmlab.ku.edu.np/research/
curl -sS https://gmlab.ku.edu.np/research/api/status
```

Expected: /research opens directly or redirects to /research/; the trailing-slash URL returns 200 HTML; the API returns JSON. COLLECTOR_OFFLINE is expected before starting the collector. If the no-slash URL is 404, KU must correct the base URL mount/canonical-slash routing. Do not redirect /research to itself or to localhost.

After success, back up the existing site's index.html and add a navigation link:

```html
<a href="/research/">Research Console</a>
```

For code updates, Passenger's restart mechanism uses an application marker [2]:

```bash
mkdir -p /home/gmlabatku/gml-console/tmp
touch /home/gmlabatku/gml-console/tmp/restart.txt
```

This restarts web workers on subsequent use; it does not restart the separate MQTT collector.

---

# 7. Keep MQTT running continuously
> **YOUR ACTION**
> Replace the smoke-test terminal with supervision

> **PASS THIS GATE**
> Exactly one collector is RUNNING and keeps collecting after logout.


Owner: KU administrator for the process manager; developer for the smoke test. Choose one production manager, not several.

First, a brief foreground test in the hosting terminal:

```bash
cd /home/gmlabatku/gml-console
export GML_ENV=/home/gmlabatku/gml-private/gml.env
/home/gmlabatku/gml-venv/bin/python -m python_backend.collector
```

Expected: GML collector running; MQTT state transitions toward LIVE after subscription approval. Confirm actual meter messages through the API in another terminal. Press Ctrl+C to stop this foreground test before enabling supervision. A terminal kept open is not production hosting.

If KU uses Supervisor, the administrator can install the following program definition in the host's configured Supervisor include directory. The include directory and availability are host-specific; do not assume sudo access from cPanel.

```ini
[program:gml-collector]
directory=/home/gmlabatku/gml-console
command=/home/gmlabatku/gml-venv/bin/python -m python_backend.collector --instance supervisor
environment=GML_ENV="/home/gmlabatku/gml-private/gml.env",GML_MODE="production"
user=gmlabatku
autostart=true
autorestart=true
startsecs=10
stopwaitsecs=15
stopsignal=TERM
umask=0077
redirect_stderr=true
stdout_logfile=/home/gmlabatku/gml-private/collector.log
stdout_logfile_maxbytes=5MB
stdout_logfile_backups=3
```

KU administrator terminal, after installing the definition:

```bash
supervisorctl reread
supervisorctl update
supervisorctl status gml-collector
```

Expected: gml-collector RUNNING with a PID and uptime. KU must also ensure Supervisor itself starts at server boot. Later use supervisorctl restart gml-collector or supervisorctl stop gml-collector. Do not use the manual deploy.collector start helper alongside Supervisor. If another manager is used, KU must supply equivalent start/stop/status commands and demonstrate restart-on-failure and reboot recovery.

---

# 8. Acceptance checks before handover
> **YOUR ACTION**
> Check the browser, API, history and private paths

> **PASS THIS GATE**
> All acceptance checks pass or remaining limitations are explicitly recorded.


Owner: developer; KU confirms service and firewall checks. These are required checks, not claims of completed hosting tests.

Run in the hosting terminal:

```bash
curl -sS https://gmlab.ku.edu.np/research/api/status
curl -sS https://gmlab.ku.edu.np/research/api/coverage
curl -sS 'https://gmlab.ku.edu.np/research/api/history/main-transformer?range=24h'
curl -sS https://gmlab.ku.edu.np/research/api/events
curl -sS https://gmlab.ku.edu.np/research/api/forecast/main-transformer
```

Acceptance: status has seven building records and current collector heartbeat. Broker LIVE means the MQTT connection/subscriptions succeeded; each meter separately needs recent readings. Repeat coverage after several minutes: counts should increase for meters publishing valid data. History must survive collector and web application restarts. Forecast may legitimately be unavailable until sufficient history exists.

During the local verification on 13 November 2026, new readings arrived from Main Transformer, Bio-Tech, Physics, Management and Electrical. Civil and Boys Hostel had no messages during that observation. This is not a guarantee of their deployment-day state, nor evidence of a power or wire fault.

Private-file checks (expect 404; 403 at an upstream security boundary is also acceptable):

```bash
curl -I https://gmlab.ku.edu.np/research/.env
curl -I https://gmlab.ku.edu.np/research/server/meters.json
curl -I https://gmlab.ku.edu.np/research/python_backend/app.py
curl -I https://gmlab.ku.edu.np/research/gml.sqlite
```

In browser developer tools, check requests use /research/api/* on HTTPS, public data uses building aliases, and no MQTT password is present. An API error must not be replaced by an HTML cached fallback. Configure any NGINX/CDN layer to respect no-store and bypass caching for /research/api/*.

Test phone, tablet and desktop: all four projects, navigation from every page, theme switching, map zoom and building selection, meter cards, history range, TCP/IP view and transformer rendering/fallback. Use real device browsers where possible. Record failures; local automated tests do not certify those devices.

Finally verify the main GML homepage still works, /research and /research/ both work, HTTPS is valid, and closing the developer's terminal does not stop data ingestion.

---

# 9. Troubleshooting by observed evidence
> **YOUR ACTION**
> Use the observed error to select the next check

> **PASS THIS GATE**
> The cause is established at the correct layer; no electrical fault is invented.


Zero applications allowed: KU must change the account/package restriction and enable application hosting. Terminal commands cannot remove the quota. Site Quality Monitoring only monitors sites.

/research gives 404: confirm the domain, base URL /research and application path gml-console. Check extraction did not produce gml-console/gml-console. Ask KU to inspect the Passenger mount and slash redirect.

500/502 or Passenger error: confirm the selected interpreter and permissions; check the provider's Passenger error log (often the application stderr.log). Verify imports with the same virtual-environment interpreter. Do not publish logs containing paths or secrets.

403 HTTPS required behind a reverse proxy: ask KU whether HTTPS is passed correctly in WSGI. Set GML_TRUST_HTTPS_PROXY=true only after KU confirms incoming forwarded headers are stripped/replaced by a trusted proxy. Never disable HTTPS checking to mask this.

503 Dashboard access is not configured: Passenger is not reading the intended private config, or its permissions are wrong. Confirm GML_ENV and GML_ACCESS=public in the private file. Do not paste that file into chat or a ticket.

COLLECTOR_OFFLINE: check the manager's process status, the private log, config path, shared database path and write permissions. Passenger running successfully does not prove collection is running.

CONNECTION_ERROR/DISCONNECTED: check server DNS, routing and broker reachability using deploy.preflight --network. Authentication failures require checking dedicated MQTT credentials. Subscription failures require checking topic permissions. Connection resets/refusals do not prove a campus electrical fault.

LIVE broker but NO DATA/STALE meter: verify the authorized meter's actual publication settings, connectivity and topic registry. Check for rejected payloads. Distinguish absent telemetry from power loss; state the cause is unknown unless independent equipment evidence confirms it.

Database locked/storage error: ensure one collector, shared local storage with proper locking, free disk space and bounded queries. Do not delete SQLite files or disable locking. Duplicate collector messages mean another process already holds the application lock.

Slow/stale UI: inspect API HTTP status, cache headers, response age and browser console. Verify the network panel is requesting /research/api, not a localhost address. Do not start npm run dev on production to work around a broken mount.

File permissions: the supplied website screenshot showed some 0777 folders and 0666 files. KU should verify ownership and reduce unnecessary write access. Typical public directories/files are 0755/0644; the private folder/config are 0700/0600. Do not recursively change the entire hosting account without checking ownership and application requirements.

---

# 10. History, backups and migration
> **YOUR ACTION**
> Back up and verify before moving history

> **PASS THIS GATE**
> Backup integrity is ok; restore preserves the intended history.


Owner: developer and KU operations. Agree a backup schedule and storage quota before launch. SQLite is the research history; replacing application code must not replace it. No automatic history deletion policy is configured.

Create a consistent backup using SQLite's backup API, not a casual copy of a live .sqlite file. Run as gmlabatku in the hosting terminal:

```bash
umask 077
mkdir -p /home/gmlabatku/gml-private/backups
/home/gmlabatku/gml-venv/bin/python - <<'PY'
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
folder = Path('/home/gmlabatku/gml-private')
stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
source = sqlite3.connect(str(folder/'gml.sqlite'))
target = sqlite3.connect(str(folder/'backups'/('gml-'+stamp+'.sqlite')))
source.backup(target)
print('Backup integrity:', target.execute('PRAGMA integrity_check').fetchone()[0])
target.close()
source.close()
PY
```

Expected: Backup integrity: ok. Verify the source database exists before running this; SQLite can create an empty database when given a nonexistent path. Keep backup copies off-host through an approved secure process. Back up gml.env separately with restricted access, not in the developer ZIP. Retention and deletion require an agreed research policy. A 3 GB account can fill with both telemetry and repeated backups.

To migrate existing Windows history: stop the local system with npm.cmd stop, confirm the database exists at server/data/gml.sqlite, and make a SQLite backup using the same Python backup API with Windows paths. Transfer that backup privately to KU, not public_html.

Before importing: stop the hosted collector through its manager, take the web application out of service, and back up any existing hosted database. Import the consistent backup as /home/gmlabatku/gml-private/gml.sqlite with correct ownership and restrictive permissions. Do not leave unrelated old -wal/-shm sidecars beside a replacement database; have the developer handle these only after all connections are closed. Restart the web app and collector, then verify integrity, old date ranges and fresh messages.

If local and hosted databases both contain unique history, do not overwrite one with the other. An explicit deduplicating migration is required and is not supplied by these installation commands.

---

# 11. Updates, rollback and final handover
> **YOUR ACTION**
> Preserve data while replacing application code

> **PASS THIS GATE**
> Rollback is available; restart and acceptance are repeated.


Owner: developer, coordinated with KU. This is a maintenance workflow rather than the first-install unzip command.

1. Build and test a new production ZIP on the development computer. Share its SHA256, release notes and any schema changes. Credentials and history stay outside the archive.
2. Upload and extract the new release into a staging directory outside public_html. Validate its files, dependencies and configuration expectations. Do not run a second production collector against the live database.
3. Take a consistent database backup and a private configuration backup. Record the current application version and service configuration. Agree a short maintenance window.
4. Stop the collector through the production manager and take the web application out of service. Preserve the existing code directory as a rollback copy. Promote the staged code to the configured gml-console path; keep gml-private and gml-venv separate.
5. Install changed requirements in the confirmed environment, run preflight, restart Passenger and restart the collector. Repeat section 8. A database migration, if introduced by a future release, requires its own reviewed plan.
6. If acceptance fails, stop the new processes and restore the previous code and compatible dependencies. Restore a database backup only if required by a schema change and after considering any new readings; a database rollback can lose recent history. Record the collection gap.

Operational commands (administrator's Supervisor setup):

```bash
supervisorctl status gml-collector
supervisorctl restart gml-collector
supervisorctl stop gml-collector
supervisorctl start gml-collector
```

Developer's Passenger restart marker:

```bash
touch /home/gmlabatku/gml-console/tmp/restart.txt
```

Final handover must record:
- Live URL and confirmation that the existing website remains intact.
- Interpreter, application root, private configuration and database locations.
- Service manager, start/stop/restart commands, logs and administrator contact.
- Backup schedule, restore test result, disk alerts and retention decision.
- Per-meter publication status, measured update intervals and unresolved missing feeds.
- Browser/device acceptance results, deployment date and release checksum.

Never promise fault detection from missing MQTT messages, complete immunity to attacks, or uninterrupted operation on a broker that the service owner describes as a development/testing service. Monitoring, backups and an approved production hosting arrangement are part of operation.

---

# 12. If cPanel cannot run the backend
> **YOUR ACTION**
> Choose redirect or administrator reverse proxy

> **PASS THIS GATE**
> The complete external service is tested before changing /research routing.


There are two workable alternatives. Select one with KU; neither requires exposing broker credentials to the browser.

Option A: redirect /research to an approved external HTTPS application. Run the complete dashboard, Python API, private SQLite and supervised collector on the approved server. The external server must be independently configured and tested. In cPanel Domains > Redirects, choose gmlab.ku.edu.np, path research and the confirmed external application URL. Use a temporary 302 while testing and leave wildcard redirect off. Do not redirect the entire domain. Test both /research and /research/ plus the main homepage. The address bar changes to the external host. Use a permanent redirect only after KU accepts the target and policy. Do not enter a guessed or localhost target.

Option B: preserve the address bar at gmlab.ku.edu.np/research. KU configures a reverse proxy for /research/ to the approved server. The remote WSGI app must be mounted consistently at /research (or have a correctly configured SCRIPT_NAME), with asset paths and API paths tested. KU must configure trusted HTTPS forwarding, certificate validation, timeouts, access limits and cache bypass. This requires web-server administrator configuration; a normal cPanel redirect cannot act as a reverse proxy. Avoid giving a generic Apache/NGINX snippet before the actual topology is known.

Hosting a static dashboard alone does not create continuous collection. A split design with an external API needs additional origin/security configuration and is not the default hosting package. The simplest fallback is hosting the complete application together and linking/redirecting to it.

Do not create a subdomain as a workaround without KU approval; the requested address is a path on the existing domain and does not require a DNS change for the normal same-host deployment.

Decision for the developer: if KU enables Passenger plus supervision, follow sections 3-8. If Passenger is enabled but background processes are forbidden, the full same-host deployment remains unsupported; obtain an approved collection host or deploy the complete system elsewhere. If KU grants neither, request a redirect to that independently hosted system.

---

# 13. References and scope of verification
> **YOUR ACTION**
> Record evidence and operating ownership

> **PASS THIS GATE**
> Developer, lab and KU agree the operational handover.


[1] cPanel Application Manager: interface fields, provider-controlled feature, environment-variable requirements and log locations.
https://docs.cpanel.net/cpanel/software/application-manager/

[2] cPanel Python WSGI application installation: provider prerequisites, Python environment, Passenger registration and restart marker.
https://docs.cpanel.net/knowledge-base/web-services/how-to-install-a-python-wsgi-application/

[3] IAMMETER real-time MQTT documentation: broker, dedicated credentials, topic format, non-SSL port and service status.
https://www.iammeter.com/blog/subscribe-real-time-energy-data-mqtt

References checked on 12 November 2026; guide updated 13 November 2026. Detailed application-specific commands were checked against the included deployment helpers, configuration loader, WSGI entry point and collector. The process manager example is a deployment template; it has not been installed or exercised on KU's server.

Known local verification preceding this guide: 12 Node backend tests, 4 launcher tests, 4 Python backend tests and 35 frontend/model tests passed; the production build passed; npm audits reported zero known vulnerabilities at that time. These results are not a penetration test and do not certify the host, Linux process supervision or physical-device rendering. This PDF does not contain MQTT credentials, hardware serial numbers or collected history.

Expected result after successful deployment:

```text
https://gmlab.ku.edu.np/          Existing laboratory website
https://gmlab.ku.edu.np/research  Opens or redirects to /research/
https://gmlab.ku.edu.np/research/ GML research console
/research/api/status             Public sanitized telemetry JSON
Private MQTT settings            Outside public_html
History                         Private persistent SQLite storage
Collector                       Supervised continuous Python service
```

Administrator approval and on-host acceptance remain mandatory. The zero-application quota is a real account restriction shown in the supplied screenshot, not an error that can be fixed by renaming a ZIP or uploading Python into public_html.
