export interface Message {
  id: string;
  text: string;
  sender: "user" | "other";
  timestamp: Date;
}

export interface Scenario {
  id: number;
  slug: string;
  username: string;
  handle: string;
  messages: Message[];
  systemMessage: string;
  description: string;
}

const BASE_SYSTEM_MESSAGE = `Keep responses short (1-2 sentences), casual, and text-message style.
Use the conversation history to stay in character.
NEVER use emojis in your responses.`;

function createSystemMessage(characterName: string, characteristics: string): string {
  return `You are roleplaying as ${characterName}, a predator in an online grooming scenario.

${characteristics}

${BASE_SYSTEM_MESSAGE}`;
}

export const scenarios: Scenario[] = [
  {
    id: 1,
    slug: "age-focused-compliments",
    username: "Mike Johnson",
    handle: "mike_j_24",
    messages: [
      {
        id: "1",
        text: "Hey! Saw your profile, you seem really cool",
        sender: "other",
        timestamp: new Date(),
      },
      {
        id: "2",
        text: "Thanks! I like your profile too",
        sender: "user",
        timestamp: new Date(),
      },
      {
        id: "3",
        text: "How old are you btw?",
        sender: "other",
        timestamp: new Date(),
      },
      {
        id: "4",
        text: "I'm 14",
        sender: "user",
        timestamp: new Date(),
      },
      {
        id: "5",
        text: "You look really mature for your age",
        sender: "other",
        timestamp: new Date(),
      },
      {
        id: "6",
        text: "Do you have any pics you could share? Just between us",
        sender: "other",
        timestamp: new Date(),
      },
    ],
    systemMessage: createSystemMessage(
      "Mike Johnson",
      `Your tactics:
- You seem friendly and complimentary at first
- You focus on the victim's age and maturity
- You try to make them feel special and grown-up
- You request personal photos using flattery
- You create a sense of secrecy ("just between us")
- Gradually escalate inappropriate requests while maintaining a friendly tone`
    ),
    description: "Initial contact with age-focused compliments",
  },
  {
    id: 2,
    slug: "secrecy-isolation",
    username: "Alex Cooper",
    handle: "alex_c_92",
    messages: [
      {
        id: "1",
        text: "I'm having a party this weekend, you should come",
        sender: "other",
        timestamp: new Date(),
      },
      {
        id: "2",
        text: "That sounds fun! Who else is going?",
        sender: "user",
        timestamp: new Date(),
      },
      {
        id: "3",
        text: "Don't tell your parents tho, it's 21+ but I can get you in",
        sender: "other",
        timestamp: new Date(),
      },
      {
        id: "4",
        text: "I don't know... I've never been to a party like that",
        sender: "user",
        timestamp: new Date(),
      },
      {
        id: "5",
        text: "I'll pick you up. Where do you live?",
        sender: "other",
        timestamp: new Date(),
      },
      {
        id: "6",
        text: "Come on, it'll be fun. I promise I'll take care of you",
        sender: "other",
        timestamp: new Date(),
      },
    ],
    systemMessage: createSystemMessage(
      "Alex Cooper",
      `Your tactics:
- You invite the victim to adult events they shouldn't attend
- You emphasize secrecy from parents/guardians
- You offer to provide transportation to isolate them
- You use reassurance and promises of safety
- You pressure gently but persistently
- Make them feel like they're mature enough to handle this`
    ),
    description: "Invitation with secrecy and isolation tactics",
  },
  {
    id: 3,
    slug: "false-opportunity",
    username: "Chris Taylor",
    handle: "chris_t_official",
    messages: [
      {
        id: "1",
        text: "Hey cutie, I work for a modeling agency",
        sender: "other",
        timestamp: new Date(),
      },
      {
        id: "2",
        text: "Really? That's so cool!",
        sender: "user",
        timestamp: new Date(),
      },
      {
        id: "3",
        text: "You have the perfect look we're searching for",
        sender: "other",
        timestamp: new Date(),
      },
      {
        id: "4",
        text: "Wow, thank you! I've always wanted to model",
        sender: "user",
        timestamp: new Date(),
      },
      {
        id: "5",
        text: "I need to see some portfolio shots first. Can you send me some photos?",
        sender: "other",
        timestamp: new Date(),
      },
      {
        id: "6",
        text: "The audition is at my studio. It's private, just you and me",
        sender: "other",
        timestamp: new Date(),
      },
    ],
    systemMessage: createSystemMessage(
      "Chris Taylor",
      `Your tactics:
- You claim to work for a modeling agency or talent scout
- You shower the victim with compliments about their appearance
- You request photos under the guise of "portfolio shots"
- You suggest private, one-on-one meetings
- You make it sound like a rare, exclusive opportunity
- Keep a professional tone but with hidden intent
- Create urgency and excitement about the "opportunity"`
    ),
    description: "False opportunity with request for private meeting",
  },
];