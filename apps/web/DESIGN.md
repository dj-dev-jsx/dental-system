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
- **Micro** (400, 0.6875rem): calendar furniture only: the hour labels down the time grid and the weekday letters of the sidebar's month. Never for content.

### Named Rules
**The One Family Rule.** Every word is Schibsted Grotesk. Hierarchy comes from size and weight, never from a second face, italics or letter-spaced capitals.

## Layout

Content sits in a 72rem container with 20px side gutters on phones and 40px from 640px up. Landing sections are separated by 96px of padding (128px from 640px). Two-column sections (heading beside a list) collapse to one column below 1024px.

The staff app is a sidebar and a work area: a 15rem film-black column on the left, the white work area beside it, lit like the lightbox. Working pages sit in a 72rem (lists) or 64rem (records, forms) column inside the work area; the calendar alone fills it edge to edge. Below 1024px the sidebar folds behind a menu button in a 56px black bar.

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
- In the staff app: the **sidebar**, film-black (ink) with white text. At the top, the clinic's name in type (semibold, white) with the product name small in neutral-500 under it; no photograph. Then the white Book appointment button (the most common task, one click from anywhere), the main links (icon, label, and a white count pill for waiting requests; the current page gets a white 12% fill, others are neutral-400 brightening to white on hover), an Admin group for admins only, a hairline, and a small month for jumping to any day (today a white disc, the shown day a white ring). The staff member and an outlined Sign out sit at the foot. There is one Schedule for everyone: a dentist’s calendar simply opens on their own appointments, and the dentist list on the calendar switches to everyone.
- On phones the sidebar opens as a `<dialog>` from the left (200ms ease-out slide), which keeps focus inside and closes on Escape; the black bar shows the menu button, with a white dot when requests are waiting, the clinic name, and a + to book.

### Tables and record details
- **Tables:** column headings in graphite at label size over a 1px ink rule; rows separated by hairlines, a mist fill on hover; the row's name is the link. Less important columns drop out on narrow screens rather than scrolling sideways.
- **Record details:** a heading over a 1px ink rule, then label and value pairs separated by hairlines (labels 11rem wide on larger screens, stacked on phones). Empty values read "Not recorded" in stone.
- **Loading:** skeleton bars in mist where the content will be, never a spinner. Short "Loading…" text appears only if loading takes longer than 400ms.
- **Empty states** say what's missing and what to do next, with the action button when there is one.

### Calendar
The schedule is a calendar like a desktop calendar app, in three views: **Day** (a column per dentist, plus Any dentist for requests that named none, so a gap in a column is that dentist's free time), **Week** (Monday to Sunday) and **Month** (six weeks, Monday first).
- **Time grid:** 7 AM to 8 PM at 64px an hour, hour lines in hairline grey with a dotted half-hour, hours in micro type down a sticky left column, headings sticky on a 1px ink rule. Today's column has a mist fill; a 2px ink line with a dot marks the current minute.
- **Appointments:** confirmed ones are solid ink blocks with white text, like exposed film; requests are white with a dashed ink outline, because they don't hold the time. Overlaps share the column side by side. The chosen one gets a 2px ink ring.
- **Clicking:** the pointer previews the 15-minute slot under it (a faint ink fill, "+ 9:15 AM"); clicking opens a booking with the day, time and (in Day) dentist filled in, and draws the pending booking as a dashed block. Days that have passed take no clicks. Clicking an appointment opens its details.
- **Dragging:** with a mouse, an appointment moves by dragging (snapping to 15 minutes; in Day, across dentist columns hands it to that dentist) and changes length by dragging its bottom edge. The original stays behind at 30% while a ghost shows where it lands and its new time; where it can't go (a past day, or a confirmed appointment into Any dentist) the ghost turns grey and says "Can't move here". Escape cancels. A drop saves at once, and an ink bar along the bottom says what moved, with Undo; a refused move says why in the same bar and the block returns. Past appointments don't move. On touch screens a press stays a tap, so scrolling isn't hijacked; there, and from the keyboard, Change on the appointment does the same job.
- **Side panel:** bookings and details open in a 25rem panel on the right, never a pop-up, so the calendar stays in view. From 1280px it sits beside the calendar behind a hairline; narrower, it covers the calendar from the right (200ms slide) over a 30% black scrim, full width on phones. Escape or the close button shuts it.
- **Month cells:** the date in a 28px circle (ink disc for today), then up to three lines of dot, short time ("9am") and name, then "2 more". A solid dot is confirmed, a ring is a request. Clicking a day opens it in Day.

### Dental chart
Each patient's chart is its own page, split in two like the sign-in screen: on the left one continuous film-black field (joining the sidebar, divided from it by a white 10% hairline) holding the chart's header (back arrow, the patient's name in white, "Dental chart · age" in neutral-400, and the 3D model / Flat chart switch with a white active segment), the 3D model on a soft radial spotlight, and the numbered teeth along its foot; on the right a full-height 26rem white panel. On phones the black field takes the first 88% of the screen and the white panel follows.
- **Colour:** each tooth wears its condition's colour, here and nowhere else; teeth with nothing recorded stay natural white. Missing and extracted teeth are ghosts (25% in 3D, struck-through numbers in the strip). The selected tooth gets a white outline, never a hue of its own.
- **Callout:** choosing a tooth draws a 1px white line from a dot on the tooth (a 2.5px white point in a 7px ring at 50%), slanting to an elbow and running flat into the top rule of a label at the side of the stage: on the tooth's own side, above an upper tooth and below a lower one. The label has no box: the tooth number at 1.5rem bold, its name in neutral-400, the current condition with its colour dot and surfaces, the date and who recorded it, and two lines of the note. The line follows the tooth as the model turns; it draws in over 320ms, then the label fades in (both off with reduced motion). It is drawn over the canvas, not inside the 3D scene. Hidden when the stage is narrower than 560px, where the panel directly below says the same.
- **Number strip:** the FDI chart order (18 to 11 and 21 to 28 over 48 to 41 and 31 to 38) as a 16-column grid of buttons with a white midline, each with a short bar in its condition's colour. It is how keyboard users pick a tooth, and in the **Flat chart** view it is drawn large in place of the model, which is also what computers without 3D get.
- **Panel:** with no tooth chosen, the teeth counted by condition and the latest entries. With a tooth: its number at title size, its name, its current state in a mist box, the finding form (dentists and admins only: conditions as a two-column radio grid with their colour dots, surfaces for decay and fillings, a note, and a tick for today's visit), then its history over an ink rule.
- **History and corrections:** entries are never edited. A wrong one is struck through in stone and stays; its correction sits above it with "Correction:" and the reason, on the same date. Withdrawing an entry shows a dashed empty dot and "Entry withdrawn".

### Confirming an action
A reversible action like Archive asks inline, next to the button ("Archive this patient?" with Archive and Cancel), not in a pop-up dialog.

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
