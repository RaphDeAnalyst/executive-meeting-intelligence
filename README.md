# Executive Meeting Intelligence

A local-first meeting management app for turning meeting notes into accountable follow-through: structured reports, an editable action register, a decision register, and follow-up email drafts.

## Live demo

The app is hosted on GitHub Pages: [Executive Meeting Intelligence](https://raphdeanalyst.github.io/executive-meeting-intelligence/).

## Run locally

```sh
npm install
npm run dev
```

Create a production build with `npm run build`.

The initial workspace is seeded with demonstration data. Meetings, actions, and decisions are persisted in the browser's `localStorage`; use **Settings → Restore demo data** to reset it.

## Local meeting intelligence

The MVP does not connect to an AI service and does not require an API key. Its deterministic processor is in `src/lib/meetingEngine.ts`, with the app-facing processor boundary in `src/lib/meetingProcessor.ts`.

The transcript preprocessor recognizes metadata labels, timestamped speaker turns, and continued speaker statements:

```text
Customer Support Operations Improvement
Meeting Date: November 17, 2026
Meeting Time: 10:00 AM - 11:00 AM
Participants: Amara Okafor, Daniel Mensah
[10:02 AM] DANIEL MENSAH: We closed 412 support tickets last week.
[10:04 AM] AMARA OKAFOR: Daniel, please categorise the aged tickets by Thursday.
```

The processing stages are transcript segmentation and metadata extraction, statement/fact extraction, action extraction, decision extraction, semantic consolidation, validation, then report generation. Extracted records are reconciled centrally with persisted workspace records before migration, action/decision register updates, or report display; the report builder also consolidates its inputs rather than assuming cached arrays are current. The engine separates transcript content from `POST-MEETING NOTES` and `SUPPLEMENTARY NOTES`; supplementary material can flag a conflict but cannot add discussion points, decisions, or assignments. It resolves speaker and participant names, multiple owners, dates and weekdays relative to the transcript's meeting date, semantically repeated assignments, action dependencies, and decision states including proposed, pending, not approved, rejected, approval required, and scheduling not finalized. Compound responsibilities with different objectives are kept separate. Action and decision records retain source statements and extraction confidence.

Risk detection is limited to evidenced operational failures, blockers, and material negative outcomes; questions and task assignments are classified separately. A validation pass flags missing owners or deadlines, uncertain dates, unresolved dependencies, possible duplicate actions or decisions, conflicting decision statuses, capture-form date discrepancies, and transcript/supplement conflicts. Numeric relationships are retained only when explicitly stated in the same source context. Executive summaries are composed from extracted facts, decisions, deadlines, priorities, risks, and unresolved questions—not transcript headers. Follow-up drafts reuse the same validated structured results as the report.

The rules are intentionally conservative. Review extracted information before sharing, especially where wording is ambiguous. This local parser is a transparent MVP, not a substitute for human review or an AI model. The processor boundary in `src/lib/meetingProcessor.ts` can later be implemented by a provider adapter with the same structured result.

Run the automated regression suite with `npm test`. It includes a timestamped customer-support transcript covering speaker identification, meeting-date precedence, seven distinct responsibilities, repeated tracker/refresher/account-access assignment consolidation, distinct same-owner tasks, decision states, supplementary-note isolation, resolved versus unresolved questions, source traceability, and follow-up email accuracy.

## Privacy and exports

Meeting content is processed in the browser and saved in this browser's `localStorage`; there is no server-side processing. Browser storage is not encrypted, so use a trusted device for sensitive information.

Meeting reports open as concise executive briefs with a consolidated decision list and a single action tracker. Supporting discussion, transcript evidence, and extraction warnings are available on demand. Copy and PDF/print output use the same brief structure; follow-up emails reuse its validated decisions, actions, and summary.

Reports can be printed or saved as PDF through the browser's print dialog. Action items can be exported as CSV.
