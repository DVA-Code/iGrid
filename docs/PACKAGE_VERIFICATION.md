# Archive verification - 13 November 2026

The GitHub ZIP was extracted into a fresh project directory. Its setup command installed the locked frontend and local-backend dependency trees, created blank credential configuration and a fictional meter registry, and preserved the separation from the working project's private files.

Checks on the extracted source:

- Production TypeScript/Vite build: passed.
- Launcher tests: 4 passed.
- Node backend tests: 12 passed.
- Frontend/model tests: 35 passed.
- Python backend tests: 4 passed, including the initial six-hour history request used by the browser.
- Both npm installs reported zero known vulnerabilities at the time of installation.
- Markdown document/image links checked within the extracted package.
- Archive CRC, required-source inclusion and private-value scans passed.

The packaging filter now excludes server/data history specifically while including the required src/lib/data/demo.ts source module. The hosted Python API accepts the frontend's six-hour history range.

These are build/software checks with test fixtures; they are not a new live-meter observation, a cPanel deployment, a penetration test or device-browser certification. Browser capture was unavailable; README figures are labelled illustrations and an existing model render. Repository publication is separate from these checks and does not deploy the hosted service.

Dependencies are not included inside the delivered ZIPs. Run npm run setup after installing a supported Node runtime, and install requirements.txt in a Python environment when using the Python backend/tests.
