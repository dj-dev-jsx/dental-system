---
name: Dental Records
description: Black-and-white website, online booking and patient records for a single dental clinic, built around a 3D chart of the teeth.
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
- **Display** (700, clamp 3 to 6rem, 0.94): the home page's clinic name only.
- **Headline** (700, clamp 2.25 to 3.75rem, 1.02): large section headings (rare; the home page uses 1.5rem section headings).
- **Title** (700, 1.875rem): the heading of a working screen, such as Sign in.
- **Lead** (400, 1.125rem, 1.75): the paragraph under a headline; at most about 42rem wide.
- **Body** (400, 1rem, 1.5): everything else.
- **Label** (600, 0.875rem): form labels and list group names; nav links use 500.
- **Micro** (400, 0.6875rem): calendar furniture only: the hour labels down the time grid and the weekday letters of the small month. Never for content.

### Named Rules
**The One Family Rule.** Every word is Schibsted Grotesk. Hierarchy comes from size and weight, never from a second face, italics or letter-spaced capitals.

## Layout

Content sits in a 72rem container with 20px side gutters on phones and 40px from 640px up. Home page sections are separated by 64px of padding (96px from 640px). Two-column sections (heading beside a list) collapse to one column below 1024px.

The staff app is a **workspace**, like a mail client: a 15rem film-black sidebar down the left, and the white work area beside it, lit like the lightbox. The work area is a 56px top bar (search and Book appointment) over the page, which scrolls on its own. Patients, Requests and Staff are list-and-detail split views (`components/SplitView.tsx`) that fill the work area; the calendar and the dental chart fill it edge to edge; every other page (Today, forms, records, settings, the activity log) sits in the 72rem `Page` column. Below 1024px the sidebar goes: the top bar carries a menu button that opens the same sidebar as a drawer.

The sign-in screen is split from 1024px: the photograph fills the left (product name with a small white dot top left, the privacy note at the foot) and a 32rem white panel holds the form, the same arrangement as the app (chart stage left, tooth panel right). Below 1024px the photograph becomes a 192 to 240px band across the top and the white panel rises over its lower edge as a sheet with 24px top corners. The form: 48px boxes with 12px corners and a line icon inside on the left (mail, lock), an ink border and soft grey ring on focus, an eye button for Show/Hide (aria-label "Show password", aria-pressed), errors as ink boxes, a full-width ink Sign in button, then the patients' forgot-password line and a bordered "New patient?" box with an outlined Book an appointment. ChangePasswordScreen and the unreachable screen use the same frame.

The home page's hero is a film-black band over the dimmed x-ray lightbox photograph, with the header across its top and the clinic's name below.

## Elevation & Depth

Flat. There are no shadows anywhere. Depth comes from the photographs, from black sections against white ones, and from gradients that darken a photo where text sits.

### Named Rules
**The Hairline Rule.** Group content with 1px rules (hairline on white, white at 25% on black), never with boxes, cards or shadows. Exception: the patient pages and sign-in (see Patient pages) use bordered, softly rounded cards for choices, tickets and appointments, still without shadows apart from the account switch's thumb.

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

