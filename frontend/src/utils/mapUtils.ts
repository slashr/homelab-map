/**
 * Map utility functions for DeckGLMap component
 */

/**
 * Returns RGBA color based on latency value
 * Green (excellent) < 20ms < Yellow (good) < 60ms < Orange (fair) < 120ms < Red (poor)
 */
export const getLatencyColor = (
  latency: number,
  darkMode: boolean
): [number, number, number, number] => {
  if (latency < 20) {
    return darkMode ? [0, 245, 212, 220] : [3, 201, 136, 220];
  }
  if (latency < 60) {
    return darkMode ? [249, 255, 108, 220] : [244, 162, 89, 220];
  }
  if (latency < 120) {
    return darkMode ? [255, 140, 66, 220] : [255, 130, 67, 220];
  }
  return darkMode ? [255, 63, 129, 220] : [255, 77, 109, 220];
};

/**
 * Returns quality label based on latency value
 */
export const getLatencyQuality = (latency: number): string => {
  if (latency < 20) return 'Excellent';
  if (latency < 60) return 'Good';
  if (latency < 120) return 'Fair';
  return 'Poor';
};

/**
 * Character name to display name mapping
 */
const CHARACTER_NAMES: Record<string, string> = {
  michael: 'Michael+Scott',
  jim: 'Jim+Halpert',
  dwight: 'Dwight+Schrute',
  angela: 'Angela+Martin',
  stanley: 'Stanley+Hudson',
  phyllis: 'Phyllis+Vance',
  toby: 'Toby+Flenderson',
};

/**
 * Character name to avatar background color mapping
 */
const CHARACTER_COLORS: Record<string, string> = {
  michael: '667eea',
  jim: '4285F4',
  dwight: 'FFC107',
  angela: '9c27b0',
  stanley: 'ff9800',
  phyllis: '4caf50',
  toby: '795548',
};

/**
 * Default color for unknown characters
 */
const DEFAULT_COLOR = '607D8B';

/**
 * Generates UI Avatars URL for a node based on character name
 */
export const getAvatarUrl = (nodeName: string): string => {
  const character = nodeName.split('-')[0].toLowerCase();
  const name = CHARACTER_NAMES[character] || character;
  const color = CHARACTER_COLORS[character] || DEFAULT_COLOR;
  return `https://ui-avatars.com/api/?name=${name}&size=128&background=${color}&color=fff&bold=true&rounded=true`;
};

/**
 * Extracts character name from node name
 */
export const getCharacterFromNodeName = (nodeName: string): string => {
  return nodeName.split('-')[0].toLowerCase();
};
