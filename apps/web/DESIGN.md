---
name: Dental Records
description: Black-and-white patient records for small dental clinics, built around a 3D chart of the teeth.
colors:
  ink: "#0a0a0a"
  paper: "#ffffff"
  mist: "#f5f5f5"
  hairline: "#e5e5e5"
  rule: "#d4d4d4"
  ash: "#a1a1a1"
  stone: "#737373"
  graphite: "#525252"
  charcoal: "#404040"
  soot: "#262626"
typography:
  display:
    fontFamily: "Schibsted Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(3rem, 7.4vw, 6rem)"
    fontWeight: 700
    lineHeight: 0.94
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "Schibsted Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2.25rem, 4.6vw, 3.75rem)"
    fontWeight: 700
    lineHeight: 1.02
    letterSpacing: "-0.03em"
  title:
    fontFamily: "Schibsted Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 700
    letterSpacing: "-0.02em"
  lead:
    fontFamily: "Schibsted Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.75
  body:
    fontFamily: "Schibsted Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Schibsted Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
  micro:
    fontFamily: "Schibsted Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 400
  numerals:
    fontFamily: "Schibsted Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    fontFeature: "tnum"
rounded:
  sm: "4px"
  md: "6px"
spacing:
  gutter-phone: "20px"
  gutter: "40px"
  section: "96px"
  section-wide: "128px"
  container: "72rem"
components:
  button-on-dark:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 24px"
    height: "48px"
  button-on-dark-hover:
    backgroundColor: "#e5e5e5"
  button-on-light:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.md}"
    padding: "0 24px"
    height: "48px"
  button-on-light-hover:
    backgroundColor: "{colors.soot}"
  button-outline:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "32px"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "44px"
  alert-error:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.md}"
    padding: "12px 14px"
  notice:
    backgroundColor: "{colors.mist}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "12px 14px"
---

# Design System: Dental Records

## Overview

**Creative North Star: "The Lightbox"**

A dentist reads teeth on a lightbox: black film, white light, nothing else. The interface works the same way. Black and white carry everything, real black-and-white photographs of dental work are the backgrounds, and the dental chart is the only place colour appears, because there colour means something: the condition of a tooth.

It is modern and quiet rather than clinical-cold: one confident grotesk at large sizes, generous space, and 1px hairlines instead of boxes. Pages alternate black and white sections, so the scroll reads like turning film over a light. Working screens (sign-in, the app) keep the same palette with denser, plainer layouts.

**Key Characteristics:**
- Black, white and neutral greys only; colour lives inside the dental chart.
- Black-and-white photography under black gradients, never tinted.
- One family, Schibsted Grotesk, self-hosted; bold and tight at display sizes.
- Hairline rules group content; no cards, no shadows.
- FDI tooth numbers are the recurring graphic.

## Colors

A strictly achromatic palette, from ink to paper, with the dental chart's condition colours as the single, meaningful exception.

### Neutral
- **Ink** (`ink`): page and section backgrounds in dark sections, primary text on white, the primary button on white, and the error box.
- **Paper** (`paper`): white sections, the sign-in panel, text on black, the primary button on black and photos.
- **Mist** (`mist`): information notices and quiet hover fills on white.
- **Hairline** (`hairline`): 1px dividers between rows on white, the app header's bottom border.
- **Rule** (`rule`): input and outlined-button borders.
- **Ash** (`ash`): captions on black.
- **Stone** (`stone`): small print and secondary labels on white.
- **Graphite** (`graphite`): supporting paragraphs on white.
- **Charcoal** (`charcoal`): quiet inline controls such as Show/Hide.
- **Soot** (`soot`): hover state of the black button.

On black, secondary text uses white at reduced opacity (80 to 85%) or neutral-300, never a coloured tint.

### Named Rules
**The No-Hue Rule.** The interface has no accent colour. The only hues are the dental chart's condition colours (healthy, decayed, filled, crown, root canal, implant, missing, extracted), and they appear only in the chart, its number strip, its panel's dots and its legend.

**The Darkroom Rule.** Photographs are shown in black and white (downloaded desaturated), under black gradients where text sits on them. Never tint a photo or put colour text on one.

## Typography

