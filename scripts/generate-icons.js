const fs = require('fs');

function createSVG(size) {
  const s = size;
  const half = s / 2;
  const r = s * 0.38;
  const crossSize = s * 0.18;
  const crossThick = s * 0.06;
  const fontSize = s * 0.11;

  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="' + s + '" height="' + s + '" viewBox="0 0 ' + s + ' ' + s + '">',
    '  <defs>',
    '    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">',
    '      <stop offset="0%" style="stop-color:#2563eb"/>',
    '      <stop offset="100%" style="stop-color:#1d4ed8"/>',
    '    </linearGradient>',
    '  </defs>',
    '  <rect width="' + s + '" height="' + s + '" rx="' + (s * 0.2) + '" fill="url(#bg)"/>',
    '  <circle cx="' + half + '" cy="' + (half * 0.85) + '" r="' + r + '" fill="rgba(255,255,255,0.15)"/>',
    '  <rect x="' + (half - crossThick / 2) + '" y="' + (half * 0.85 - crossSize) + '" width="' + crossThick + '" height="' + (crossSize * 2) + '" rx="' + (crossThick / 4) + '" fill="white"/>',
    '  <rect x="' + (half - crossSize) + '" y="' + (half * 0.85 - crossThick / 2) + '" width="' + (crossSize * 2) + '" height="' + crossThick + '" rx="' + (crossThick / 4) + '" fill="white"/>',
    '  <text x="' + half + '" y="' + (s * 0.82) + '" text-anchor="middle" font-family="Arial,sans-serif" font-weight="700" font-size="' + fontSize + '" fill="white" letter-spacing="1">PHARMA</text>',
    '  <text x="' + half + '" y="' + (s * 0.92) + '" text-anchor="middle" font-family="Arial,sans-serif" font-weight="400" font-size="' + (fontSize * 0.6) + '" fill="rgba(255,255,255,0.8)">VOICE AI</text>',
    '</svg>'
  ].join('\n');
}

fs.writeFileSync('public/icons/icon-192.svg', createSVG(192));
fs.writeFileSync('public/icons/icon-512.svg', createSVG(512));
console.log('SVG icons created: icon-192.svg, icon-512.svg');
