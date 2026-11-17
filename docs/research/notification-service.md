# Build our own Notification list, or use Knock, Novu or MagicBell?

Research for issue #2 (parent map: #1, in-app Notifications spec). Researched 2026-11-17 from vendor pricing pages and official docs. Prices change often, so re-check them before signing up.

## Recommendation

**Build it ourselves**: a `notifications` table in Cadence's existing SQLite file, read by the app layout's loader on every page change.

What people will see: a bell with an unread number, and a list that opens from it. The bell updates on the next click or refresh. That matches the map's standing preference, and live updates can be added later at low cost (see "Live delivery").

Why:

- **Cost.** It costs $0 a month. A hosted service costs roughly $115 to $500 a month at Cadence's likely volume once the free tier runs out.
- **Features.** The hosted services' main advantages are features the map has ruled out of scope: email and phone-push channels, preference screens, and live sockets. For an in-app bell and list alone, they mostly sell us a UI widget.
- **Privacy.** No user names or course activity leave Cadence. Knock has no EU hosting yet.
- **No lock-in.** If we leave a service, the Notifications stay behind with the vendor or have already expired.

The trade-off is that we build the bell, list, unread count and "mark all read" ourselves. The app already has Radix and shadcn UI pieces and lucide icons, which include a bell, so this is roughly a table, two small server actions and one popover component.

## Volume assumption used for cost

Cadence has tens of thousands of users at most. For this estimate we assume **20,000 users × about 5 Notifications each per month, or about 100,000 Notifications a month**. An Instructor update going to every Student of a course counts once per Student under every vendor's billing.

## Comparison

| | Build our own (SQLite) | Knock | Novu (cloud) | MagicBell | Courier (other contender) |
|---|---|---|---|---|---|
| Free tier | n/a | 10,000 messages/mo [1] | 10,000 workflow runs/mo [3] | 1,000 deliveries/mo [6] | 10,000 sends/mo [9] |
| Paid entry | $0 | Starter $250/mo, includes 50,000, then $0.005 each [1] | Pro from $30/mo, includes 30,000, then $1.20 per 1,000 [3] | Startup $249/mo, includes 50,000, then $0.0025 each [6] | $0.005 per send from the first one [9] |
| **Est. at 100k/mo** | **$0** | **≈ $500/mo** | **≈ $115/mo** | **≈ $375/mo** | **≈ $500/mo** |
| Bell + list UI included | No, we build it | Yes: bell button, popover, feed, unread/seen badge [2] | Yes: `<Inbox>` with bell, unread count, tabs, snooze, preferences [4] | Yes: `FloatingInbox` bell, read/unread, archive, delete [7][8] | Yes (not verified in detail) |
| Live delivery | Extra work (see below) | Included, sockets [2] | Included [4] | Included, persistent connection [8] | Not checked |
| How long Notifications are kept | As long as we choose | Feed items: unlimited, configurable. Logs: 30 days [1][10] | Inbox messages: **30 days on Free, 90 days on Pro/Team** [5] | Not stated in docs | Not stated |
| Where data lives | Our server | **US only.** EU residency "expected by end of 2026" [11] | US or EU (Frankfurt). Region can't be changed later [5] | Not verified | Not verified |

### What counts as one billable unit

- **Knock:** "a single message delivered to a single user on a single channel." In-app counts as a channel [1][11]. Knock doesn't hard-cap the Free plan. It contacts you about billing instead [1].
- **Novu:** one workflow run = one workflow executed for one subscriber. A broadcast to a topic costs one run per subscriber. Novu doesn't throttle you when you go over a limit; it bills you [12].
- **MagicBell:** deliveries per channel. 100 users getting an in-app Notification = 100 deliveries [6].

## Option by option

### 1. Build our own (SQLite via Drizzle)

