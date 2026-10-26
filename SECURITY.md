# Security

## Keys

brand-film never asks for, stores or prints an ElevenLabs key. The scripts call
the official ElevenLabs CLI, which finds the key itself, in this order:

1. `ELEVENLABS_API_KEY` in the environment.
2. The CLI's own sign-in (`elevenlabs auth login`).
3. On macOS, a key kept in the login Keychain under the service name
   `elevenlabs-api-key`, read only when neither of the above is set:
   `security add-generic-password -a "$USER" -s elevenlabs-api-key -w`

A film folder's `.gitignore` excludes `.env`. Don't commit keys, and don't paste
them into a chat with an agent; run `! elevenlabs auth login` instead.

To cap spending, set `FILM_MAX_CHARS`: `npm run narrate` refuses a run that would
send more characters than that, or more than the account has left.

## Untrusted input

`scripts/extract-brand.py` reads decks and PDFs you give it. It uses only the
Python standard library, is meant to be run with `python3 -I`, and writes into
the output directory you name. Put downloaded brand files in their own empty
directory before reading them.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting on this repository
(Security → Report a vulnerability) rather than a public issue.
