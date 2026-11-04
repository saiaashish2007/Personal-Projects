# Guest Call → PMS Action

Harbor & Pine front office, on one screen. A guest calls to extend checkout. An agent makes the change in the property system. Every step is scored pass or fail, with latency.

## What you see in 60 seconds

1. Reservation **R-1042** is already on the books: Alex Chen, king room, arriving March 12, departing March 15, late checkout off.
2. Press **Play call**. The scripted call (Pipecat + Deepgram plug in here) appears line by line. Alex asks to move checkout from March 15 to March 17 and add late checkout.
3. The agent runs the five steps below against the same reservation a staff member can edit.
4. The score lists each step as pass or fail with latency in milliseconds, plus the reservation before and after.

## Steps

1. Lookup reservation R-1042
2. Verify guest name
3. Update departure to 2026-03-17
4. Add late checkout
5. Read back and confirm it matches

## Replay

**Replay** runs those five steps again and appends a new scored run. The browser keeps recent runs, so a refresh does not clear the dashboard.

**Break the room** rejects the departure write: King 412 is blocked, checkout stays where it is, and that step fails. Turn the toggle off and replay. The same steps run again and the run passes.

Staff edits use the same reservation record as the agent. Save them before the next run. **Restore original stay** puts R-1042 back to March 15 with late checkout off.

## Production

A production version would take the live phone call through Pipecat and Deepgram, then drive the hotel's real PMS with Playwright. This mock is the stand-in: a scripted call and an in-memory reservation, so the replay-and-score loop runs with no API keys and no connection to a property system.
