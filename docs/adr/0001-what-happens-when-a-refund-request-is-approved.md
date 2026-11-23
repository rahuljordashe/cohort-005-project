# What happens when a Refund Request is approved

The buyer of an Individual Purchase keeps their Enrollment while their Refund Request is Open and loses it the moment a Platform Admin approves it, not when the Refund is issued. They keep their lesson progress, watch history, quiz attempts, comments and rating. Deleting it can't be undone, the watch history is the evidence the approval was decided on, and a student who buys again or claims a Seat later should pick up where they left off. Rows for a student with no Enrollment are expected, not orphans to clean up.

A buyer who also holds a Claimed Seat for the course keeps their Enrollment (see ADR-0004).

## Considered Options

- **End the Enrollment when the request is raised**: rejected, because a buyer whose request is declined would have been locked out for nothing.
- **End the Enrollment when the Refund is issued**: rejected, because a Failed Refund would leave the buyer holding both an Enrollment and an approved Refund Request, and it would tie the Enrollment to money movement that is handled separately.