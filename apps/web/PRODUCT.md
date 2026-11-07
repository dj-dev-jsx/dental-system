# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
- **Clinic staff** at small dental clinics in the Philippines: the clinic admin (often the owner-dentist), dentists, receptionists and dental assistants. They often share front-desk computers, and work with modest hardware and internet connections. Assistants register and update patients as well as look them up.
- **Patients** of that clinic, who visit its website to book an appointment and create their own account while booking.

## Product Purpose
Patient records, appointments, online booking and billing for small dental clinics, built around an interactive 3D dental chart where each tooth carries its status and history. A personal project now, intended to be sold to real clinics one at a time: each clinic gets its own installation and website, from the same code with small per-clinic adjustments.

## Positioning
The dental chart is the centre of the product: a realistic, clickable 3D model of the patient's teeth (FDI numbering) rather than a form or a flat grid.

## Operating Context
- One installation per clinic: its public pages are that clinic's own website for patients. The database still separates clinics (useful for clinics with several branches), enforced by the database, not just the code.
- Patients book online: they create an account while booking, confirm it through an emailed link, and the booking is a request that clinic staff confirm or move. Signed-in patients see only their own appointments.
- Patient accounts and staff accounts are separate kinds of login.
- Shared computers: sessions end on logout and expire after 12 hours; patient pages are not cached by the browser.
- Health data is sensitive personal information under the Data Privacy Act of 2012 (RA 10173).

## Capabilities and Constraints
- Interface language: English only.
- Modest devices: the 3D chart needs a 2D fallback, and errors need clear retry messages. Full offline use is not planned.
- Billing records payments and prints statements marked "not an official invoice"; official BIR invoicing is out of scope for now.
- The software records what the dentist decides. It does not suggest treatments.
- Product name: undecided. Use the working name "Dental Records", kept in one place so it is easy to replace. On a clinic's installation, patients should see the clinic's own name.
- Per-clinic differences (name, logo, address, hours, services) are settings, not separate copies of the code.

## Evidence on Hand
No real clinics, customers, testimonials or logos yet. All data is fake until a security review; never invent customers or claims.

## Product Principles
- Patient privacy first: when unsure, show less and log who looked.
- Fast and calm for front-desk work: the common task should take the fewest steps.
- Works on the hardware and internet clinics actually have.
- The dentist stays in charge of clinical decisions.
