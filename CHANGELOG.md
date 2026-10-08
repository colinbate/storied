# Changelog

All notable changes to Storied will be documented in this file.

## [0.6.0](https://github.com/colinbate/storied/compare/storied-v0.5.0...storied-v0.6.0) (2026-10-08)


### Features

* add emoji reactions with throttled notifications ([8f9fc4d](https://github.com/colinbate/storied/commit/8f9fc4de872f2e4714bc72d08beb1da1303358ce))
* add RSVP-aware calendar exports and revocable subscriptions ([2a8803d](https://github.com/colinbate/storied/commit/2a8803d855e306fc74b13db2395ccfeba9270023))
* Better PWA support with offline warning. ([df1957b](https://github.com/colinbate/storied/commit/df1957bd48259d90c2eb2761235515e8c4f56bd2))
* let members leave the club ([7c9abd9](https://github.com/colinbate/storied/commit/7c9abd90891bb75252f3ccf6de40eb9ce3f48525))
* require introductions for moderated signups ([3cd9dfd](https://github.com/colinbate/storied/commit/3cd9dfdddafaeef0bc4a36d8b37bd5aace1909a2))


### Bug Fixes

* exclude completed sessions from next meeting ([b63c681](https://github.com/colinbate/storied/commit/b63c681c3ce9baaff8048c9b3da37accd5acf10f))
* Increase session length ([7347a61](https://github.com/colinbate/storied/commit/7347a612c0381fe5ecbae748e7b96959c0df8860))
* recover failed and stale session reminders ([5239226](https://github.com/colinbate/storied/commit/523922639fefaa3a11b89406ebf67fa2d844eb04))
* respect email delivery mode for reactions and messages ([afb07b1](https://github.com/colinbate/storied/commit/afb07b170ce1828b28b58f63c51d4932391d0105))
* show event timezone and member local meeting time ([274a11a](https://github.com/colinbate/storied/commit/274a11a8a064ccee532cd27e46b089c67cec4e24))

## 0.5.0 (2026-09-20)

Initial versioned release of Storied.

### Highlights

- Private, permission-based member spaces with passwordless sign-in, invitations, profiles, roles, moderation, groups, and restricted discussions.
- Threaded Markdown discussions with replies, mentions, image attachments, spoilers, subscriptions, saved drafts, search, read positions, and participant summaries.
- Session planning with themes, book lists, reading choices, RSVPs, waitlists, attendee management, reminders, agendas, live facilitation, feedback, recaps, and calendar links.
- A shared library covering books, authors, series, genres, classifications, member shelves, club reading history, and related conversations.
- Private messages and configurable notifications through email digests, session reminders, targeted alerts, and Pushover.
- Responsive member and administration interfaces with dark mode, timezone-aware dates, and an optional OpenDyslexic typeface.
- Public session APIs and integration points for a separate club website, including public RSVPs and deployment hooks.
- Self-hosted Cloudflare architecture using Workers, D1, R2, Queues, scheduled jobs, and automated database migrations.
- Installable PWA metadata, cached application assets, deployment update detection, and a dedicated offline page.
