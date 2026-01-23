/**
 * AI Element Registry
 * Defines the "Stack" of interactive AI modules available for course generation.
 * 
 * Each element includes:
 * - id: unique identifier for the markdown block (e.g. ```ai-tone)
 * - name: Human readable name
 * - context: Instructions for the AI on WHEN to use this element.
 * - syntax: Example JSON structure for the AI to generate.
 */

export const AI_REGISTRY = [
  {
    id: 'chart',
    name: 'Data Visualization',
    context: "Use when the lesson content involves specific statistics, financial data, trends, or quantitative comparisons that need visualizing.",
    syntax: `\`\`\`chart
{
  "type": "bar", // or "line", "pie", "doughnut"
  "data": {
    "labels": ["Branch A", "Branch B"],
    "datasets": [{ "label": "Sales (£)", "data": [12000, 19500], "backgroundColor": ["#ff6384", "#36a2eb"] }]
  },
  "options": { "plugins": { "title": { "display": true, "text": "Q3 Sales Performance" } } }
}
\`\`\``
  },
  {
    id: 'ai-tone',
    name: 'Tone & Communication Coach',
    context: "Use when the lesson focuses on soft skills, writing emails, diplomatic communication, or delivering bad news.",
    syntax: `\`\`\`ai-tone
{ 
  "targetScore": 80, 
  "context": "Draft a polite email to a supplier explaining that we cannot accept their price increase on copper piping.",
  "initialText": "" // Optional: prefill text
}
\`\`\``
  },
  {
    id: 'ai-dojo',
    name: 'Roleplay Simulation (Dojo)',
    context: "Use for complex interpersonal scenarios, conflict resolution, sales negotiations, or management conversations where conversation practice is key.",
    syntax: `\`\`\`ai-dojo
{ 
  "scenarioId": "unique_id_for_memory", 
  "intro": "You are the Branch Manager. Your delivery driver has arrived late for the morning run again. Start the conversation.",
  "role": "Delivery Driver", // Who the AI plays
  "objective": "Get them to understand the impact on our customers and commit to a solution"
}
\`\`\``
  },
  {
    id: 'ai-redline',
    name: 'Document Inspector (Redline)',
    context: "Use for compliance, legal, or policy training where the user must identify errors, risks, or non-compliant clauses in a text sample.",
    syntax: `\`\`\`ai-redline
{
  "title": "Supplier Terms for Refrigerant Delivery",
  "text": "The supplier accepts no liability for leakage during transit...",
  "mistakes": [
    { "start": 30, "end": 65, "feedback": "We cannot accept liability for goods not yet received. Request DDP terms." } 
  ]
}
\`\`\``
  },
  {
    id: 'ai-debate',
    name: 'Socratic Debate',
    context: "Use for ethics, critical thinking, or decision making where there is no single right answer, but the user must defend their position against an opposing view.",
    syntax: `\`\`\`ai-debate
{
  "topic": "Should we prioritise a 'rush' order for a friend's company over a long-standing contract client?",
  "aiSide": "devil_advocate" // AI will argue against whatever the user says
}
\`\`\``
  },
  {
    id: 'ai-swipe',
    name: 'Decision Swipe Game',
    context: "Use for rapid-fire reinforcement of binary choices (Safe/Risky, Accept/Reject, True/False). High gamification.",
    syntax: `\`\`\`ai-swipe
{
  "title": "FSW Ethics: Gift Acceptance",
  "cards": [
    { "text": "A supplier offers you tickets to the F1 Grand Prix.", "isCorrect": false, "feedback": "This is likely over our gift limit policy." },
    { "text": "A branded pen worth £2.", "isCorrect": true, "feedback": "Nominal value items are acceptable." }
  ],
  "labels": { "left": "Reject", "right": "Accept" }
}
\`\`\``
  }
]
