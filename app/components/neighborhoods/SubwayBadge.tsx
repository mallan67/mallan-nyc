const SUBWAY_COLORS: Record<string, string> = {
  '1': 'bg-red-600',
  '2': 'bg-red-600',
  '3': 'bg-red-600',
  '4': 'bg-green-600',
  '5': 'bg-green-600',
  '6': 'bg-green-600',
  '7': 'bg-purple-600',
  A: 'bg-blue-600',
  C: 'bg-blue-600',
  E: 'bg-blue-600',
  B: 'bg-orange-500',
  D: 'bg-orange-500',
  F: 'bg-orange-500',
  M: 'bg-orange-500',
  G: 'bg-lime-600',
  J: 'bg-amber-700',
  Z: 'bg-amber-700',
  L: 'bg-gray-500',
  N: 'bg-yellow-400',
  Q: 'bg-yellow-400',
  R: 'bg-yellow-400',
  W: 'bg-yellow-400',
  S: 'bg-gray-600',
  SIR: 'bg-blue-800',
};

const LIGHT_TEXT = new Set(['N', 'Q', 'R', 'W']);

export default function SubwayBadge({ line }: { line: string }) {
  const bg = SUBWAY_COLORS[line] || 'bg-gray-500';
  const text = LIGHT_TEXT.has(line) ? 'text-gray-900' : 'text-white';

  return (
    <span
      className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${bg} ${text}`}
      aria-label={`${line} train`}
    >
      {line}
    </span>
  );
}
