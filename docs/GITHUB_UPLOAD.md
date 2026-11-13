# Publish the prepared source to DVA-Code/iGrid

Target: https://github.com/DVA-Code/iGrid

The target repository was inspected on 13 November 2026. Its default branch is `main`, and the initial commit contains an MIT `LICENSE`. The system source can be added while preserving that commit and licence. The steps below describe how to publish subsequent updates from the public source package; always inspect the latest remote state first.

## Recommended: Git in a separate working copy

1. Download/extract GML_GitHub_Ready.zip outside your live development folder. It contains iGrid/ with README.md, source, diagrams, dependency manifests and configuration examples. It does not include passwords, actual serials or history.
2. Clone the target repository into a separate folder:

```powershell
git clone https://github.com/DVA-Code/iGrid.git iGrid-publish
cd iGrid-publish
git checkout -b add-research-platform
```

3. Copy the **contents** of the extracted iGrid folder into iGrid-publish. Compare files before replacing anything already in the repository. Do not copy a .git folder from another project; the prepared ZIP has none. If the remote already contains a different app layout, merge deliberately rather than overwriting it wholesale.
4. Inspect and commit only the intended changes:

```powershell
git status --short
git add .
git diff --cached --stat
git diff --cached --name-only
```

The staged files must not include server/.env, server/meters.json, .runtime, database files, local logs or dependency folders. Review the content diff privately. A .gitignore rule does not remove already-tracked sensitive files from repository history. If a secret was published, rotate it and address the history separately.

```powershell
git commit -m "Add GML research console and developer documentation"
git push -u origin add-research-platform
```

Open a pull request into the repository's actual default branch and review it. Do not force-push or assume the default branch is named main. If Git reports an existing branch with this name, choose a new descriptive branch name. If the repository is private or access is denied, sign in through the organization's approved GitHub authentication method; do not paste a token into a command or README.

## Browser upload alternative

Open the repository, choose Add file > Upload files, and upload the extracted source contents rather than the ZIP file itself. Include .gitignore and both package lockfiles. Use a new branch for review. Git is preferable for many files or larger assets because browser limits may require batching. Do not upload the developer/hosting ZIPs as public source.

## After publication

- Confirm README images and Mermaid diagrams render.
- Confirm softwaredetails.md, CPANEL.md and technical-report links open.
- Clone into a new directory, run npm run setup, and build with npm run build.
- Configure the private registry and MQTT credentials locally only if authorized.
- Remember that repository publication is not deployment. GitHub Pages cannot run the Python collector/SQLite backend; use the cPanel hosting procedure or another approved server.

The repository's existing MIT licence is preserved in [LICENSE](../LICENSE). Third-party dependencies and supplied research, logo and portrait assets retain their respective rights and notices.
