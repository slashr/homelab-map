import { getCharacterFromNodeName, getCharacterImage, getCharacterQuote } from '../utils/characterUtils';

describe('StatsPanel utility functions', () => {
  describe('getCharacterFromNodeName', () => {
    it('should extract character name from node name', () => {
      expect(getCharacterFromNodeName('michael-scranton')).toBe('michael');
      expect(getCharacterFromNodeName('jim-halpert')).toBe('jim');
      expect(getCharacterFromNodeName('stanley-hudson')).toBe('stanley');
    });

    it('should handle node names with multiple hyphens', () => {
      expect(getCharacterFromNodeName('michael-scranton-branch')).toBe('michael');
      expect(getCharacterFromNodeName('jim-halpert-office')).toBe('jim');
    });

    it('should convert to lowercase', () => {
      expect(getCharacterFromNodeName('MICHAEL-SCRANTON')).toBe('michael');
      expect(getCharacterFromNodeName('Jim-Halpert')).toBe('jim');
    });

    it('should handle node names without hyphens', () => {
      expect(getCharacterFromNodeName('michael')).toBe('michael');
      expect(getCharacterFromNodeName('jim')).toBe('jim');
    });
  });

  describe('getCharacterImage', () => {
    it('should return correct image path for known characters', () => {
      expect(getCharacterImage('michael-scranton')).toBe('/characters/michael.jpg');
      expect(getCharacterImage('jim-halpert')).toBe('/characters/jim.jpg');
      expect(getCharacterImage('stanley-hudson')).toBe('/characters/stanley.jpg');
    });

    it('should handle uppercase node names', () => {
      expect(getCharacterImage('MICHAEL-SCRANTON')).toBe('/characters/michael.jpg');
    });
  });

  describe('getCharacterQuote', () => {
    it('should return correct quote for known characters', () => {
      expect(getCharacterQuote('michael')).toBe("I'm not superstitious, but I am a little stitious.");
      expect(getCharacterQuote('jim')).toBe("Bears. Beets. Battlestar Galactica.");
      expect(getCharacterQuote('angela')).toBe("I don't trust you, Phyllis!");
      expect(getCharacterQuote('phyllis')).toBe("Close your mouth, sweetie. You look like a trout.");
      expect(getCharacterQuote('stanley')).toBe("Did I stutter?");
      expect(getCharacterQuote('toby')).toBe("I hate so much about the things that you choose to be.");
    });

    it('should return default quote for unknown characters', () => {
      expect(getCharacterQuote('unknown')).toBe("That's what she said.");
      expect(getCharacterQuote('dwight')).toBe("That's what she said.");
      expect(getCharacterQuote('')).toBe("That's what she said.");
    });
  });
});

