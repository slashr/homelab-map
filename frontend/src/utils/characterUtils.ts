export const getCharacterFromNodeName = (nodeName: string): string => {
  return nodeName.split('-')[0].toLowerCase();
};

export const capitalizeCharacterName = (character: string): string => {
  return character.charAt(0).toUpperCase() + character.slice(1);
};

export const getCharacterImage = (nodeName: string): string => {
  const character = getCharacterFromNodeName(nodeName);
  return `/characters/${character}.png`;
};

export const getCharacterQuote = (character: string): string => {
  const quotes: Record<string, string> = {
    michael: "I'm not superstitious, but I am a little stitious.",
    jim: "Bears. Beets. Battlestar Galactica.",
    angela: "I don't trust you, Phyllis!",
    phyllis: "Close your mouth, sweetie. You look like a trout.",
    stanley: "Did I stutter?",
    toby: "I hate so much about the things that you choose to be.",
  };
  return quotes[character] || "That's what she said.";
};