**Display Font:** Schibsted Grotesk (with ui-sans-serif, system-ui)
**Body Font:** Schibsted Grotesk
**Label/Mono Font:** Schibsted Grotesk with tabular numerals for tooth numbers

**Character:** A newspaper grotesk with weight and a slightly condensed bite: it holds a two-line headline at 6rem without shouting, and stays plain at 16px in a form.

### Hierarchy
- **Display** (700, clamp 3 to 6rem, 0.94): the landing hero headline only.
- **Headline** (700, clamp 2.25 to 3.75rem, 1.02): section headings on the landing page.
- **Title** (700, 1.875rem): the heading of a working screen, such as Sign in.
- **Lead** (400, 1.125rem, 1.75): the paragraph under a headline; at most about 42rem wide.
- **Body** (400, 1rem, 1.5): everything else.
- **Label** (600, 0.875rem): form labels and list group names; nav links use 500.
- **Micro** (400, 0.6875rem): calendar furniture only: the hour labels down the time grid and the weekday letters of the small month. Never for content.

### Named Rules
**The One Family Rule.** Every word is Schibsted Grotesk. Hierarchy comes from size and weight, never from a second face, italics or letter-spaced capitals.

## Layout

Content sits in a 72rem container with 20px side gutters on phones and 40px from 640px up. Landing sections are separated by 96px of padding (128px from 640px). Two-column sections (heading beside a list) collapse to one column below 1024px.

The staff app is a **workspace**, like a mail client: a 15rem film-black sidebar down the left, and the white work area beside it, lit like the lightbox. The work area is a 56px top bar (search and Book appointment) over the page, which scrolls on its own. Patients, Requests and Staff are list-and-detail split views (`components/SplitView.tsx`) that fill the work area; the calendar and the dental chart fill it edge to edge; every other page (Today, forms, records, settings, the activity log) sits in the 72rem `Page` column. Below 1024px the sidebar goes: the top bar carries a menu button that opens the same sidebar as a drawer.

The sign-in screen is split from 1024px: the photograph fills the left and a 28rem white panel holds the form, the same arrangement as the app (chart stage left, tooth panel right). Below 1024px the photograph becomes a 160 to 208px band across the top.

The landing hero fills the first screen (`100svh`), with the navigation over the top of the photograph and the headline anchored to the bottom.

## Elevation & Depth

Flat. There are no shadows anywhere. Depth comes from the photographs, from black sections against white ones, and from gradients that darken a photo where text sits.

### Named Rules
**The Hairline Rule.** Group content with 1px rules (hairline on white, white at 25% on black), never with boxes, cards or shadows.

## Shapes

Small, firm corners: 6px on buttons, inputs, alerts and notices; 4px on the small inline Show/Hide control. Images are full-bleed or unframed. Rules run the full width of their column.

## Components

### Buttons
- **Shape:** gently squared (6px).
- **On dark** (white fill, ink text, 48px tall, 24px sides; 40px in the nav): the main action over photos and black sections. Hover lightens to neutral grey.
- **On light** (ink fill, white text): the main action on white, including Sign in. Hover goes to soot; disabled fades to 70% with a wait cursor.
- **Outline** (white, rule border, ink text): quiet actions such as Sign out; the border darkens to ink on hover.
- **Focus:** a 2px outline, 2px offset, in the button's contrast colour (white on dark, ink on light). The outline colour is set permanently so it never fades in from another colour.

### Inputs / Fields
- **Style:** white, 1px rule border, 6px corners, 44px tall.
- **Hover / Focus:** the border darkens on hover; on focus it turns ink with a soft ink ring (10% opacity, 3px).
- **Error:** the form shows an inverted alert below the fields; fields stay editable while signing in.

### Alerts and notices
- **Error** (ink box, white text, alert icon): inverted, not red. Errors name the problem and what to do.
- **Notice** (mist box, ink text, info icon): neutral information, such as a session that ended.

- **Field error:** the box gets a 2px ink border and a short line under it with the alert icon ("Enter a first name."). A summary alert above the form says something needs fixing, and the cursor moves to the first field to fix.

