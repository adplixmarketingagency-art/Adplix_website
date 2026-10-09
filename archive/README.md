# Preserved reference material

- `original-media/`: original supplied photos, films and the agency reference document. Preserved rather than deleted; production uses the optimised assets in `assets/`.
- `legacy-site/`: the retired vanilla marketing implementation and its old design specification. The current site entry is `src/main.jsx`; the portal entry is `portal/main.js`.

Nothing in this directory is imported by the active application or copied to Cloudflare. It is excluded from lint/format checks because it is historical reference, not maintained application code.

Generated builds, local databases, account bootstrap SQL and test screenshots must not be added here. They belong in ignored output/private runtime directories.
