# Check before publishing

For the masUNO team. Not legal advice, and not part of the public page.

## (a) Backend developer: verify against Supabase

1. **Hidden fields.** Row-level rules limit rows, not columns. Using a real user token, try to read another user's last name, interests and email through the API.
2. **Phone location.** Confirm coordinates never leave the phone, including in distance sorting and logs.
3. **Who's going.** Can people who haven't joined a game see the list? The page says other students in the game can.
4. **Delete account.** Does it remove the Auth record that holds the email? Check past games, your blocks, reports about you, and 2.0 tokens and saved games. Confirm reports are actually unlinked.
5. **Backups.** Where are they, who has access, and when is each one replaced? A third-party store belongs under "Where your data is stored". Does Supabase keep its own backups too?
6. **Region, logs and SDKs.** Confirm the US region, what Supabase logs (such as IP addresses), and that no analytics or crash SDK is in the build, including inside dependencies.
7. **Blocks and the filter.** Confirm blocked people can't see blocks, and that the filter covers all four fields.

## (b) What LFPDPPP or App Review may expect that this page doesn't cover

**LFPDPPP.** The law was replaced in March 2025, and sources disagree on some of the new notice rules, so check the official text with someone who knows it.

- **Responsible party:** the team is named on the waitlist notice, but neither page gives a legal responsible party or an address for notices. Don't assume Boys & Girls Clubs of Chicago agrees to this role.
- **Rights:** both pages now explain ARCO rights and how to use them by email, but only say "within the time limits set by law". Check that this and the wording on how to complain are enough.
- **Purposes:** "Why we use it" says why most items are collected, but not which uses are optional. Confirm each reason is accurate, including that @tec.mx email only checks student status at sign-in.
- **US servers:** the location is disclosed, but not whether this is a transfer needing consent.
- **Spanish:** the page is English-only until 2.0, while users are in Mexico.
- **Authority:** enforcement moved from INAI to the Secretaría Anticorrupción y Buen Gobierno. The page doesn't say how to complain.
- **Applicability:** ask how the law applies to an unincorporated student team.

**Minimum age.** None is stated, and first-years may be 17. PrepaTec students may also have @tec.mx addresses. Set a rule and match it to the App Store age rating.

**Apple.**

- **5.1.1(i):** expects retention details. The page has no period for active accounts, because none was provided.
- **5.1.1(v):** expects the whole account record and associated data deleted. Compare this with kept reports and check (a)4.
- **1.2:** make sure someone really reviews reports within 24 hours, including weekends.
- **App Store Connect:** the App Privacy answers must match this page.
- **Community guidelines:** the in-app text must match "Community rules and safety".

**Waitlist retention.** "While the waitlist is running" is a promise with no end date. Decide when the waitlist ends and delete the data then.

**Own-risk wording.** It may not limit liability, so don't assume it protects the team.

## (c) Where I guessed or left something out

1. **"No personal details" is left out of the report alert.** If "the target" is a person's name, that claim is false. Add it back only if the target is an ID that identifies no one. "What was reported" is my wording.
2. **"Discord/Slack"** is copied from the brief. Name the one you actually use.
3. **"Tec student".** The app only checks the @tec.mx domain. If staff, faculty or alumni have those addresses, "Tec students" overstates it.
4. **Inferred statements:** the team can see what's in the database, "Games you join" is stored data, and the name format applies when you host.
5. **Blocked people.** The brief gives the name, not where it is or what blocking does. "People you've blocked are listed" is my assumption, and the effects of blocking are left out.
6. **iPhone Settings wording** comes from how iOS works. Test whether the map works without location, and say so if it does.
7. **Changes to this page.** The promise to post updates and change the date is mine.
8. **1.0 data.** Language setting and interests are listed as the brief lists them, though 1.0 is English-only and the only stated use of interests is 2.0 alerts. Confirm 1.0 stores both.
9. **Not on the page because it wasn't provided:** a campus security number, team members' names, and whether masUNO is independent of Tec. Also check that program partners are fine being named.
