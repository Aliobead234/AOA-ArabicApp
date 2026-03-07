export interface FlashcardWord {
  id: string;
  word: string;
  definition: string;
  partOfSpeech: string;
  phonetic: string;
  example: string;
}

export interface FlashcardCategory {
  id: string;
  name: string;
  type: "topic" | "root" | "level";
  image: string;
  wordCount: number;
}

export const words: FlashcardWord[] = [
  {
    id: "w1",
    word: "Ephemeral",
    definition: "Lasting for a very short time.",
    partOfSpeech: "adjective",
    phonetic: "/ɪˈfem.ər.əl/",
    example: "The rainbow was beautiful but ephemeral.",
  },
  {
    id: "w2",
    word: "Resilient",
    definition: "Able to recover quickly from difficulties.",
    partOfSpeech: "adjective",
    phonetic: "/rɪˈzɪl.jənt/",
    example: "She stayed resilient after the setback.",
  },
  {
    id: "w3",
    word: "Meticulous",
    definition: "Showing great attention to detail.",
    partOfSpeech: "adjective",
    phonetic: "/məˈtɪk.jə.ləs/",
    example: "He kept meticulous notes during class.",
  },
  {
    id: "w4",
    word: "Ubiquitous",
    definition: "Present or found everywhere.",
    partOfSpeech: "adjective",
    phonetic: "/juːˈbɪk.wɪ.təs/",
    example: "Smartphones are ubiquitous today.",
  },
  {
    id: "w5",
    word: "Ambiguous",
    definition: "Open to more than one interpretation.",
    partOfSpeech: "adjective",
    phonetic: "/æmˈbɪɡ.ju.əs/",
    example: "The instructions were ambiguous and confusing.",
  },
  {
    id: "w6",
    word: "Pragmatic",
    definition: "Dealing with things realistically and practically.",
    partOfSpeech: "adjective",
    phonetic: "/præɡˈmæt.ɪk/",
    example: "They took a pragmatic approach to the issue.",
  },
  {
    id: "w7",
    word: "Novel",
    definition: "New, original, and interesting.",
    partOfSpeech: "adjective",
    phonetic: "/ˈnɒv.əl/",
    example: "Her novel idea solved the problem.",
  },
  {
    id: "w8",
    word: "Convey",
    definition: "To communicate or make known.",
    partOfSpeech: "verb",
    phonetic: "/kənˈveɪ/",
    example: "The chart conveys the trend clearly.",
  },
];

export const categories: FlashcardCategory[] = [
  {
    id: "c1",
    name: "Vocabulary",
    type: "topic",
    image: "/assets/2ba30e58edf3ccfda41166fc36258ccf3f4f76f1.png",
    wordCount: 120,
  },
  {
    id: "c2",
    name: "Synonyms",
    type: "topic",
    image: "/assets/9eeab26df9b6053fe15b3fcf6e6f40f05ad27222.png",
    wordCount: 95,
  },
  {
    id: "c3",
    name: "Antonyms",
    type: "topic",
    image: "/assets/e500e6d028446226a1ca5f40b2b0d1db3205632a.png",
    wordCount: 90,
  },
  {
    id: "c4",
    name: "Definitions",
    type: "topic",
    image: "/assets/29c5bab39e327da86422f103678424e250ff4c3c.png",
    wordCount: 88,
  },
  {
    id: "c5",
    name: "Latin Roots",
    type: "root",
    image: "/assets/8049752b65600b9fb880a096268ba27881ca9d1d.png",
    wordCount: 70,
  },
  {
    id: "c6",
    name: "Greek Roots",
    type: "root",
    image: "/assets/53c04639ad24021b57ffca2fbbd4b35fd5ce4238.png",
    wordCount: 64,
  },
  {
    id: "c7",
    name: "Beginner",
    type: "level",
    image: "/assets/079a1c4c9668718e32bee5519fef37e1e05b62c2.png",
    wordCount: 150,
  },
  {
    id: "c8",
    name: "Advanced",
    type: "level",
    image: "/assets/86e816d99cfe874ed0ee04249c4240b97242a226.png",
    wordCount: 75,
  },
];
