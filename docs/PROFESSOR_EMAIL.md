Subject: GML research system completed for review and deployment preparation

Dear Dr. Gurung,

I have completed the current development version of the GRID Modernization Laboratory research system and prepared it for your review and hosting coordination.

The system brings together four research workspaces:

1. Energy analytics: building-level smart-meter readings, power and power-factor analysis, phase imbalance indicators, stored history and experimental demand forecasts where sufficient data are available.
2. Transformer thermal analysis: live electrical inputs from the main-transformer meter, thermal-sensitivity calculations, formula contributions and an animated 3D transformer. The thermal output is a research-model response, not a measured temperature.
3. Grid monitoring: an interactive campus distribution map, building readings, communication status and illustrative connection flows. Missing telemetry is not presented as a confirmed electrical fault.
4. PV inverter: simulations of SPWM switching, the H-bridge, LC filtering, harmonics and battery state of charge. This workspace is a simulation rather than a live inverter connection.

The platform also includes SQLite history and event storage, light and dark themes, Nepal-time displays, laboratory and team information, and server-side handling of MQTT credentials. The public interface uses building identifiers rather than exposing hardware serial numbers.

The local software checks passed 55 automated tests and the production build. In the earlier live verification, five meters supplied fresh readings; Civil and Boys Hostel did not supply messages during that observation. Their current state must be checked again at deployment. I have not treated the missing messages as evidence of a power outage.

The proposed address is https://gmlab.ku.edu.np/research/. The current cPanel account shows a zero-application limit. To deploy the complete system, KU hosting support needs to enable a Python Passenger application and an approved continuously running MQTT collector, with private database storage and outbound broker access. The existing laboratory website can remain in place.

I have prepared a practical deployment runbook, a technical project report with diagrams, an updated GitHub-oriented README and a deployment package for the developer. Could you please review the system and help coordinate the required hosting permissions with the KU administrator? I would also appreciate your confirmation of the transformer rating and meter-to-building network placements before these are used for operational interpretation.

Thank you for your guidance and support.

Kind regards,
Saujan Prakash Niroula
Research Assistant Intern
Grid Modernization Laboratory, Kathmandu University

Suggested attachments: GML_Research_Deployment_Guide.pdf; GML_Project_Technical_Report.pdf; deployment package through an approved transfer channel. Send MQTT credentials separately and securely. This is an email draft; it has not been sent.
