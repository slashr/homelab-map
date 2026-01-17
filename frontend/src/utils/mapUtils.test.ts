import {
  getLatencyColor,
  getLatencyQuality,
  getAvatarUrl,
  getCharacterFromNodeName,
} from './mapUtils';

describe('mapUtils', () => {
  describe('getLatencyColor', () => {
    describe('dark mode', () => {
      it('should return cyan/green for excellent latency (< 20ms)', () => {
        expect(getLatencyColor(0, true)).toEqual([0, 245, 212, 220]);
        expect(getLatencyColor(10, true)).toEqual([0, 245, 212, 220]);
        expect(getLatencyColor(19, true)).toEqual([0, 245, 212, 220]);
      });

      it('should return yellow for good latency (20-59ms)', () => {
        expect(getLatencyColor(20, true)).toEqual([249, 255, 108, 220]);
        expect(getLatencyColor(40, true)).toEqual([249, 255, 108, 220]);
        expect(getLatencyColor(59, true)).toEqual([249, 255, 108, 220]);
      });

      it('should return orange for fair latency (60-119ms)', () => {
        expect(getLatencyColor(60, true)).toEqual([255, 140, 66, 220]);
        expect(getLatencyColor(90, true)).toEqual([255, 140, 66, 220]);
        expect(getLatencyColor(119, true)).toEqual([255, 140, 66, 220]);
      });

      it('should return red/pink for poor latency (>= 120ms)', () => {
        expect(getLatencyColor(120, true)).toEqual([255, 63, 129, 220]);
        expect(getLatencyColor(200, true)).toEqual([255, 63, 129, 220]);
        expect(getLatencyColor(1000, true)).toEqual([255, 63, 129, 220]);
      });
    });

    describe('light mode', () => {
      it('should return green for excellent latency (< 20ms)', () => {
        expect(getLatencyColor(10, false)).toEqual([3, 201, 136, 220]);
      });

      it('should return orange for good latency (20-59ms)', () => {
        expect(getLatencyColor(40, false)).toEqual([244, 162, 89, 220]);
      });

      it('should return darker orange for fair latency (60-119ms)', () => {
        expect(getLatencyColor(90, false)).toEqual([255, 130, 67, 220]);
      });

      it('should return red for poor latency (>= 120ms)', () => {
        expect(getLatencyColor(200, false)).toEqual([255, 77, 109, 220]);
      });
    });
  });

  describe('getLatencyQuality', () => {
    it('should return "Excellent" for latency < 20ms', () => {
      expect(getLatencyQuality(0)).toBe('Excellent');
      expect(getLatencyQuality(10)).toBe('Excellent');
      expect(getLatencyQuality(19)).toBe('Excellent');
    });

    it('should return "Good" for latency 20-59ms', () => {
      expect(getLatencyQuality(20)).toBe('Good');
      expect(getLatencyQuality(40)).toBe('Good');
      expect(getLatencyQuality(59)).toBe('Good');
    });

    it('should return "Fair" for latency 60-119ms', () => {
      expect(getLatencyQuality(60)).toBe('Fair');
      expect(getLatencyQuality(90)).toBe('Fair');
      expect(getLatencyQuality(119)).toBe('Fair');
    });

    it('should return "Poor" for latency >= 120ms', () => {
      expect(getLatencyQuality(120)).toBe('Poor');
      expect(getLatencyQuality(200)).toBe('Poor');
      expect(getLatencyQuality(1000)).toBe('Poor');
    });
  });

  describe('getAvatarUrl', () => {
    it('should generate correct URL for known characters', () => {
      expect(getAvatarUrl('michael-1')).toBe(
        'https://ui-avatars.com/api/?name=Michael+Scott&size=128&background=667eea&color=fff&bold=true&rounded=true'
      );
      expect(getAvatarUrl('jim-2')).toBe(
        'https://ui-avatars.com/api/?name=Jim+Halpert&size=128&background=4285F4&color=fff&bold=true&rounded=true'
      );
      expect(getAvatarUrl('dwight-3')).toBe(
        'https://ui-avatars.com/api/?name=Dwight+Schrute&size=128&background=FFC107&color=fff&bold=true&rounded=true'
      );
    });

    it('should use default color for unknown characters', () => {
      const url = getAvatarUrl('unknown-node');
      expect(url).toContain('background=607D8B');
      expect(url).toContain('name=unknown');
    });

    it('should handle uppercase node names', () => {
      expect(getAvatarUrl('MICHAEL-1')).toBe(
        'https://ui-avatars.com/api/?name=Michael+Scott&size=128&background=667eea&color=fff&bold=true&rounded=true'
      );
    });

    it('should handle node names with multiple hyphens', () => {
      expect(getAvatarUrl('jim-halpert-office')).toBe(
        'https://ui-avatars.com/api/?name=Jim+Halpert&size=128&background=4285F4&color=fff&bold=true&rounded=true'
      );
    });
  });

  describe('getCharacterFromNodeName', () => {
    it('should extract character name from node name', () => {
      expect(getCharacterFromNodeName('michael-1')).toBe('michael');
      expect(getCharacterFromNodeName('jim-halpert')).toBe('jim');
      expect(getCharacterFromNodeName('dwight-3')).toBe('dwight');
    });

    it('should convert to lowercase', () => {
      expect(getCharacterFromNodeName('MICHAEL-1')).toBe('michael');
      expect(getCharacterFromNodeName('Jim-Halpert')).toBe('jim');
    });

    it('should handle node names without hyphens', () => {
      expect(getCharacterFromNodeName('michael')).toBe('michael');
    });
  });
});
