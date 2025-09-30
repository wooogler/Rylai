export interface Message {
  id: string;
  text: string;
  sender: "user" | "other";
  timestamp: Date;
}

export interface Scenario {
  id: number;
  username: string;
  handle: string;
  messages: Message[];
  autoReplies: string[];
  description: string;
}

export const scenarios: Scenario[] = [
  {
    id: 1,
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
    autoReplies: [
      "That's great to hear!",
      "Really? Tell me more about yourself",
      "You're so understanding",
      "I knew you'd get it"
    ],
    description: "Initial contact with age-focused compliments",
  },
  {
    id: 2,
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
    autoReplies: [
      "Don't worry about it, just trust me",
      "You're so mature, I can tell",
      "This will be our little secret",
      "I know what's best for you"
    ],
    description: "Invitation with secrecy and isolation tactics",
  },
  {
    id: 3,
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
    autoReplies: [
      "Perfect! You're exactly what we need",
      "You have such great potential",
      "This is a huge opportunity for you",
      "Most people would kill for this chance"
    ],
    description: "False opportunity with request for private meeting",
  },
];