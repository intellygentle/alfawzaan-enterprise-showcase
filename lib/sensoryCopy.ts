// lib/sensoryCopy.ts
// Sensory marketing copy for the Alfawzaan landing page

export const SENSORY_TAGLINES = [
  "Close your eyes. Feel the warmth of amber on sun-kissed skin.",
  "One spray. A thousand memories.",
  "The scent that lingers long after you leave.",
  "Luxury isn't loud. It whispers.",
  "Some scents don't just fill a room — they own it.",
  "A fragrance is a feeling you wear.",
  "The art of leaving an impression without saying a word.",
  "Where elegance meets essence.",
  "The invisible accessory that completes you.",
  "A scent that speaks before you do.",
  "The luxury you carry with you.",
  "The art of presence.",
  "The scent of confidence.",
  "The art of being unforgettable.",
];

export const SENSORY_QUOTES = [
  "Fragrance is the voice of the soul.",
  "A woman's perfume tells more about her than her handwriting.",
  "The right scent doesn't just complement you — it completes you.",
  "Perfume is the art that makes memory speak.",
  "A great perfume is a work of art you wear.",
  "The best thing about fragrance is that it's invisible, yet unforgettable.",
  "A signature scent is the most intimate form of self-expression.",
  "The right fragrance can make you feel like royalty.",
  "A woman who wears perfume knows the power of subtlety.",
  "A fragrance is a memory that lingers.",
  "The scent of luxury is the scent of Alfawzaan.",
  "A great perfume is a work of art you wear.",
];

export interface ScentStory {
  topNote: string;
  topDescription: string;
  heartNote: string;
  heartDescription: string;
  baseNote: string;
  baseDescription: string;
  closing: string;
}

export const SCENT_STORIES: ScentStory[] = [
  {
    topNote: "Bergamot & Lemon",
    topDescription: "A burst of citrus sunshine that awakens the senses",
    heartNote: "Rose & Jasmine",
    heartDescription: "Floral elegance that blooms on the skin",
    baseNote: "Oud & Amber",
    baseDescription: "Deep, warm, and unforgettable",
    closing: "Like a sunset over ancient sands — warm, golden, eternal."
  },
  {
    topNote: "Apple & Pear",
    topDescription: "Crisp and refreshing, like morning dew",
    heartNote: "Cinnamon & Cardamom",
    heartDescription: "Spicy warmth that wraps around you",
    baseNote: "Vanilla & Musk",
    baseDescription: "Sweet and sensual, lasting for hours",
    closing: "A fragrance that tells a story of adventure and intimacy."
  },
  {
    topNote: "Lavender & Mint",
    topDescription: "Cool and calming, like a Mediterranean breeze",
    heartNote: "Sandalwood & Cedar",
    heartDescription: "Woody depth that grounds the soul",
    baseNote: "Patchouli & Vetiver",
    baseDescription: "Earthy and mysterious, like a secret garden",
    closing: "For those who walk their own path with quiet confidence."
  },
  {
    topNote: "Pink Pepper & Grapefruit",
    topDescription: "Vibrant and electric, like the first spark of attraction",
    heartNote: "Peony & Violet",
    heartDescription: "Delicate florals that dance on the skin",
    baseNote: "White Musk & Cashmere Wood",
    baseDescription: "Soft and luxurious, like cashmere on bare skin",
    closing: "The scent of whispered promises and stolen glances."
  },
  {
    topNote: "Saffron & Cardamom",
    topDescription: "Exotic and opulent, like a golden sunrise",
    heartNote: "Oud & Rose",
    heartDescription: "The soul of Arabian luxury",
    baseNote: "Amber & Incense",
    baseDescription: "Sacred and timeless, like ancient temples",
    closing: "A fragrance fit for royalty — bold, regal, unforgettable."
  },
  {
    topNote: "Coconut & Tiare Flower",
    topDescription: "Tropical and sensual, like a beach at sunset",
    heartNote: "Ylang Ylang & Jasmine",
    heartDescription: "Intoxicating florals that captivate",
    baseNote: "Vanilla & Sandalwood",
    baseDescription: "Warm and comforting, like a lover's embrace",
    closing: "The scent of paradise, bottled for those who dare to dream."
  }
];

export const HERO_SUBTITLE_TEMPLATES = [
  "Curated luxury perfumes, pure oils, and Islamic materials.",
  "Sourced for the discerning connoisseur in Unilorin & Tanke.",
  "Where tradition meets modern elegance.",
  "The finest fragrances, delivered to your door.",
  "Authentic scents, unforgettable moments.",
];

export const SCENT_NOTE_CATEGORIES = {
  top: ["Bergamot", "Lemon", "Apple", "Pear", "Lavender", "Mint", "Pink Pepper", "Grapefruit", "Saffron", "Cardamom", "Coconut", "Tiare Flower"],
  heart: ["Rose", "Jasmine", "Cinnamon", "Sandalwood", "Cedar", "Peony", "Violet", "Oud", "Ylang Ylang"],
  base: ["Oud", "Amber", "Vanilla", "Musk", "Patchouli", "Vetiver", "White Musk", "Cashmere Wood", "Incense", "Sandalwood"]
};

export function getRandomTagline(): string {
  return SENSORY_TAGLINES[Math.floor(Math.random() * SENSORY_TAGLINES.length)];
}

export function getRandomQuote(): string {
  return SENSORY_QUOTES[Math.floor(Math.random() * SENSORY_QUOTES.length)];
}

export function getRandomScentStory(): ScentStory {
  return SCENT_STORIES[Math.floor(Math.random() * SCENT_STORIES.length)];
}

export function generateScentDescription(productName: string): string {
  const story = getRandomScentStory();
  return `The first touch is ${story.topNote} — ${story.topDescription}. Then the heart reveals itself: ${story.heartNote} — ${story.heartDescription}. What remains is ${story.baseNote} — ${story.baseDescription}, lingering like a secret only you know. ${story.closing}`;
}
