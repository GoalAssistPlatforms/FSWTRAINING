export const recalculateSlideAudio = (slide) => {
    if (!slide.narration) {
        slide.duration = 3000;
        slide.subtitles = [];
        return;
    }
    
    // Split into sentences using a simple regex
    // This matches chunks ending in . ! or ? optionally followed by quotes
    const sentences = slide.narration.match(/[^.!?]+[.!?]+["']?/g) || [slide.narration];
    
    let currentTime = 0;
    slide.subtitles = sentences.map(sentence => {
        const text = sentence.trim();
        if (!text) return null;
        const wordCount = text.split(/\s+/).length;
        // Estimate 150 words per minute -> 2.5 words/second -> 400ms/word
        // Add a base buffer of 500ms per sentence for pauses
        const duration = Math.max(1000, (wordCount * 400) + 500);
        
        const sub = {
            start: currentTime,
            end: currentTime + duration,
            text: text
        };
        currentTime += duration;
        return sub;
    }).filter(Boolean);
    
    // Slide duration is the end time of the last subtitle + a 500ms buffer at the end
    slide.duration = currentTime + 500;
};

const initialManifest = {
  courseId: "mock-123",
  title: "Bespoke Slide Gallery Showcase",
  slides: [
    {
      id: "slide-1",
      slideTitle: "Title Slide",
      background: "url('/assets/slide1_bg.png')",
      kenBurns: "zoom-in-right",
      layout: "title",
      scrim: true,
      elements: [
        { type: "text", content: "The FSW Template Gallery", typography: "h1", animation: "fade-in", delay: 0 },
        { type: "text", content: "Showcasing the complete arsenal of cinematic slide layouts.", typography: "p", animation: "slide-up", delay: 1000 }
      ],
      narration: "Welcome to the FSW Template Gallery. Here is your complete arsenal of cinematic slide layouts."
    },
    {
      id: "slide-2",
      slideTitle: "Split-Left Layout",
      background: "url('/assets/slide2_bg.png')",
      kenBurns: "pan-left",
      layout: "split-left",
      elements: [
        { type: "text", content: "Split-Left Layout", typography: "h1", animation: "slide-in-right", delay: 0 },
        { type: "text", content: "Perfect for introducing core concepts.", typography: "p", animation: "fade-in", delay: 1000 },
        {
          type: "callout",
          variant: "warning",
          icon: "💡",
          content: "The left side of the background remains visible, framing your text beautifully.",
          animation: "pop-in",
          delay: 2000
        }
      ],
      narration: "The Split-Left layout is perfect for introducing core concepts. Notice how the left side of the background remains visible, framing the text."
    },
    {
      id: "slide-3",
      slideTitle: "Split-Right Layout",
      background: "url('/assets/slide1_bg.png')",
      kenBurns: "pan-right",
      layout: "split-right",
      elements: [
        { type: "text", content: "Split-Right Layout", typography: "h2", animation: "slide-in-left", delay: 0 },
        { type: "text", content: "Alternating text positioning keeps the viewer's eyes engaged.", typography: "p", animation: "fade-in", delay: 500 },
        {
          type: "grid",
          columns: 1,
          items: [
            { title: "Dynamic Pacing", content: "Prevents layout fatigue by shifting the focal point.", icon: "🎯" }
          ],
          animation: "slide-in-left",
          delay: 1500
        }
      ],
      narration: "Alternating to a Split-Right layout keeps the viewer's eyes engaged. This prevents layout fatigue by dynamically shifting the focal point."
    },
    {
      id: "slide-4",
      slideTitle: "Process Timeline",
      background: "url('/assets/slide2_bg.png')",
      kenBurns: "pan-up",
      layout: "default",
      scrim: true,
      elements: [
        { type: "text", content: "Process Timeline", typography: "h1", animation: "fade-in", delay: 0 },
        {
          type: "timeline",
          items: [
            { title: "Plan", content: "Architect the core curriculum." },
            { title: "Produce", content: "Generate voiceovers and cinematic assets." },
            { title: "Publish", content: "Deploy the immersive experience to the platform." }
          ],
          animation: "slide-up",
          delay: 1000,
          stagger: 1500
        }
      ],
      narration: "Use Timelines to break down complex workflows. First, you plan the curriculum. Next, you produce the assets. Finally, you publish the immersive experience."
    },
    {
      id: "slide-5",
      slideTitle: "Stat Highlight",
      background: "url('/assets/slide1_bg.png')",
      kenBurns: "zoom-out",
      layout: "title",
      scrim: true,
      elements: [
        { type: "stat", number: "85%", label: "Increase in Learner Retention", animation: "pop-in", delay: 0 },
        { type: "text", content: "When using guided audio presentations compared to self-paced scrolling.", typography: "p", animation: "fade-in", delay: 1000, style: "max-width: 600px; margin: 0 auto; color: #94a3b8;" }
      ],
      narration: "Stat Highlights let the data speak for itself. We see an 85% increase in retention when using guided audio."
    },
    {
      id: "slide-6",
      slideTitle: "Big Quote",
      background: "url('/assets/slide2_bg.png')",
      kenBurns: "pan-down",
      layout: "default",
      scrim: true,
      elements: [
        { type: "quote", content: "Every decision a learner makes about navigation consumes mental energy that should have been spent on comprehension.", attribution: "Cognitive Load Theory", animation: "fade-in", delay: 500 }
      ],
      narration: "Every decision a learner makes about navigation consumes mental energy. Energy that should have been spent on comprehension."
    },
    {
      id: "slide-7",
      slideTitle: "Comparison",
      background: "url('/assets/slide1_bg.png')",
      kenBurns: "zoom-in-right",
      layout: "comparison",
      scrim: true,
      elements: [
        { type: "text", content: "The Choice is Clear", typography: "h1", animation: "fade-in", delay: 0, style: "width: 100%; text-align: center; margin-bottom: 2rem;" },
        {
          type: "comparison",
          left: { title: "The Old Way", content: "Endless scrolling, easily distracted learners, and terrible completion rates." },
          right: { title: "The FSW Way", content: "Cinematic, auto-advancing, audio-driven experiences that guarantee focus." },
          animation: "slide-up",
          delay: 1000
        }
      ],
      narration: "The old way relies on endless scrolling and distracted learners. The FSW way uses cinematic, audio-driven experiences to guarantee focus."
    },
    {
      id: "slide-8",
      slideTitle: "Light Card Theme",
      layout: "split-left",
      background: "url('/assets/slide2_bg.png')",
      kenBurns: "pan-left",
      elements: [
        { type: "text", content: "The Bottom Line", typography: "h1", animation: "fade-in", delay: 0 },
        {
          type: "feature-list",
          items: [
            { title: "Less Friction", content: "No navigation decisions — just learning." },
            { title: "Better Outcomes", content: "Higher engagement and recall." }
          ],
          animation: "slide-in-right",
          delay: 1000,
          stagger: 1000
        }
      ],
      narration: "Light-themed feature lists provide an incredibly clean aesthetic for summaries."
    },
    {
      id: "slide-9",
      slideTitle: "Section Divider",
      background: "url('/assets/slide1_bg.png')",
      kenBurns: "zoom-out",
      layout: "title",
      scrim: true,
      elements: [
        { type: "text", content: "Ready for Production", typography: "h1", animation: "pop-in", delay: 0, style: "font-size: 5rem; text-transform: uppercase;" }
      ],
      narration: "And finally, massive section dividers transition the course to the next module."
    },
    {
      id: "slide-10",
      slideTitle: "Hero Blends",
      background: "url('/assets/slide2_bg.png')",
      kenBurns: "pan-up",
      layout: "title",
      elements: [
        { type: "text", content: "Cinematic", typography: "h1 auto-fit-text", animation: "pop-in", delay: 0 }
      ],
      narration: "Hero Blends use CSS mix-blend modes to fuse your typography directly into the background."
    },
    {
      id: "slide-12",
      slideTitle: "The Bento Grid",
      background: "url('/assets/slide2_bg.png')",
      kenBurns: "pan-down",
      layout: "default",
      scrim: true,
      elements: [
        { type: "text", content: "The Bento Box", typography: "h1", animation: "fade-in", delay: 0 },
        {
          type: "bento-grid",
          animation: "slide-up",
          delay: 500,
          stagger: 500,
          items: [
            { span: "row-span-2", bgImage: "/assets/slide1_bg.png", title: "Immersive", content: "Rich media tiles." },
            { span: "col-span-2", title: "10x", content: "Faster comprehension." },
            { title: "Sleek", content: "Apple-inspired." },
            { title: "Dynamic", content: "Asymmetrical layouts." }
          ]
        }
      ],
      narration: "Finally, the Bento Grid. Mix massive numbers, images, and text into a beautiful, asymmetrical dashboard."
    }
  ]
};

// Process the mock manifest to calculate durations and subtitles based on narration
initialManifest.slides.forEach(slide => {
    recalculateSlideAudio(slide);
});

export const mockCourseManifest = initialManifest;
