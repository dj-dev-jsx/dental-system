# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
- **Clinic staff** at the clinic, a small dental clinic in the Philippines: the clinic admin (often the owner-dentist), dentists, receptionists and dental assistants. They often share front-desk computers, and work with modest hardware and internet connections. Assistants register and update patients as well as look them up.
- **Patients** of the clinic, who visit its website to book an appointment and create their own account while booking.

## Product Purpose
The website, online booking, patient records, appointments and billing of a single clinic, built around an interactive 3D dental chart where each tooth carries its status and history. The system is for this one clinic only: there are no other clinics, installations or tenants.

## Positioning
The dental chart is the centre of the product: a realistic, clickable 3D model of the patient's teeth (FDI numbering) rather than a form or a flat grid.

## Operating Context
- One clinic: the public pages at the root of the site (`/`, `/book`, `/appointments`…) are the clinic's own website for patients, and staff work under `/app`. There are no clinic web addresses (slugs) or clinic lists.
- Patients book online: they create an account while booking, confirm it through an emailed link, and the booking is a request that clinic staff confirm or move. Signed-in patients see only their own appointments.
- Patient accounts and staff accounts are separate kinds of login.
- Shared computers: sessions end on logout and expire after 12 hours; patient pages are not cached by the browser.
- Health data is sensitive personal information under the Data Privacy Act of 2012 (RA 10173).

## Capabilities and Constraints
- Interface language: English only.
- Modest devices: the 3D chart needs a 2D fallback, and errors need clear retry messages. Full offline use is not planned.
- Billing records payments and prints statements marked "not an official invoice"; official BIR invoicing is out of scope for now.
- The software records what the dentist decides. It does not suggest treatments.
- Name: the working name is "Dental Records" (`PRODUCT_NAME` in `src/config.ts`, one place to change); the clinic's own name, which patients see on the website comes from the clinic's settings.
- The clinic's details (name, address, phone, hours, online booking on/off) are settings staff can change.

## Evidence on Hand
No reviews, testimonials, services list or photos of the clinic yet. All data is fake until a security review; never invent customers or claims.

## Product Principles
- Patient privacy first: when unsure, show less and log who looked.
- Fast and calm for front-desk work: the common task should take the fewest steps.
- Works on the hardware and internet the clinic actually has.
- The dentist stays in charge of clinical decisions.
