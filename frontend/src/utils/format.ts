export const formatBytesPerSecond = (value?: number | null): string => {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return '0 B/s';
  }

  const absolute = Math.max(value, 0);
  const units = ['B/s', 'KB/s', 'MB/s', 'GB/s', 'TB/s'];
  let index = 0;
  let scaled = absolute;

  while (scaled >= 1024 && index < units.length - 1) {
    scaled /= 1024;
    index += 1;
  }

  const precision = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
  return `${scaled.toFixed(precision)} ${units[index]}`;
};
