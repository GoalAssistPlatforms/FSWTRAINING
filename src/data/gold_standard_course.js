export const goldCourse = {
    title: "Safe Manual Handling Masterclass",
    description: "This comprehensive course equips learners with the knowledge and skills necessary to handle materials safely, reducing workplace injuries and improving productivity. You will master the LITE principles and understand the biomechanics of lifting.",
    video_query: "warehouse safety",
    video_bg_url: "https://videos.pexels.com/video-files/852292/852292-hd_1920_1080_30fps.mp4",
    thumbnail_url: "https://images.vexels.com/media/users/3/269399/isolated/preview/6a6610dd567845ba0089e2292dc2834b-man-lifting-heavy-box-character.png",
    modules: [
        {
            title: "Module 1: The Foundations of Safety",
            slides_prompt: "Create a 6-slide presentation on the statistics of workplace back injuries and the anatomy of the spine. Professional, corporate safety style.",
            slides_url: null, // AI generator will fill this if API key exists
            lessons: [
                {
                    title: "1.1 The Silent Epidemic",
                    audio_summary: "Welcome to the Masterclass. Did you know that manual handling accounts for over 30% of all workplace injuries? In this lesson, we uncover the hidden costs of unsafe lifting and why your spine is more fragile than you think.",
                    content: `# The Silent Epidemic

Manual handling accidents are not just minor inconveniences; they are a leading cause of long-term disability in the UK workforce.

## The Scope of the Problem

According to the **HSE (Health and Safety Executive)**, manual handling causes over a third of all workplace injuries. These aren't just one-off incidents; they are often cumulative trauma disorders that build up over years of poor practice.

### Key Statistics
*   **30%** of all reportable accidents are handling-related.
*   **8.9 million** working days are lost annually due to musculoskeletal disorders.
*   **£500 million** estimated cost to UK society per year.

\`\`\`mermaid
pie title MSD Causes
    "Manual Handling": 40
    "Repetitive Action": 20
    "Awkward Posture": 20
    "Other": 20
\`\`\`

## Anatomy of a Lift

To understand why we get hurt, we must understand the spine. The spine is an engineering marvel, designed to support weight, but only when aligned correctly.

The **Intervertebral Discs** act as shock absorbers. When you bend your back to lift, you compress the front of these discs, pushing the fluid nucleus backward—potentially onto a nerve root. This is the classic "slipped disc" mechanism.

> [!IMPORTANT]
> The further away the load is from your body, the greater the lever effect on your lower back. A 10kg compressor held at arm's length can exert 100kg of pressure on your L5/S1 vertebrae.

\`\`\`ai-tone
Please analyse this email draft to my supervisor regarding a back pain incident I witnessed: hey boss, saw dave from the trade counter hurt his back moving that big compressor. maybe we should get a trolley?
\`\`\`
`,
                    quiz: [
                        {
                            question: "What percentage of workplace injuries are attributed to manual handling?",
                            options: ["10%", "30%", "50%", "75%"],
                            correct_index: 1,
                            feedback: "Correct. Approximately 30% of all reportable injuries are due to manual handling."
                        },
                        {
                            question: "Which part of the spine acts as the primary shock absorber?",
                            options: ["The Spinal Cord", "The Intervertebral Discs", "The Sciatic Nerve", "The Facet Joints"],
                            correct_index: 1,
                            feedback: "Correct. The discs cushion the vertebrae. Bending compresses them unevenly, leading to injury."
                        }
                    ]
                },
                {
                    title: "1.2 The Legal Framework",
                    audio_summary: "It's not just about common sense; it's the law. In this lesson, we review the Manual Handling Operations Regulations 1992 and your specific duties as an employee.",
                    content: `# The Law and You

The primary legislation governing this area is the **Manual Handling Operations Regulations 1992 (MHOR)**.

## The Hierarchy of Control

The regulations do not just say "lift safely"; they set out a hierarchy of measures that employers—and you—must follow.

1.  **AVOID**: Can the lifting operation be avoided entirely? (e.g., using a conveyor belt or automation).
2.  **ASSESS**: If it cannot be avoided, assess the risk. (Is the load heavy? Is it bulky? Is the floor slippery?).
3.  **REDUCE**: Reduce the risk of injury. (e.g., split the load into smaller packages, use a hoist).

\`\`\`mermaid
graph TD;
    A[Start Task] --> B{Can it be Avoided?};
    B -- Yes --> C[Use Automation/Conveyors];
    B -- No --> D{Risk Assessment};
    D --> E[Reduce Risk];
    E --> F[Training & Equipment];
    F --> G[Perform Task Safely];
\`\`\`

## Employee Duties

You have a duty too. You must:
*   Follow the systems of work laid down by your employer.
*   Make proper use of equipment provided.
*   Cooperate with your employer on health and safety matters.
*   Inform your employer of any hazardous handling activities.

\`\`\`ai-redline
{
  "title": "Incident Report - 12/04/2024",
  "text": "I noticed the 'heavy' warning labels were missing from the new shipment boxes. I decided to lift them anyway because the job needed to get done quickly. I didn't check the weight but assumed I could handle it. After lifting the third box, I felt a twinge but ignored it and finished the shift.",
  "mistakes": [
    { "start": 98, "end": 126, "feedback": "Never prioritize speed over safety. If labels are missing, assessing the load is critical." },
    { "start": 145, "end": 172, "feedback": "Never assume. Check the weight by rocking the unit first." },
    { "start": 236, "end": 269, "feedback": "Ignoring an injury can lead to long-term damage. Report immediately and stop the activity." }
  ]
}
\`\`\`
`,
                    quiz: [
                        {
                            question: "What is the first step in the Hierarchy of Control?",
                            options: ["Assess", "Reduce", "Avoid", "Train"],
                            correct_index: 2,
                            feedback: "Correct. The first priority is always to AVOID the hazardous manual handling operation entirely if possible."
                        },
                        {
                            question: "Which regulation governs manual handling in the UK?",
                            options: ["Health & Safety at Work Act 1974", "MHOR 1992", "RIDDOR 2013", "COSHH 2002"],
                            correct_index: 1,
                            feedback: "Correct. MHOR 1992 specifically covers manual handling operations."
                        }
                    ]
                }
            ]
        },
        {
            title: "Module 2: Advanced Techniques",
            slides_prompt: "Create a 5-slide presentation demonstrating the LITE principle (Load, Individual, Task, Environment) and the correct squat lift technique.",
            slides_url: null,
            lessons: [
                {
                    title: "2.1 The LITE Principle",
                    audio_summary: "Before you lift, you must think. We use the acronym LITE: Load, Individual, Task, and Environment. Let's break down how to assess any lift in seconds.",
                    content: `# The LITE Principle

A dynamic risk assessment is required before every lift. Remember **LITE**.

## L - Load
*   **Heavy?** Is it over 20-25kg?
*   **Bulky/Unwieldy?** Will it block your vision?
*   **Unstable?** Are contents shifting (liquids/powders)?
*   **Sharp/Hot?** Do you need PPE?

## I - Individual
*   **Capability:** Are you strong enough? Pregnant? Injured?
*   **Training:** Have you been trained for this specific lift?

## T - Task
*   **Distance:** How far are you carrying it?
*   **Twisting:** Will you need to twist your trunk? (Avoid this!)
*   **Height:** Are you lifting from the floor or lowering from shoulder height?

## E - Environment
*   **Space:** Is there room to move?
*   **Floor:** Is it slippery, uneven, or cluttered?
*   **Light:** Can you see clearly?

\`\`\`ai-debate
{
  "topic": "Should individual capability limits (e.g., 25kg for men) be strictly enforced or used as guidelines?",
  "aiSide": "devil_advocate"
}
\`\`\`
`,
                    quiz: [
                        {
                            question: "In LITE, what does 'T' stand for?",
                            options: ["Time", "Task", "Team", "Training"],
                            correct_index: 1,
                            feedback: "Correct. T stands for Task (e.g., twisting, stooping, reaching)."
                        },
                        {
                            question: "If a load is shifting (e.g., liquid), which category of LITE does this fall under?",
                            options: ["Load", "Individual", "Task", "Environment"],
                            correct_index: 0,
                            feedback: "Correct. The stability of the contents is a property of the Load."
                        }
                    ]
                },
                {
                    title: "2.2 The Perfect Lift",
                    audio_summary: "Now, the mechanics. Feet apart, knees bent, back straight. In this lesson, we practice the semi-squat lift, your primary defense against injury.",
                    content: `# Execution: The Semi-Squat Lift

The goal is to use the powerful leg muscles (quadriceps/glutes) rather than the weaker, vulnerable back muscles.

## The 6 Steps to Safety

1.  **Stop and Think**: Plan the lift. Where is it going?
2.  **Position the Feet**: Shoulder-width apart. Leading leg slightly forward for balance.
3.  **Adopt a Good Posture**: Bend the knees. Keep the back naturally straight (but not vertical). Lean forward from the hips.
4.  **Get a Firm Grip**: Hug the load closer to the body. Use handles if available.
5.  **Lift Smoothly**: Drive up with the legs. Do not jerk.
6.  **Move the Feet**: To turn, move your feet. **NEVER TWIST** the torso while lifting.

### Common Mistakes
*   **Jerking**: Causes sudden strain.
*   **Twisting**: The number one cause of disc injury.
*   **Over-reaching**: Increases leverage on the spine.

\`\`\`ai-swipe
{
  "title": "Safe vs Unsafe Practices",
  "cards": [
    { "text": "Twisting at the waist to place a unit on the racking.", "isCorrect": false },
    { "text": "Keeping the load close to the waist.", "isCorrect": true },
    { "text": "Lifting a 40kg bag alone without asking for help.", "isCorrect": false },
    { "text": "Checking the path for trip hazards before lifting.", "isCorrect": true },
    { "text": "Bending your back to pick up a screwdriver.", "isCorrect": false }
  ],
  "labels": { "left": "Unsafe", "right": "Safe" }
}
\`\`\`
`,
                    quiz: [
                        {
                            question: "When turning with a load, you should:",
                            options: ["Twist at the waist", "Move your feet", "Lean backwards", "Swing the load"],
                            correct_index: 1,
                            feedback: "Correct. Always move your feet to turn. Never twist the spine while under load."
                        },
                        {
                            question: "Where should the load be held for maximum stability?",
                            options: ["At arm's length", "Close to the waist", "Above shoulder height", "Behind the head"],
                            correct_index: 1,
                            feedback: "Correct. Keeping the center of gravity close to the body reduces strain."
                        }
                    ]
                }
            ]
        }
    ]
};
