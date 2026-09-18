import type { LoCoMoItem } from "./types";

/** Tiny LoCoMo-shaped fixture for unit tests (not locomo10 scores). */
export function locomoFixtureItem(): LoCoMoItem {
  return {
    sample_id: "conv-fixture",
    qa: [
      {
        question: "What fruit did Ada eat?",
        answer: "mango",
        evidence: ["D1:2"],
        category: 4,
      },
      {
        question: "When did Beau mention the mango?",
        answer: "8 May 2023",
        evidence: ["D1:2"],
        category: 2,
      },
      {
        question: "What did Ada eat after greeting Beau?",
        answer: "mango",
        evidence: ["D1:1", "D1:2"],
        category: 1,
      },
      {
        question: "Would a mango count as tropical fruit Ada ate?",
        answer: "yes",
        evidence: ["D1:2"],
        category: 3,
      },
      {
        question: "What is Ada's dog named?",
        answer: "No mention of a dog name",
        evidence: ["D2:1"],
        category: 5,
        adversarial_answer: "Rex",
      },
      {
        question: "What did they both say in the first session?",
        answer: "greeting and mango",
        evidence: ["D1:1; D1:2"],
        category: 1,
      },
      {
        question: "Broken evidence id",
        answer: "unknown",
        evidence: ["D99:1"],
        category: 4,
      },
      {
        question: "Empty evidence world knowledge",
        answer: "unknown",
        evidence: [],
        category: 3,
      },
    ],
    conversation: {
      speaker_a: "Ada",
      speaker_b: "Beau",
      session_1_date_time: "1:00 pm on 8 May, 2023",
      session_1: [
        { speaker: "Ada", dia_id: "D1:1", text: "Hey Beau!" },
        {
          speaker: "Beau",
          dia_id: "D1:2",
          text: "Ada ate a mango this morning.",
        },
      ],
      session_2_date_time: "2:00 pm on 9 May, 2023",
      session_2: [
        {
          speaker: "Ada",
          dia_id: "D2:1",
          text: "I walked past a dog today.",
        },
      ],
    },
  };
}
