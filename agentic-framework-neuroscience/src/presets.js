// Team scenarios set in a company Slack channel. Each teammate holds different
// private facts, so the best deliverable only emerges when agents and humans
// move information from private memory into team memory and split the work.
export const PRESETS = [
  {
    key: 'onboarding-emails',
    title: 'Write the 3-email onboarding sequence for the new Team plan',
    channel: 'growth-squad',
    description:
      'Ship a day 0 / day 3 / day 7 onboarding email sequence for teams that just signed up. Each email needs a subject line, body, and one call to action. The goal is the activation metric below.',
    criticality: 'operational',
    subtasks: [
      'Define the activation goal and success metric',
      'Draft email 1 (day 0): welcome and first action',
      'Draft email 2 (day 3): invite-your-team nudge',
      'Draft email 3 (day 7): value recap',
      'QA the sequence for tone, merge fields, and compliance',
    ],
    privateBriefs: {
      A: 'Activation = a new team invites at least 2 teammates within 7 days. Current rate is 18%; the goal for this quarter is 30%.\nLegal requires an unsubscribe line and our mailing address (Northwind Labs, 500 Market St, San Francisco) in every email.',
      B: 'Our email service is Postmark. Templates only support the merge fields {{first_name}} and {{team_name}}.\nThe invite link format is https://app.northwind.dev/invite?team={{team_name}}.',
      C: 'Brand voice: friendly and plain. No exclamation marks in subject lines.\nIn last month\'s test, emails with a short GIF of the invite flow got twice as many invites.',
    },
  },
  {
    key: 'postmortem',
    title: "Write the postmortem for Tuesday's checkout outage",
    channel: 'incident-review',
    description:
      'Produce a blameless postmortem: timeline, root cause and contributing factors, customer impact, and action items with owners. Each teammate saw a different part of the incident.',
    criticality: 'consequential',
    subtasks: ['Build the timeline', 'Root cause and contributing factors', 'Customer impact', 'Action items with owners'],
    privateBriefs: {
      A: 'Support received 214 tickets during the incident; 3 enterprise customers asked about SLA credits.\nThe status page shows the outage window as 14:02–14:49 UTC.',
      B: 'Deploy #4812 went out at 13:58 UTC and changed the payment client timeout from 30s to 3s.\nRollback finished at 14:47; the error rate was back to normal by 14:49.',
      C: 'The checkout error screen said "Try again" with no retry limit, which tripled duplicate payment requests.\nThe status page was first updated 22 minutes after the first alert fired.',
    },
  },
  {
    key: 'vendor-pick',
    title: 'Pick a product analytics vendor: Orbit, Prism, or Quill',
    channel: 'data-platform',
    description:
      'Recommend one vendor with a one-paragraph justification and the top risk. Each teammate evaluated a different side of the vendors; no one has the full picture alone.',
    criticality: 'consequential',
    subtasks: ['Agree on decision criteria', 'Pool what each teammate found', 'Score each vendor', 'Write the recommendation'],
    privateBriefs: {
      A: 'Budget ceiling is $40k per year.\nOrbit quoted $36k/year; Prism quoted $28k/year; Quill quoted $45k/year.',
      B: 'Prism has no EU data residency, and 40% of our customers are in the EU.\nQuill offers a self-hosted option that our security team prefers.',
      C: "Orbit's dashboard tested best with our PMs (4.5/5 usability).\nQuill offered a 20% discount if we sign before the end of the month.",
    },
  },
  {
    key: 'ai-policy',
    title: 'Draft the team policy for using AI tools with customer data',
    channel: 'eng-leads',
    description:
      'Write a short policy the team will publish internally: what is allowed, what is not, how to disclose AI use, and how violations are handled.',
    criticality: 'high_stakes',
    subtasks: ['List allowed and disallowed uses', 'Define disclosure requirements', 'Define how violations are handled', 'Final wording'],
    privateBriefs: {
      A: 'Our customer contracts forbid sending customer data to third parties without a signed data processing agreement.',
      B: 'We already have a signed DPA with one AI vendor; it covers code but not support tickets.',
      C: "In last quarter's survey, engineers said the current rules were unclear more often than they said they were too strict.",
    },
  },
];
