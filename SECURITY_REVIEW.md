# Security review scope

The public dashboard intentionally exposes readings and history through sanitized APIs. MQTT credentials, hardware registry files, raw database files and lifecycle control tokens must stay server-only.

The Node development bridge uses loopback binding and Host/Origin checks. Python production requires HTTPS and explicitly selected public/private access policy, serves the built frontend, validates API requests and uses private configuration outside the web root. The included lifecycle controls operate on matching project instances.

Recorded local verification covered parsing, reconnects, identity sanitization, storage persistence, access restrictions and model cases. It is not a penetration test or proof of immunity to all attacks. Host configuration, browser/device acceptance and operational recovery require independent checks.

IAMMETER's documented broker route uses plaintext port 1883. HTTPS for the website does not secure that separate connection. A TLS migration must be supported by the chosen broker and meter configuration.

Use GML_GitHub_Ready.zip for source publication. GML_Developer_Complete.zip and the hosting package include an actual meter registry for authorized development/deployment and should not be treated as public GitHub uploads. All archives exclude passwords and collected history. Review institutional asset/licensing permission before publishing the logo, portraits or study material.

If credentials were ever published, rotate them. Adding a file to .gitignore does not erase it from Git history. Public visitors can inspect the telemetry intentionally delivered to their browsers.
