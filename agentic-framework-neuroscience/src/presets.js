// Example tasks. The hidden-profile task gives each pair different private facts,
// so the best answer only emerges if pairs move information from private to
// global memory.
export const PRESETS = [
  {
    key: 'hidden-profile',
    title: 'Pick a host city for a regional sports tournament',
    description:
      'Choose one of Riverton, Lakeside, or Hillcrest. Each pair holds different facts. Agree on one city and a one-paragraph justification.',
    criticality: 'consequential',
    subtasks: ['Agree on decision criteria', 'Pool what each pair knows', 'Score each city', 'Write the justification'],
    privateBriefs: {
      A: 'Riverton has the largest stadium (40k seats).\nLakeside hotels are 30% cheaper than average.\nHillcrest has a new rail line to the airport.',
      B: 'Riverton stadium is booked for renovation during the tournament window.\nLakeside has two venues that meet league standards.\nHillcrest hotel capacity is only 2,000 rooms.',
      C: "Riverton's city council offered a $2M subsidy.\nLakeside transit runs 24/7 during events.\nHillcrest had weather cancellations three of the last five years.",
    },
  },
  {
    key: 'launch-plan',
    title: 'Plan the launch week for a student-built study app',
    description: 'Produce a day-by-day plan for launch week with owners, channels, and one success metric per day.',
    criticality: 'operational',
    subtasks: ['Pick the launch channels', 'Draft the day-by-day plan', 'Assign owners', 'Choose success metrics'],
    privateBriefs: {
      A: 'Our pair can reach 3 campus Discord servers (about 4,000 students).',
      B: 'Budget is $300 total. App store review takes about 2 days.',
      C: 'Last semester a similar launch flopped because it went out during midterms.',
    },
  },
  {
    key: 'policy-memo',
    title: 'Draft a lab policy on using AI tools for graded work',
    description: 'Write a short policy the lab will publish to students. It must be clear about what is allowed and how violations are handled.',
    criticality: 'high_stakes',
    subtasks: ['List allowed and disallowed uses', 'Define disclosure requirements', 'Define how violations are handled', 'Final wording'],
    privateBriefs: {
      A: 'The university honor code already forbids undisclosed outside help on exams.',
      B: 'Two other labs in the department allow AI for code but not for written reports.',
      C: 'Students in last term\'s survey said rules were unclear more than they said rules were too strict.',
    },
  },
];
