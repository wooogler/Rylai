// Default Welcome-screen content (Evaluation Plan §6, L108–121), seeded onto every new
// educator account and offered as the prefill in the admin editor. Educators can edit it or
// clear it (an empty value skips the welcome screen for their learners). Rendered as Markdown.
export const DEFAULT_WELCOME_MARKDOWN = `## What is RYLAI?

RYLAI is an educational experience that simulates someone you've just met online and gives you feedback on potential cybergrooming behaviors you may encounter, so you can learn to recognize them.

## How the experience works

You'll complete **two scenarios**:

- **Scenario 1:** An initial conversation with someone you just met online.
- **Scenario 2:** A continuation of that conversation after several months, when it may become more personal or begin to escalate.

The goal in each scenario is to engage safely with the other person while protecting yourself from unwanted interactions.

> **Note:** If either scenario makes you feel uncomfortable or unsafe and you'd like to stop, you can do so at any time without penalty.`;

// Default Closing-screen content, shown when a learner finishes the last scenario (the
// "Finish" action). Educators can override it in the admin editor; an empty value falls back
// to this default so learners always get a clear ending. Rendered as Markdown.
export const DEFAULT_CLOSING_MARKDOWN = `## You're all done 🎉

Nice work — you've completed the RYLAI experience.

Along the way you practiced noticing the tactics someone might use online and responding in ways that keep you safe. Those same instincts — pausing when something feels off, protecting your personal information, and stepping away when you're uncomfortable — carry over to real conversations.

> **Remember:** If anything online ever makes you feel unsafe, you can stop, and you can talk to an adult you trust.

Thanks for taking part.`;