### Navigation
- Over the hero photograph: the wordmark left; text links (500, white at 80%, white on hover) and a white Sign in button right. Text links hide on phones; the button stays.
- **The sidebar** (staff app, from 1024px): 15rem of film-black (ink), full height. At the top, the clinic's initials in a 40px white square beside the clinic's name (semibold, white) and the product name small in neutral-500. Then the white Book appointment button, the main places as 40px rows of icon and label (Today, Schedule, Requests with a white count pill, Patients), an Admin group for admins (Staff, Clinic settings, Activity log), a white 10% hairline, and a small month for jumping to any day (today a white disc, the day the schedule shows a white ring; picking a day opens it in the schedule, keeping its view). The current page gets a white 12% fill; the others are neutral-400, brightening to white with a 6% fill on hover. At the foot, the signed-in person (initials, name, role · Account, a link to Account) and an outlined Sign out; if signing out fails, a line above the button says so.
- **Phones (below 1024px):** no sidebar. The top bar holds the menu button (a black dot on it while requests wait), the clinic name, a search icon that turns the whole bar into the search box with a back arrow, and a black + to book. The menu opens as a `<dialog>` drawer from the left (200ms ease-out slide) that keeps focus inside and closes on Escape: the same sidebar, with a close button top right.
- There is one Schedule for everyone: a dentist's calendar simply opens on their own appointments, and the dentist list on the calendar switches to everyone. The calendar's title is also its date picker: clicking it (a chevron says so) drops a small month under it in a white box with an ink border (today an ink disc, the shown day an ink ring).

### Today
The home page (`/app`) for the front desk, in the `Page` column. A greeting with the person's first name, then the date ("Sunday, November 8"), the clinic's hours and whether it's open now. A strip of three figures between hairlines, separated by hairlines: today's appointments (how many are still to come and the next time), requests waiting (how many are overdue; a link to Requests) and tomorrow's bookings (a link to that day). On phones the three sit side by side, smaller, without their detail lines. Below, two columns from 1024px: **Today's appointments**, a time-ordered agenda under an ink rule (start and end time, the patient as a link, reason and dentist, a solid Request pill, an outline "In the chair" pill while it's happening) with a 2px ink "Now" line between what's done and what's next and the past rows in neutral-400; and on the right **Waiting requests** (the five most urgent: overdue first, then longest waiting, each a link to the request) and **Tomorrow** (the first four). A dentist's agenda starts on their own appointments with a Mine / Everyone switch. Times use proportional figures: this face's tabular colon is too wide.

### Tables and record details
- **Tables:** column headings in graphite at label size over a 1px ink rule; rows separated by hairlines, a mist fill on hover; the row's name is the link. Less important columns drop out on narrow screens rather than scrolling sideways.
- **Record details:** a heading over a 1px ink rule, then label and value pairs separated by hairlines (labels 11rem wide on larger screens, stacked on phones). Empty values read "Not recorded" in stone.
- **Loading:** skeleton bars in mist where the content will be, never a spinner. Short "Loading…" text appears only if loading takes longer than 400ms.
- **Empty states** say what's missing and what to do next, with the action button when there is one.

#### Patients (list, record, forms)
- **Patients workspace:** Patients is a list beside the open record, not a full-width table. The list column (24 to 27rem, hairline on its right, scrolling on its own) has a compact head: "Patients" with the count in stone and a small black New button, a search box (name or mobile number; debounced, Escape clears, Down arrow moves into the list), then Current / Archived as a segmented control beside a small sort select (Name, Next visit, Last visit). Rows are two lines, no columns: the name as "Last, First" (an Archived pill in that view), then a quiet line with the age and "Today, 10:00 AM", "Tomorrow, …", "Next Tue, Nov 10, 9:00 AM" or "No upcoming visit" (the last visit instead when sorted by it; "· request" when not confirmed). The open patient's row has a mist fill, bold name and `aria-current`; never a coloured or thick left rule. Up and Down move between rows and Enter opens one (moving doesn't open records, because each opening is logged). More rows load as the end comes into view, with a Show more button and "Showing 50 of 142" under the list. Search, sort and view live in the address and every link in the workspace carries them, so opening, editing or registering a patient never resets the list or its scroll. Loading is skeleton rows; empty states say "No patients yet" (Register patient), "No patients match “x”" (Clear search) or "No archived patients"; a failed load is an ink box with Try again. With nobody open, the right side is a calm centred line ("No patient open") with an outlined Register patient. Below 1024px one side shows at a time: the list at `/app/patients`, the record full screen with a Back link that returns to the same search.
- **Record:** the name, then age, sex and birth date, then phone and email on a quiet line; the main actions at the right (Dental chart is the ink button). Under it an at-a-glance band between two hairlines, split in two from 1024px: Next appointment and Last visit on the left, the chart's condition counts (with their colour dots, the one place hue appears outside the chart), the latest entry and Open the chart on the right. Below are ink-rule sections: Appointments (upcoming, then the latest five earlier with Show all), Contact & emergency (only what is recorded; what is missing collapses into one line with an Add link), Record, History (admins).
- **Forms:** four groups under ink rules, a quiet "Required" next to the label instead of an asterisk, hints under phone, email and birth date, the cursor in the first box, a sticky Save / Cancel bar, and an inline "Leave without saving?" in that bar when a link is clicked with unsaved changes. After registering, the new record opens in its place with a mist "Registered." notice offering Book first visit and Register another, and the list beside it refreshes. In the workspace, records and forms sit in pane padding (24px, 40px from 1024px) at a 64rem (record) or 48rem (form) measure, and their grids follow the pane's width (container queries), not the window's. The record's header (name, age, birth date and contact on one quiet line, then Dental chart, Book and Edit) sticks to the top of the pane from 1024px over a hairline; Archive patient moved down to the Record section, asked inline.

