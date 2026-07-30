# Chunq ambassador operations

The private staff dashboard is `https://id.chunqwear.com/ambassador-admin.html`.

## Current system contract

- Google Form submissions are losslessly staged in `ambassador_applications`.
- Every staged row retains all 46 source fields in `raw_response`.
- Repeat submissions remain separate records and point to one primary application.
- Conflicting email fields block decisions and outreach until an owner selects the correct submitted address.
- A final acceptance links or creates an `ambassador_invites` record in the same database transaction.
- Application decisions create private email drafts. They never send automatically.
- Anonymous users cannot read staging, review, outbox, sync, or integration-health records.
- An ambassador can remove a failed proof upload before submission, but cannot delete proof after a submission references it.

## Refresh applications

The Google Form refresh is operator-run. It is not scheduled automation.

```sh
SUPABASE_ACCESS_TOKEN="..." npm run sync:applications -- \
  --source "/absolute/path/to/source_data.json" \
  --review "/absolute/path/to/complete_review_data.json"
```

The source file must contain the live 46-column Google Form response set. The
review file must contain the `All Applicants` and `Response Reconciliation`
tabs produced by the reviewed workbook. The sync refuses a source with a
different field count.

The sync is idempotent by sheet, tab, and source row. It updates source and
review evidence without overwriting an owner-recorded decision. It records a
sync run and updates the Integrations page after success.

## Decision workflow

1. Open **Applications → Needs action**.
2. Resolve red email-conflict holds before doing anything else.
3. Read the critical review, public evidence links, and all original answers.
4. Choose the decision, starting tier, score, strengths, and exact first task.
5. Save the decision. This prepares a private draft and, for acceptance, links
   or creates the approved account.
6. Open the draft in the company email app, personalize the final wording, and
   send it.
7. Until mailbox event sync exists, review IONOS for replies, delivery failures,
   and bounces; do not mark a draft sent based on assumption.

## Known external boundaries

- Google Form: complete through the most recent successful operator sync; not continuous.
- Supabase account linking and decision transaction: connected.
- Supabase account email: connected through IONOS SMTP.
- IONOS replies, delivery, and bounces: manual.
- Shopify reward product, inventory, order, fulfillment, and tracking handoff: not connected.
- Database recoverability and network hardening: still require a production pass.
