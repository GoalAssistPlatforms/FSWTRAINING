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
    "labels": ["Category A", "Category B"],
    "datasets": [{ "label": "Metric", "data": [10, 20], "backgroundColor": ["#ff6384", "#36a2eb"] }]
  },
  "options": { "plugins": { "title": { "display": true, "text": "Chart Title" } } }
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
  "context": "Draft a polite decline email to a vendor.",
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
  "intro": "You are the manager. Your employee is late again. Start the conversation.",
  "role": "Employee", // Who the AI plays
  "objective": "Get them to admit the issue"
}
\`\`\``
    },
    {
        id: 'ai-redline',
        name: 'Document Inspector (Redline)',
        context: "Use for compliance, legal, or policy training where the user must identify errors, risks, or non-compliant clauses in a text sample.",
        syntax: `\`\`\`ai-redline
{
  "title": "Vendor Contract Review",
  "text": "The vendor may terminate this agreement immediately without cause...",
  "mistakes": [
    { "start": 30, "end": 65, "feedback": "Termination without cause is too risky. Request 30 days notice." } 
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
  "topic": "Is it ethical to pay a facilitation payment to get equipment out of customs?",
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
  "title": "Gift Acceptance Policy",
  "cards": [
    { "text": "A client offers you a paid trip to Hawaii.", "isCorrect": false, "feedback": "This is a bribe." },
    { "text": "A branded pen worth $2.", "isCorrect": true, "feedback": "Nominal value items are acceptable." }
  ],
  "labels": { "left": "Reject", "right": "Accept" }
}
\`\`\``
    }
]
