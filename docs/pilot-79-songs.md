# Pilot: 79-song singer catalog (spec §13)

Automated as `apps/api/test/catalog79.e2e-spec.ts` (runs in CI). Uses synthetic data only.

1. Sign up a new organization (consent checkbox).
2. Import a 79-row CSV with Hindi + English titles and a Devanagari filename → preview shows 79 valid → commit.
3. Create one consolidated ASSIGNMENT agreement (singer → label) covering all 79 recordings.
4. Render Hindi agreement, Hindi Annexure-A (79 rows, page breaks) and a consolidated NOC (when Chromium is available).
5. Send for signature, upload the signed copy (mixed-language filename), mark EXECUTED → Annexure snapshot locked with 79 items.
6. Generate a verification package for a recording → the signed agreement is included with matching SHA-256, every manifest hash is valid, and `NO_EXECUTED_AGREEMENT` is not raised; remaining warnings (e.g. not registered) are shown.

Manual run on staging: same steps through the UI — Imports → Agreements → wizard → Render → Upload signed → Mark executed → Packages → Generate.