### Calendar
The schedule is a calendar like a desktop calendar app, in three views: **Day** (a column per dentist, plus Any dentist for requests that named none, so a gap in a column is that dentist's free time), **Week** (Monday to Sunday) and **Month** (six weeks, Monday first).
- **Time grid:** the clinic's opening hours (Clinic settings) rounded out to whole hours, 7 AM to 8 PM until they load, at 64px an hour, hour lines in hairline grey with a dotted half-hour, hours in micro type down a sticky left column, headings sticky on a 1px ink rule. Today's column has a mist fill; a 2px ink line with a dot marks the current minute.
- **Appointments:** confirmed ones are solid ink blocks with white text, like exposed film; requests are white with a dashed ink outline, because they don't hold the time. Overlaps share the column side by side. The chosen one gets a 2px ink ring.
- **Clicking:** the pointer previews the 15-minute slot under it (a faint ink fill, "+ 9:15 AM"); clicking opens a booking with the day, time and (in Day) dentist filled in, and draws the pending booking as a dashed block. Days that have passed take no clicks. Clicking an appointment opens its details.
- **Dragging:** with a mouse, an appointment moves by dragging (snapping to 15 minutes; in Day, across dentist columns hands it to that dentist) and changes length by dragging its bottom edge. The original stays behind at 30% while a ghost shows where it lands and its new time; where it can't go (a past day, or a confirmed appointment into Any dentist) the ghost turns grey and says "Can't move here". Escape cancels. A drop saves at once, and an ink bar along the bottom says what moved, with Undo; a refused move says why in the same bar and the block returns. Past appointments don't move. On touch screens a press stays a tap, so scrolling isn't hijacked; there, and from the keyboard, Change on the appointment does the same job.
- **Side panel:** bookings and details open in a 25rem panel on the right, never a pop-up, so the calendar stays in view. From 1280px it sits beside the calendar behind a hairline; narrower, it covers the calendar from the right (200ms slide) over a 30% black scrim, full width on phones. Escape or the close button shuts it.
- **Month cells:** the date in a 28px circle (ink disc for today), then up to three lines of dot, short time ("9am") and name, then "2 more". A solid dot is confirmed, a ring is a request. Clicking a day opens it in Day.

### Dental chart
Each patient's chart is its own page, split in two like the sign-in screen: on the left one continuous film-black field (beside the black sidebar, divided from it by a white 10% hairline; the white top bar runs above it) holding the chart's header (back arrow, the patient's name in white, "Dental chart · age" in neutral-400, and the 3D model / Flat chart switch with a white active segment), the 3D model on a soft radial spotlight, and the numbered teeth along its foot; on the right a full-height 26rem white panel. On phones the black field takes the first 88% of the screen and the white panel follows.
- **Colour:** each tooth wears its condition's colour, here and nowhere else; teeth with nothing recorded stay natural white. Missing and extracted teeth are ghosts (25% in 3D, struck-through numbers in the strip). The selected tooth gets a white outline, never a hue of its own.
- **Callout:** choosing a tooth draws a 1px white line from a dot on the tooth (a 2.5px white point in a 7px ring at 50%), slanting to an elbow and running flat into the top rule of a label at the side of the stage: on the tooth's own side, above an upper tooth and below a lower one. The label has no box: the tooth number at 1.5rem bold, its name in neutral-400, the current condition with its colour dot and surfaces, the date and who recorded it, and two lines of the note. The line follows the tooth as the model turns; it draws in over 320ms, then the label fades in (both off with reduced motion). It is drawn over the canvas, not inside the 3D scene. Hidden when the stage is narrower than 560px, where the panel directly below says the same.
- **Number strip:** the FDI chart order (18 to 11 and 21 to 28 over 48 to 41 and 31 to 38) as a 16-column grid of buttons with a white midline, each with a short bar in its condition's colour. It is how keyboard users pick a tooth, and in the **Flat chart** view it is drawn large in place of the model, which is also what computers without 3D get.
- **Panel:** with no tooth chosen, the teeth counted by condition and the latest entries. With a tooth: its number at title size, its name, its current state in a mist box, the finding form (dentists and admins only: conditions as a two-column radio grid with their colour dots, surfaces for decay and fillings, a note, and a tick for today's visit), then its history over an ink rule.
- **History and corrections:** entries are never edited. A wrong one is struck through in stone and stays; its correction sits above it with "Correction:" and the reason, on the same date. Withdrawing an entry shows a dashed empty dot and "Entry withdrawn".

### Confirming an action
A reversible action like Archive asks inline, next to the button ("Archive this patient?" with Archive and Cancel), not in a pop-up dialog.

### Requests, appointment pages and the activity log
**Requests workspace.** Requests is a work queue in the split view: the list on the left, the open request on the right. The list header has the waiting count (and how many are overdue, in bold) and a Waiting / Declined segmented control (kept in the address as `view`). Rows are three quiet lines: the patient (a solid "Overdue" or "Day passed" pill when the day has passed or it waited over two days), the day, time and dentist or "Any dentist", then "Waiting 2 days" with an outline "Clash" pill when a confirmed booking takes the slot. Overdue rows come first. The open row gets a mist fill and a bold name (aria-current), never a coloured or thick edge; the up and down arrows move through the rows. From 1024px the most urgent request opens by itself, so the pane is never empty while work waits; with nothing waiting the pane shows the black-and-white "No requests waiting" photo. The pane has a sticky header (patient name linking to the record, phone, status pills), the asked-for day at 1.875rem bold with the time and dentist under it, an inverted ink note when it clashes ("Dr. Santos is busy 9:00 – 9:30 AM."), Confirm (ink) and Decline (outline) which open their forms in place, and the request facts over an ink rule. Answering opens the next request, focuses its name and says what was done in a mist notice at the top ("Confirmed: …, See the day"). On phones the list comes first and the pane has a Back link. The appointment page reads top down: patient and status pill, the date and time as the main line, dentist, actions, a two-column details grid, then an Activity timeline from the audit log. The booking forms keep a sticky bar with a plain-words summary and whether the dentist is free (nearest free times as small outlined buttons). The activity log groups lines by day under sticky headings, names the record each line is about as a link, shows edits as "field: old → new", hides routine lookups behind a "Show routine lookups" checkbox, and marks failed sign-ins with a solid pill and sensitive changes with an outline pill.

### Staff workspace
**Staff workspace.** Admins manage accounts in the split view. The list header has "Staff" with the count and an ink Add button; under it the search box, an Active / Deactivated / All segmented control, and role and sort selects, all kept in the address. Rows show a neutral initials circle (ink when open), the name with "(you)" on your own, a quiet line of role and when they last signed in, and outline pills at the right for Locked and Must set a password (a muted pill for Deactivated). The pane opens with a 64px initials circle, the name, email, role and pills; then Details over an ink rule (role, status, last signed in, added on, email); then Manage, one hairline section per action with what it does on the left and its outline button on the right: Name and role (the edit form opens in place), Reset password (an inline question on a faint fill), Unlock only while locked, and Deactivate or Reactivate last, set apart as the quiet danger section, in ink like everything else. Your own account can't change its role or be deactivated, and says why; its password section points to Account. Add opens the add form in the pane (`?add=1`, so it works on phones), and after adding, the new person opens. Refusals from the server (such as "leaves no active admin") appear in an ink box under the question.

### One-time password panel
After adding someone or resetting a password, the temporary password appears at the top of the staff pane (above the list on phones) in a box with a 2px ink border (the one place a heavy border is used), with whom it is for, the password at 1.25rem semibold on a mist fill, a Copy button and "I've shared it". Focus moves into the panel when it appears. It stays until dismissed and is held only in the screen's memory: never in the address, the page title, the cache or the console.

### Settings form
Clinic settings is a record-width form with ink-rule section headings like the patient form: Clinic (name, address, phone, email), Opening hours (two time boxes in 15-minute steps) and Appointments (usual visit length). One Save button; the line beside it, announced politely, says "Saved." or "Nothing changed." and clears when anything is edited. Only changed fields are sent. Refused fields get the heavy border and a line under them, and focus goes to the first.

### Forced password change
An account with a temporary password sees, instead of the app, the sign-in layout with "Choose a new password": current (temporary), new and repeat boxes, each with Show/Hide, a note that the first box takes the temporary password, and a Sign out link. The rules are checked before sending (12 characters or more, the two new boxes match, different from the current one) and failures are ink boxes plus field lines. The same form sits on the Account page for anyone who wants to change their password.

### Tooth numbers (signature)
The FDI chart numbers, 18 to 11 and 21 to 28 over 48 to 41 and 31 to 38, in a 16-column grid with tabular numerals, a vertical rule at the midline and a horizontal rule between the arches. Decorative and hidden from screen readers. On the landing hero, a light passes along them once on load (700ms each, 55ms apart, ease-out), and they stay visible throughout.

### Icons
Line icons drawn for this app on a 20px grid with a 1.75 stroke and round caps (arrows, alert, info). No emoji or glyph icons.

## Do's and Don'ts

### Do:
- **Do** keep every surface black, white or neutral grey; reserve hue for the dental chart's condition colours.
- **Do** desaturate any photograph and darken it with a black gradient where text sits on it.
- **Do** group with 1px hairlines and space; let headings sit on the section, not in a box.
- **Do** use the black button on white and the white button on black, with a matching 2px focus outline.
- **Do** say only what is true: features that don't exist yet go under "Coming next".

### Don't:
- **Don't** add an accent colour, coloured links or red errors; errors are inverted ink boxes.
- **Don't** use cards, drop shadows or glass effects.
- **Don't** add a second typeface or set labels in spaced capitals.
- **Don't** put the 3D chart's code on the landing page; show the black-and-white render instead.
- **Don't** put photographs on working surfaces (calendar, lists, forms, the sidebar). In the staff app they belong only in quiet empty states such as No requests waiting.
- **Don't** alternate black and white bands without a reason. A screen is one split: film-black where pictures and teeth are shown (the sidebar, the chart's stage and its header), white where people read and write.

### Admin and account screens
- **Save bar.** A settings form that edits in place shows a sticky bottom bar (ink rule, "Unsaved changes", Discard, Save) only while something differs from what is saved. Leaving by a link asks inline in the same bar ("Leave without saving?"); the app has no data router, so `features/clinic/useLeaveGuard.ts` catches link clicks and tab close. Swapped button sets need distinct `key`s so a submit button is never reused as a plain one.
- **Status as Pill.** In staff lists a normal account is quiet text; Deactivated is a muted Pill; Locked and Must set a password are outline Pills. Filters (search, Active/Deactivated/All segmented control, role) and the sort live in the URL.
- **Recent sign-ins.** The Account page lists your own last ten sign-ins, failed attempts and password changes (GET /auth/my-activity) so a stranger on a shared computer can be spotted.