### 3D scans
Each patient has a page of 3D scans (`/app/patients/:id/scans/:scanId?`), the files an intraoral scanner exports (STL, PLY or OBJ, up to 150 MB). It is split like the dental chart: a film-black stage on the left (header with back arrow, the patient's name and "3D scans · count"; an Upload scan button in white for dentists and admins) and a 26rem white panel on the right. The panel holds the list of scans (title, date, a muted format pill, size, "Uploaded by", an outline Withdrawn pill; the open one has a mist fill and bold title, `aria-current`) in a scrolling block, then the open scan's details: title, scan date, the note, file name, format and size, who uploaded it and when, and for dentists and admins "Withdraw…", asked inline in a mist box with a required reason. A withdrawn scan shows its reason in a mist box; only admins can still open it, everyone else sees a calm "This scan was withdrawn" on the stage. A privacy line closes the panel: scan files are patient health data, only staff can open them, and every open is logged. The page, its three.js loaders and its parsing worker are one lazy chunk, loaded only when the page opens.
- **Stage:** the same soft radial spotlight as the chart. The scan is centred and scaled to fit, lit by a light that travels with the camera plus a soft sky and fill light so the shape reads from every side, in neutral light grey. A file whose vertex colours are one flat colour (some OBJ exporters write grey everywhere) is shown as if it had none. It draws only when something changes, caps its resolution, and turns at a lower resolution while moving when the scan has over 1.5 million triangles, with a quiet note saying so. Controls are one row of outlined buttons along the foot, ink on a 70% black fill, with only the essentials showing: In skull / Scan only (white active segment, once the teeth are checked), Hide gums (white when on), Reset view, More, and Full screen at the right. More opens a small menu upward (Esc or a click outside closes it; toggles keep it open, actions close it): Tooth numbers and Shade by condition (ticks), Adjust gum line…, Fix numbers, Find the teeth again and Mark teeth by hand (dentists and admins), then Wireframe and Scanner colours (only when the file has colours). Drag turns, scroll or pinch zooms, right-drag or two fingers move. Reset view faces the biting surfaces, front teeth at the top, once the teeth are known.
- **Loading:** "Opening the scan…" with a 4px white bar and "12 MB of 48 MB", then "Preparing the 3D model…" while the file is read in a worker so the page stays responsive. Failures are calm centred messages with the file name and, where retrying can help, a white Try again: the download dropped, "This file couldn't be opened", the 3D view stopped. A computer without 3D shows the file name, format and size with a note instead.
- **Compare:** "Compare with" (a select) puts a second scan beside the first (below it on phones), each captioned with its title and date, with a Sync views tick (on by default) that makes the two cameras follow each other. Both scans are scaled the same way, so matching views line up.
- **Checking the teeth (automatic):** a scan nobody has checked is read by the tooth detector as soon as it opens for a dentist or admin ("Finding the teeth…", a few hundred milliseconds), and the scan turns to face its biting surfaces, set a little back and low on the stage so the banner covers no tooth. One banner over the stage (95% black, hairline border, announced politely) reads the detector's confidences: when it is sure (overall 0.6 or more and the arch 0.9 or more) "Found 14 teeth on the upper arch. Looks right?"; otherwise "… Please check these teeth." with its notes; when unsure of the arch (under 0.75) "Found 8 teeth. Is this the upper or lower arch?". An Upper / Lower switch is always there (the detector can be confidently wrong about the arch); switching runs it again for that arch. Teeth under 0.7, and those the notes name, are listed ("Check 17 and 27: not sure of those.") and their discs are dark with a dashed white ring; under 0.3 the disc is a hollow dashed suggestion. Discs never overlap: where teeth crowd on screen (end-on, from the front) a disc moves out on a thin white leader line. Looks right (white) saves the teeth and opens the scan in the skull with its gums hidden, and saves that as the scan's view for everyone: upload plus one click. Fix numbers turns the discs draggable (drag a number to move it). Tapping a number opens a compact picker in the banner, "Tooth 24 is really…": the likely numbers first (one and two places either way, each with what else it changes: "also 25 → 24" or "and the 4 teeth beyond"; "No room" when it would run off the arch or push teeth across the midline), then One tooth with 26 (offered first when two neighbouring numbers sit much closer than their tooth sizes allow, judged against the scan's own spacing: a molar counted twice; it keeps the tapped number, in the middle of the two), Not a tooth, Missing here (this number is missing, so this tooth and those beyond it are each one further along), This side −1 / +1 (a run counted one place off from the start), Other… (the 32-number grid) and Back. Changing one number moves the teeth beyond it on that side the same way, in arch order and without duplicates. Pointing at (or keyboard-focusing) an option previews it on the discs (changed ones ringed), and a click applies it with "24 → 23, 25 → 24." in the banner and one Undo. Add tooth picks a number then a tap places it; Cancel; Done saves, as Looks right does. Tapping a disc in the banner's view opens fixing with that tooth chosen, so an off-by-one run or a split molar is two clicks (the disc, the fix) plus Done. Later (Cancel when the teeth were already checked) closes the banner. When nothing is found: "No teeth found on this scan." with Mark teeth by hand and Later. Pins are saved in the file's own coordinates, as a whole set; the audit log keeps who changed which teeth.
- **Marking teeth by hand (fallback):** from More, the old step-by-step marking: a bar at the top says "Click the middle of tooth 16" ("Tap" on touch screens), suggesting numbers in arch order with an Upper / Lower / Both segment, Skip, Undo, Choose number, Cancel and Save teeth, and a "Marking teeth" list in the white panel. Esc closes the grid, then cancels; unsaved pins ask "Discard the changes to the teeth?" inline.
- **Clicking a tooth:** once checked, clicking anywhere on the surface picks the tooth whose pin is nearest (within 1.25 times the usual distance between neighbouring pins); in the skull, clicking a standard tooth picks that tooth (it brightens). The scan dims to grey and the picked tooth's part turns white; the chart's callout with its leader line points at it, and the white panel shows the same tooth view as the chart (state, Record a finding for dentists and admins, history and corrections), with "Back to the scan". Findings go to the chart, by tooth number. Tooth numbers are small dark discs (on by default); Shade by condition colours each tooth's part of the surface with the chart's condition colours. Scans over 1.5 million triangles are never shaded (a note says so); clicking still works. The list says "Teeth checked: 14" or "Teeth not checked yet"; reception sees an unchecked scan on its own with "Teeth not checked yet" and no check or fix controls.
- **In skull:** the scan placed in the chart's faint standard skull, and the skull made to fit the scan, never the scan to the skull (it keeps its true millimetres and shape). First a rigid fit: a best-fit turn, shift and one uniform scale takes each pin onto the same standard tooth's biting point (Horn's method, weighted), steadied for partial scans by two priors: the jaw's gum-to-biting direction must match the model's (the normal of the plane through the pins when they spread across the arch, else the detector's, else the scan's own surface around the back teeth), and, for a short segment on one side, the scale is held near 1 (both are millimetres); once the pins reach round the arch (a canine or further back on both sides) the scale is left nearly free. Two pins on one jaw are enough. The fit is robust: a real arch differs from the standard one smoothly, so a pin that misses its tooth by over 5 mm more than its neighbours along the arch (7.5 mm for the last tooth of a row) is taken for a wrong number, left out of the fit and the bend (keeping at least half), and named in the note. Then the whole arch (`viewer/warp.ts`, arch form): the standard arch is made as wide (across the face) and as deep (front to back, about the front teeth) as the patient's, from the pins, each drawn toward the standard's (400 mm²) and kept within 0.8 to 1.25, plus a shift, then matched along the arch: each pinned tooth's remaining offset is set at its distance along the standard arch from the midline (arc length, read by projecting onto the arch seen from above, so the back teeth, where the arch runs front to back, come out right), smoothed over about a molar and a half, and past the last pin carried on at half the last trend for up to 25 mm, so a V-shaped or square arch doesn't leave its last tooth's offset on every tooth beyond; it applies in full within 25 mm of any tooth of either jaw and fades out by 70 mm, so both jaws, both gums, both standard arches and the lower face follow the patient's arch (the other arch keeps the normal bite: upper front teeth in front of the lower, lower back teeth inside the upper) while the top of the skull keeps its shape; standard teeth past the last scanned tooth carry on along that arch. Then a local bend for the last millimetres: a normalised Gaussian radial basis field (σ 4 mm, solved once, ≤ about 100 control points, smoothed if it would swing) moves each pinned tooth's biting point exactly onto its pin and its gum line with it, and the other jaw's teeth by the same shift across the arch (not up or down, so the bite stays). The local bend applies at full strength within 14 mm of a control point and fades out by 36 mm, so it reaches the jaw bone, the standard gums and the standard teeth but leaves the cranium as it is. It is worked out once when the pins change (typed arrays, normals recomputed), never while turning. Teeth are decided one by one: a standard tooth is left out where the scan has that tooth (pinned, or the scan's surface reaches its biting point) and where the chart says it is missing or extracted; a standard tooth is also left out where its crown would sit in scanned surface (15% of its crown within 1.2 mm of the scan), and between two scanned teeth always (the scan shows that stretch of the arch: with no tooth there, the patient has none, gap or closed space). Every other tooth is drawn as the chart's own tooth (same solid material, a touch dimmer than the scan), so a partial scan sits in a complete arch and the other jaw looks as it does on the chart. Both standard gums are exactly the chart's (shape, colours, fade and material), drawn after the faint bone as on the chart so the bone shows through their faded top. A small corner note (70% black): "Fitted to 12 teeth · 0.0 mm off", "Scanned: 17–14, 11–23. Other teeth are standard models.", and in 11px grey "Illustration, not the patient's bone. Roots not shown."; a rough fit (pins over 4 mm from their teeth on average, or an implausible size) says "Check the numbers: tooth 26 is far from where it belongs." and "Left out of the fit until fixed." with Fix numbers, and under 4 pins "Few teeth: the skull's angle is approximate." Reset view looks at the skull exactly as the chart page's camera does (closer on a phone), so the view reads as the chart with the patient's real crowns in it. A scan nobody set a view for opens in the skull with the gums hidden once it can be placed.
- **Hide the gums:** display only (the file is never changed). In the skull and on its own, the scan is cut tooth by tooth to match the standard gum: each point belongs to its nearest tooth, is taken into that standard tooth's own frame (where the bend put it), kept from 0.2 mm above the tooth's neck (the standard gum's edge is 0.5 mm above it, so the crown runs just under the gum: no gap, no gum poking through), and near the neck anything beyond the crown's outline toward the cheek or tongue is dropped (higher up, to two thirds of the crown, anything well beyond its fullest outline). Behind the last tooth of a row and beside a gap (a missing tooth either side) the gum ridge goes at any height. Each tooth's neck height comes from the scan's own shape (where the cheek side's steep gum flare ends), unless the detector's neck point (stored with the pin) disagrees by over 1.75 mm, when the neck point wins: it also finds the margin of a short, prepared tooth (up to 8.5 mm below the standard neck). The standard gum line moves to the same height, so there is no step at the gum line. Once the slider rests, a tidy pass (in the worker) welds the copies of each corner that an STL repeats per triangle (a spatial hash on the coordinates), trims triangles hanging by one edge, drops loose pieces under 8 mm², and smooths the cut edge for display (Taubin, at most 0.35 mm). In the skull the last 2.4 mm of each cut crown blends into the gum's colour. Adjust gum line… (More) opens a slider in the corner panel, Less tooth to More tooth, 4 mm either way of the standard gum line; letting go moves the standard gum line with it and bends the model again. A colour scan can find the gums By colour instead (pink, by CIE Lab a*), with its own slider. The per-point work runs once in a worker; the slider only re-filters triangles, so it moves live. A dentist's or admin's changes (view, gums, slider on release) become the scan's view for everyone, saved quietly a moment after the last change; others' changes are for themselves only.
- **Phones:** the list becomes a select above the stage; the white panel with the details follows the stage. While uploading, the stage is hidden so the form is first.
- **Upload:** a form in the white panel: a dashed drop zone with Choose file (or the chosen file's name, format and size), Title with suggestion chips (Upper arch, Lower arch, Both arches, Bite), Scan date (today by default, not later), an optional Note with a count, the privacy line, then Upload scan and Cancel. Mistakes are named under the field (heavy ink border, like the other forms): a wrong extension, an empty file, one over 150 MB, a missing title. While sending, a bar shows MB sent of the total and Cancel upload replaces the buttons; refusals from the server (damaged file, too large, too many uploads, archived patient) appear in an ink box. A successful upload opens the new scan.
- **Patient record:** a "3D scans" section between Appointments and Contact: the latest scan's title, date and how many (withdrawn ones counted apart), Open scans and, for dentists and admins, Upload scan; with none, a line saying what scans are for. The dental chart's header also links to 3D scans.

### Confirming an action
A reversible action like Archive asks inline, next to the button ("Archive this patient?" with Archive and Cancel), not in a pop-up dialog.

### Requests, appointment pages and the activity log
**Requests workspace.** Requests is a work queue in the split view: the list on the left, the open request on the right. The list header has the waiting count (and how many are overdue, in bold) and a Waiting / Declined segmented control (kept in the address as `view`). Rows are three quiet lines: the patient (a solid "Overdue" or "Day passed" pill when the day has passed or it waited over two days), the day, time and dentist or "Any dentist", then "Waiting 2 days" with an outline "Clash" pill when a confirmed booking takes the slot. Overdue rows come first. The open row gets a mist fill and a bold name (aria-current), never a coloured or thick edge; the up and down arrows move through the rows. From 1024px the most urgent request opens by itself, so the pane is never empty while work waits; with nothing waiting the pane shows the black-and-white "No requests waiting" photo. The pane has a sticky header (patient name linking to the record, phone, status pills), the asked-for day at 1.875rem bold with the time and dentist under it, an inverted ink note when it clashes ("Dr. Santos is busy 9:00 – 9:30 AM."), Confirm (ink) and Decline (outline) which open their forms in place, and the request facts over an ink rule. Answering opens the next request, focuses its name and says what was done in a mist notice at the top ("Confirmed: …, See the day"). On phones the list comes first and the pane has a Back link. The appointment page reads top down: patient and status pill, the date and time as the main line, dentist, actions, a two-column details grid, then an Activity timeline from the audit log. The booking forms keep a sticky bar with a plain-words summary and whether the dentist is free (nearest free times as small outlined buttons). The activity log groups lines by day under sticky headings, names the record each line is about as a link, shows edits as "field: old → new", hides routine lookups behind a "Show routine lookups" checkbox, and marks failed sign-ins with a solid pill and sensitive changes with an outline pill.

### Online bookings (staff side)
An appointment booked on the clinic's booking page carries a muted "Online" pill. Until staff tie the person to a record it has no patient: every screen shows the name they typed with an outline "Not linked" pill (calendar blocks say "Not linked · time"), and Confirm is a greyed `buttonBlocked` (aria-disabled, still focusable) with the reason under it; Decline always works. The request pane then has a **Who is this?** section above the actions: what they gave when signing up (hairline label/value rows, email with a Confirmed pill), "Patients who might be them" under an ink rule (two-line rows, the matching values in bold, a quiet line saying why, an outline "This is them…"), then "Someone else?" (the patient picker) and "Not a patient yet?" (Register as new patient…). Linking or registering asks inline in a mist box, saying whose appointments the login will see and to check identity first, then a mist "Linked…" notice replaces the section. When declining or cancelling an online booking, the hint says the patient sees the reason. **Patient record:** an "Online account" section (signs in as, email confirmed, linked on) with an admin-only "Unlink account…" asked inline like Archive. **Clinic settings:** an "Online booking" section with an Off/On pair, and below a hairline the booking link (`origin/book`) with "Copy link" and "Open page"; while booking is off it says to switch it on and save before sharing. **Activity log:** patients act as "Name · Patient, online"; "Account linked/unlinked" are outline pills; "Online booking" is a Kind filter.

### Staff workspace
**Staff workspace.** Admins manage accounts in the split view. The list header has "Staff" with the count and an ink Add button; under it the search box, an Active / Deactivated / All segmented control, and role and sort selects, all kept in the address. Rows show a neutral initials circle (ink when open), the name with "(you)" on your own, a quiet line of role and when they last signed in, and outline pills at the right for Locked and Must set a password (a muted pill for Deactivated). The pane opens with a 64px initials circle, the name, email, role and pills; then Details over an ink rule (role, status, last signed in, added on, email); then Manage, one hairline section per action with what it does on the left and its outline button on the right: Name and role (the edit form opens in place), Reset password (an inline question on a faint fill), Unlock only while locked, and Deactivate or Reactivate last, set apart as the quiet danger section, in ink like everything else. Your own account can't change its role or be deactivated, and says why; its password section points to Account. Add opens the add form in the pane (`?add=1`, so it works on phones), and after adding, the new person opens. Refusals from the server (such as "leaves no active admin") appear in an ink box under the question.

### One-time password panel
After adding someone or resetting a password, the temporary password appears at the top of the staff pane (above the list on phones) in a box with a 2px ink border (the one place a heavy border is used), with whom it is for, the password at 1.25rem semibold on a mist fill, a Copy button and "I've shared it". Focus moves into the panel when it appears. It stays until dismissed and is held only in the screen's memory: never in the address, the page title, the cache or the console.

### Settings form
Clinic settings is a record-width form with ink-rule section headings like the patient form: Clinic (name, address, phone, email), Opening hours (two time boxes in 15-minute steps) and Appointments (usual visit length). One Save button; the line beside it, announced politely, says "Saved." or "Nothing changed." and clears when anything is edited. Only changed fields are sent. Refused fields get the heavy border and a line under them, and focus goes to the first.

### Forced password change
An account with a temporary password sees, instead of the app, the sign-in layout with "Choose a new password": current (temporary), new and repeat boxes, each with Show/Hide, a note that the first box takes the temporary password, and a Sign out link. The rules are checked before sending (12 characters or more, the two new boxes match, different from the current one) and failures are ink boxes plus field lines. The same form sits on the Account page for anyone who wants to change their password.

### Tooth numbers (signature)
The FDI chart numbers, 18 to 11 and 21 to 28 over 48 to 41 and 31 to 38, in a 16-column grid with tabular numerals, a vertical rule at the midline and a horizontal rule between the arches. Decorative and hidden from screen readers. On the home page hero, a light passes along them once on load (700ms each, 55ms apart, ease-out), and they stay visible throughout.

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
- **Don't** put the 3D chart's code on the home page or any patient page.
- **Don't** put photographs on working surfaces (calendar, lists, forms, the sidebar). In the staff app they belong only in quiet empty states such as No requests waiting.
- **Don't** alternate black and white bands without a reason. A screen is one split: film-black where pictures and teeth are shown (the sidebar, the chart's stage and its header), white where people read and write.

### Admin and account screens
- **Save bar.** A settings form that edits in place shows a sticky bottom bar (ink rule, "Unsaved changes", Discard, Save) only while something differs from what is saved. Leaving by a link asks inline in the same bar ("Leave without saving?"); the app has no data router, so `features/clinic/useLeaveGuard.ts` catches link clicks and tab close. Swapped button sets need distinct `key`s so a submit button is never reused as a plain one.
- **Status as Pill.** In staff lists a normal account is quiet text; Deactivated is a muted Pill; Locked and Must set a password are outline Pills. Filters (search, Active/Deactivated/All segmented control, role) and the sort live in the URL.
- **Recent sign-ins.** The Account page lists your own last ten sign-ins, failed attempts and password changes (GET /auth/my-activity) so a stranger on a shared computer can be spotted.

### Patient pages
The system serves a single clinic, and its public pages are the clinic's website at the root: `/` home (`src/pages/HomePage.tsx`, reads GET /site, light, no portal code), `/book`, `/verify`, `/forgot-password`, `/reset-password`, `/appointments` (code in `src/portal`, its own lazy bundle and data cache, its own session separate from staff), and the shared `/sign-in`. There are no slugs or clinic lists; old `/clinic/<name>/...` links redirect to the same root path. The clinic's name always comes from its settings. While online booking is off, the portal pages show one calm "Online booking is closed for now" page with the clinic's phone, and the home page swaps Book for Call. The Lightbox palette and type, black, white and greys only (no accent); the modern feel comes from layout, cards, spacing and motion. Warmer and softer than the staff app: 12 to 16px corners on cards, boxes and buttons, phones first, 48px main buttons full-width on phones, 44px for every other tap target, short sentences, one ink main action per screen.
- **Header:** the clinic's initials in a 36px ink square beside its name (a stand-in for a logo), and Sign in / My appointments as an outlined pill; on phones it reads "Appointments" so the clinic's name isn't squeezed.
- **Home (`/`):** a film-black band over the dimmed x-ray photo (credited in the footer) with a white-dot wordmark header (Sign in / My appointments / Open the staff app as an outlined pill), the clinic name at up to 5.75rem, one honest sentence, a 56px white Book an appointment button (Call when booking is off), and the upper-arch tooth numbers. No services, reviews or room photos are claimed. Below on white: "Visiting the clinic" (detail rows) and "How booking online works" (three steps in small ink numbered discs: the order carries meaning).
- **Booking, four steps:** what for → which dentist → day and time → your details. Back at the top left, "Step n of 4 · Next: …" at the right, then four bars (done and current ink, to come grey; the current name bold) with their names under them from 640px. Choices live in the history state, not the address; each step's heading takes focus and the step settles in (260ms rise, off with reduced motion).
  - **Reason:** six cards (two columns from 640px) with a custom radio; the chosen card gets a 2px ink edge (border plus ring) and a faint grey fill. An optional note with a character count. Continue rides in a sticky bar at the bottom on phones.
  - **Dentist:** cards with an initials avatar (Any dentist first, full width, with an ink people icon and "The most free times"); a tick disc fills ink on the chosen one. A tap moves on.
  - **Day and time:** one screen. The month sits in a bordered card (44px round days: open days on a grey disc, closed days faint, the chosen day an ink disc; arrows, Home/End, Page Up/Down move). Picking a day shows "Free times on …" under it (scrolled into view on phones) as 48px chips in Morning / Afternoon / Evening with a count, three across on phones; the chosen time is solid ink. An empty day offers the next day and Pick another day. A tap on a time moves on.
  - **Your visit:** from 1024px a grey card beside the steps (rows with Change links, and "A request until … confirms it"); on phones a bar fixed to the bottom ("Your visit · Tooth pain · Any dentist · Tue, Nov 10 · 9:00 AM", Show/Hide) that opens upwards to the same rows.
- **Your details:** a two-way switch "I'm new here / I have an account" on a grey track with a white raised thumb (the one soft shadow on these pages). New: grouped under About you / How to reach you / Your account; labels above 48px boxes (not floating: hints and the date box need the room); a box is checked when the cursor leaves it, showing its error line or a small ink tick when right; password with an eye toggle; the consent (Data Privacy Act of 2012, RA 10173) as a bordered tick row that gets an ink edge and grey fill when ticked. Errors as everywhere: a summary ink box, a line under each field, focus to the first. Signed in: an identity card (initials, name, email), Send request, "Not you? Sign out".
- **Outcomes:** "Check your email" (a grey mail badge, the address in bold, what to expect in a grey box, Send the email again, fix the address). "Request sent" (an ink badge whose tick draws in once, the appointment as a ticket: an ink header with a calendar leaf (grey month strip) and the day and time, then dentist, reason and status rows; "What happens next" as a three-point timeline with the first point done). Rate limits and expired links get calm explanations with the next action, never a dead end.
- **Status pills** (rounded-full): Waiting for the clinic to confirm is a dashed ink outline, Confirmed is solid ink, Declined an ink outline with the clinic's note, Cancelled a muted outline.
- **My appointments:** Upcoming, then Past and cancelled, as bordered cards (past ones on grey) with a calendar leaf at the left (ink month strip), day bold, time and dentist, reason, pill and Cancel. Cancel asks inline in a grey box with an optional reason. Sign out sits in a grey box at the foot and reloads the page to clear memory on shared phones.
