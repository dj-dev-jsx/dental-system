---
version: 1
slug: "src-pages-landingpage-tsx"
primary_target: "src/pages/LandingPage.tsx"
related_targets: ["src/features/auth/LoginScreen.tsx"]
---

# Landing and sign-in

Scope: `/` landing page (Persuade) and `/sign-in` (Operate), plus the signed-in shell's colours.
Audience: owners of small Philippine dental clinics deciding whether to use the product; clinic staff who sign in.
Action: Sign in (staff). For owners: understand what it does today, and what is coming next.
Proof: the product's own 3D teeth render; the privacy protections that really exist (database-enforced clinic separation, audit log with old and new values, 12-hour sessions). No customers, prices or availability claims: the product is in development.
Constraints: black and white only (user-pinned), real dental photography as the background, modest internet (photos sized per screen, chart code never loaded on the landing page).

## Direction contract

THESIS: The page is a lightbox. A real black-and-white photograph of a dentist reading tooth records is the ground, and the offer is set into its dark lower field. It refuses the centred headline over a row of feature cards.

OWN-WORLD: Pure black #0a0a0a and white, neutral greys only, no accent hue. One self-hosted family, Schibsted Grotesk: display at weight 650 to 700 with tight tracking, body at 400. Hairline 1px rules instead of boxes. FDI tooth-number notation (18 to 11 | 21 to 28 over 48 to 41 | 31 to 38) is the recurring graphic. Rectangular controls with small radii: white on black, black on white.

STORY: An owner learns in one line what it is (records built around a 3D chart), sees the real chart, reads what works today against what comes next, sees how health data is protected, and staff sign in.

FIRST VIEWPORT: Full-bleed lightbox photograph, X-ray films in the upper half. The nav sits over the photo: wordmark left, The chart and Privacy links, then a white Sign in button right. The headline, about 5rem, white, two lines, sits bottom-left over a black gradient, with one supporting sentence and the primary Sign in plus See the chart. Across the bottom edge runs the FDI upper-arch strip with its midline.

FORM: User-pinned direction (black and white, dental photo background, modern); no roll. seed: none (unavailable)

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
