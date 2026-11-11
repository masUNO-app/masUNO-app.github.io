# Check before each App Store submission

For the masUNO team. Not legal advice, and not part of the public site.

`privacy.html` was rewritten on Nov 11, 2026 to match the `ios` repo (branch `ethan/group-chat`, version 0.6: the migrations, `delete-account`, `docs/SPEC.md` rev. 7 and the Swift code). Sections (a) to (c) are what the repo can't prove. Section (d) is what to enter in App Store Connect. Section (e) lists decisions nobody has made yet.

## What changed on Nov 11

- **Sign-in** is described as the school account (Microsoft at Tec), not an emailed 6-digit code. Gmail is no longer listed as sending sign-in codes.
- **Profile photos** are gone from the page. The app has none (SPEC C4).
- **Padel** is in the sports list.
- **Who sees what** now says every signed-in student at your campus can see who's going to a game. The old page said only people in the game could, but the `rsvps` rule allows the whole campus.
- **Location** now mentions the one case where a phone's position reaches the server: a host picking "current location" as the game's place.
- **Saved games** (on the phone only), **Add to calendar**, Apple's map search and the Google Maps directions option are disclosed.
- **Deletion** matches `delete-account`: the sign-in record, hosted games and their chats, sent messages and blocks go. Reports stay, unlinked, with the copy of a reported message.
- **Chat messages** are deleted 30 days after the game ends (the `purge-old-chat` job).
- **Report alerts** name Discord and say what the alert contains (reason, kind of target, report ID), taken from `alert_new_report`.
- **Community rules** are the four rules the app shows in onboarding, word for word.
- **Version numbers** are gone. Notifications and synced Saved games are under "Coming in a later version".
- **Spanish** exists for both pages, in `i18n.js`. A fluent reader should check it.
- **The waitlist notice** lists the invite codes and approximate country that main now collects.

## (a) Backend: confirm on `masuno-prod`

The page states each of these as fact. If one isn't true on prod, fix prod or change the page.

1. **Report alerts go to Discord.** `supabase/README.md` says the webhook isn't set up on either project. Set it up, or remove the Discord line from the page.
2. **Weekly backups in private storage.** Confirm someone runs `supabase db dump` weekly, where the file goes, who can open it and when each one is replaced. The page gives no period for how long a backup lasts.
3. **Servers in the United States.** Confirm the region of `masuno-prod`.
4. **What Supabase Auth stores from the school sign-in** (B21). The page says name, school email and an account ID, and nothing else. Check `auth.users` and `auth.identities` after a real Tec sign-in.
5. **Chat cleanup.** Confirm `purge-old-chat` shows under Integrations → Cron on prod before `chat_enabled` is turned on.
6. **Hidden columns.** With a real user token, try to read another user's last name, interests and email through the API.
7. **Delete account.** Run it on prod and check that the Auth user, profile, hosted games, RSVPs, blocks and messages are gone, and that reports remain with empty `reporter_id` and `user_id`.
8. **Logs.** Check what Supabase logs (such as IP addresses) and for how long. The page doesn't mention logs.
9. **No analytics or crash SDK** in the build, including inside dependencies.

## (b) App: confirm in the build you submit

1. **Edit profile works.** "Your choices" says you can change your name, class year and sports in the app. If Edit profile is cut from the build, remove that line.
2. **The map works with location off** and centers on campus, as the page says.
3. **In-app text matches the page:** the four community rules, the Delete account alert, and the location prompt ("masUNO uses your location to show how far games are. It's never shared with other people.").
4. **Blocking hides both ways** as the page says: names, hosted games and messages.
5. **Privacy manifest.** The `ios` repo has no `PrivacyInfo.xcprivacy`, and the app uses `UserDefaults`, which Apple lists as a required-reason API. Add the manifest (reason `CA92.1`) so the upload doesn't get flagged.

## (c) Law and review points the page doesn't settle

**LFPDPPP.** The law was replaced in March 2025, and sources disagree on some of the new notice rules, so check the official text with someone who knows it.

- **Responsible party:** the team is named, but neither page gives a legal responsible party or an address for notices. Don't assume Boys & Girls Clubs of Chicago agrees to this role.
- **Rights:** both pages explain ARCO rights and how to use them by email, but only say "within the time limits set by law". Check that this and the wording on how to complain are enough.
- **Purposes:** "Why we use it" doesn't say which uses are optional.
- **US servers:** the location is disclosed, but not whether this is a transfer needing consent.
- **Authority:** enforcement moved from INAI to the Secretaría Anticorrupción y Buen Gobierno. The pages say "the Mexican authority in charge of personal data protection" without naming it.
- **Applicability:** ask how the law applies to an unincorporated student team.

**Apple.**

- **5.1.1(i):** expects retention details. The page says account data is kept until you delete the account, and gives 30 days for chat messages. It gives no period for reports or backups.
- **5.1.1(v):** expects the whole account record deleted. Reports are kept without the account link, including the copy of a reported message. Be ready to explain that this is for safety.
- **1.2:** make sure someone really reviews reports within 24 hours, including weekends.
- **Own-risk wording** may not limit liability, so don't assume it protects the team.

## (d) App Store Connect

**URLs**

- Privacy Policy URL: `https://masuno-app.github.io/privacy`. It only shows the app page once this branch is merged into `main`. Until then, that address shows the waitlist notice.
- Support URL: `https://masuno-app.github.io/support`. The page is on the `support-page` branch and isn't merged, so the address is a 404 today.

**App Privacy answers** (suggested, from what the build stores on our servers). For every type: linked to the user, not used for tracking, purpose App Functionality.

| Data type | Why |
| --- | --- |
| Contact Info → Name | First and last name from the school sign-in and the profile |
| Contact Info → Email Address | School email, kept in Supabase Auth |
| Identifiers → User ID | The account ID |
| User Content → Other User Content | Games you post (title, notes, meet-up spot), reports and their notes |
| User Content → Emails or Text Messages | Group chat messages. Add this when `chat_enabled` goes on in prod |
| Other Data | Class year and the sports you play |

- **Tracking:** No.
- **Location:** the phone's position stays on the phone, which Apple doesn't count as collected. The exception is a host who picks "current location" as a game's place: those coordinates are saved as the place. Decide whether to declare Precise Location for that. Declaring it is the safer answer.
- **Diagnostics:** none. Crash reports come from Apple, not from an SDK.
- **Device token:** add Identifiers → Device ID when notifications ship.

**Age rating:** answer yes to user-generated content, and to messaging once chat is on. See the minimum age in (e).

## (e) Decisions nobody has made

1. **Minimum age.** The page says "for university students, not for children" and gives no number. First-years may be 17, and PrepaTec students may have @tec.mx addresses. Set a rule, put it on the page and match the age rating.
2. **Waitlist retention.** "While the waitlist is running" has no end date. Decide when the waitlist ends and delete the data then.
3. **How long reports are kept.** The page gives no period.
4. **Naming the program partners.** Check that the City of Chicago, JPMorgan Chase, Apple, Everyone Can Code Chicago and Boys & Girls Clubs of Chicago are fine being named on the page.
5. **Tec.** The page doesn't say whether masUNO is independent of Tec, and gives no campus security number.
