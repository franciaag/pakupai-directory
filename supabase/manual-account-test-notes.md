# Manual-account checks

Live tests on 2026-10-12 used temporary synthetic accounts and removed them afterward.

- Password rules are enforced on server signup/reset.
- Username normalization and duplicate/wrong/missing account failures.
- Two-user file isolation and export access.
- Wrong recovery code and cross-account code denial.
- Simultaneous resets have one winner. Old code is retired and a new code is returned.
- Password reset removes old Auth sessions. Private RLS and Edge checks reject old access tokens, refresh tokens and password.
- Existing profile files remain after reset.
- Server reset rate limit returns 429.
- Browser signup validates confirm-password, requires saved-code acknowledgement, signs in to a fresh Room.
- Browser signout/reset/code rotation/new-password signin complete end-to-end.

Manual accounts use a random internal identifier under the reserved `.invalid` namespace, not a supplied email. They do not share GitHub email identities. Recovery codes are shown once and stored only as hashes. Failed interrupted resets can be retried with the same code after the short lock window; access remains blocked until reset completes.