- **How it fits.** We add one `notifications` table (who it's for, kind, text, link, created-at, read-at) next to the existing tables in `app/db/schema.ts`. `app/routes/layout.app.tsx` already has a loader that runs on every page, and it can fetch the unread count and latest items. React Router reloads loader data automatically after form actions [13], so "mark as read" refreshes the bell with no extra code.
- **UI.** Nothing comes ready-made. We compose it from the existing `app/components/ui` pieces (Radix) and lucide's bell icon.
- **Leaving.** Not applicable. The data is ours, in the same file as everything else.
- **Privacy.** Nothing new is shared with a third party.
- **Unsolved problems we'd own:** grouping or summarising floods (listed in the map as "not yet specified") and cleaning up old rows. Hosted services don't solve the first one for free either. Knock and Novu offer "batch/digest" steps, but we would still have to design the rules.

### 2. Knock

- **UI.** React components `NotificationIconButton`, `NotificationFeedPopover`, `NotificationFeed`, `NotificationCell`. By default, opening the popover marks everything as seen [2].
- **Fit.** Cadence's server calls Knock's API when something happens. The browser loads the feed directly from Knock. **Security caveat:** by default "anyone who has the feed ID" can read a feed. You must turn on enhanced security mode and sign a user token on our server [2].
- **Leaving.** Feed items are kept indefinitely and can be fetched per user through the Feeds API [10]. There is no published bulk export of feed items, so migrating would mean pulling each user's feed. Logs expire after 30 days [10].
- **Privacy.** Knock Labs, Inc. (US) acts as processor under a DPA with EU Standard Contractual Clauses [14]. It is certified under the EU-U.S. Data Privacy Framework and has no European presence [15]. **No EU data residency yet** [11].
- **Cost.** It is the most expensive option at this volume. Starter's $250 base fee applies as soon as we exceed 10,000 messages a month.

### 3. Novu

- **UI.** `<Inbox>` React component with a bell and a live unread count. It also includes tabs and filters, snoozing, localisation and a preferences panel [4]. It has the richest UI of the three.
- **Fit.** Same pattern as Knock: our server triggers a workflow, and the browser talks to Novu. Changing an existing subscriber from the browser requires an HMAC `subscriberHash` signed on our server [4].
- **Leaving.** Inbox messages are **deleted after 30 days on Free and 90 days on Pro/Team** [5]. Leaving loses little, because older history has already gone. It also means users can never see Notifications older than 90 days unless we pay for Enterprise.
- **Self-hosting escape hatch.** The core is MIT-licensed, and enterprise folders use a commercial licence [16]. Self-hosting needs API, Worker, WebSocket and Dashboard services, plus MongoDB, Redis (two clusters recommended) and S3-style storage. The smallest setup is one 4-CPU / 8 GB machine plus those databases [17]. That is far heavier than Cadence's single SQLite file. Some cloud-only features are not available self-hosted [17].
- **Privacy.** EU (Frankfurt) region available. The region is fixed when the account is created, and data can't be moved between regions [5].
- **Cost.** It is the cheapest hosted option at this volume, at about $30 + 70 × $1.20 ≈ $114 a month.

### 4. MagicBell

- **UI.** `FloatingInbox` with a bell trigger, plus an `Inbox` with pagination and read/unread states [7]. Users can archive and delete [8]. Preferences are a separate component [7].
- **Fit.** Our server signs a "User JWT", which is passed to the React provider [7].
- **Leaving / privacy.** The docs I read don't state a retention period or hosting region. **Not verified.** We would need to ask the vendor.
- **Cost.** The free tier is only 1,000 deliveries a month, which is too small to run in production for long. After that, it's $249 a month [6].

### 5. Courier (checked for completeness)

Courier charges $0.005 per send after the 10,000 free sends a month. On paid usage the first 10,000 are billed too, so it costs about $500 a month at our volume [9]. The pricing page doesn't say whether in-app Inbox messages count, or how long data is kept. It is not cheaper or clearer than the three named options.

## Live delivery (a Notification appearing without a page change)

| Option | What it takes | Ongoing cost |
|---|---|---|
| Build our own: **polling** | One small component using React Router's `useRevalidator` re-runs the page's loader every 30 to 60 s, or when the tab regains focus. The docs suggest exactly this pattern [13]. Notifications appear within about a minute. | $0. Adds one small SQLite read per open tab per interval, which is negligible at this scale. |
| Build our own: **true push** | A server-sent-events endpoint that keeps a connection open per tab and pushes when a row is inserted. This is feasible because Cadence runs as one server on one SQLite file. If Cadence ever runs on several servers, it would need a shared message channel (e.g. Redis). | $0 in fees, but more code to build and maintain. |
| Knock / Novu / MagicBell | Already included in their components via persistent socket connections [2][4][8]. | No extra charge beyond the per-message price. |

Live delivery is the one area where the hosted services are clearly better. Polling costs us almost nothing, though, and gets close enough. If the map later wants live delivery, "poll on focus + every 60 s" is the cheap first step.

## Sources

1. Knock pricing: https://knock.app/pricing
2. Knock React in-app feed docs: https://docs.knock.app/in-app-ui/react/feed
3. Novu pricing: https://novu.co/pricing
4. Novu Inbox overview: https://docs.novu.co/platform/inbox/overview
5. Novu security & compliance (retention, regions): https://docs.novu.co/platform/additional-resources/security
6. MagicBell pricing: https://www.magicbell.com/pricing
7. MagicBell React library: https://www.magicbell.com/docs/libraries/magicbell-react
8. MagicBell in-app channel: https://www.magicbell.com/docs/channels/in_app
9. Courier pricing: https://www.courier.com/pricing
10. Knock data retention: https://docs.knock.app/manage-your-account/data-retention and https://docs.knock.app/concepts/messages
11. Knock plans and usage (message counting, EU residency): https://docs.knock.app/manage-your-account/knock-plans
12. Novu billing / triggers: https://docs.novu.co/platform/account/billing and https://docs.novu.co/platform/concepts/trigger
13. React Router `useRevalidator`: https://reactrouter.com/api/hooks/useRevalidator
14. Knock DPA: https://knock.app/legal/data-processing-addendum
15. Knock privacy policy: https://knock.app/legal/privacy-policy
16. Novu repository README (licence): https://github.com/novuhq/novu
17. Novu self-hosting overview: https://docs.novu.co/community/self-hosting-novu/overview
