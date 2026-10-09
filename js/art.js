// Атмосферные иллюстрации «кабинет психолога» в SVG: тёплая лампа, кресло, растение.
// Без фотографий, поэтому приложение весит килобайты и не зависит от стоков.
let uid = 0;

export function scene({ tone = '#3a2d22', lampX = 200, chair = false, plant = false, shelf = false, window: win = false, table = false, glow = '#f6d6a0' } = {}) {
  const id = 'sc' + ++uid;
  const L = lampX;
  return `<svg class="scene" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
  <defs>
    <linearGradient id="${id}w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${tone}"/><stop offset="1" stop-color="#14100c"/></linearGradient>
    <radialGradient id="${id}g" cx="${L}" cy="118" r="240" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${glow}" stop-opacity=".55"/><stop offset=".4" stop-color="${glow}" stop-opacity=".14"/><stop offset="1" stop-color="${glow}" stop-opacity="0"/></radialGradient>
    <linearGradient id="${id}c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7a6550"/><stop offset="1" stop-color="#3a2f25"/></linearGradient>
    <linearGradient id="${id}f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1c1611"/><stop offset="1" stop-color="#0d0a08"/></linearGradient>
  </defs>
  <rect width="400" height="300" fill="url(#${id}w)"/>
  ${win ? `<rect x="36" y="46" width="78" height="150" rx="39" fill="#251e18" stroke="#4d3f31" stroke-width="3"/><rect x="74" y="46" width="2" height="150" fill="#4d3f31"/><rect x="36" y="120" width="78" height="2" fill="#4d3f31"/><rect x="40" y="50" width="70" height="142" rx="35" fill="${glow}" opacity=".06"/>` : ''}
  ${shelf ? `<rect x="292" y="74" width="92" height="5" rx="2" fill="#4a3c2f"/><rect x="300" y="50" width="8" height="24" fill="#6b5640"/><rect x="310" y="54" width="6" height="20" fill="#8a7055"/><rect x="319" y="47" width="9" height="27" fill="#54443a"/><circle cx="352" cy="66" r="8" fill="#5f4d3c"/><rect x="292" y="128" width="92" height="5" rx="2" fill="#4a3c2f"/><rect x="304" y="106" width="22" height="22" rx="4" fill="#6b5640"/><rect x="342" y="100" width="7" height="28" fill="#8a7055"/><rect x="351" y="104" width="7" height="24" fill="#54443a"/>` : ''}
  <rect y="234" width="400" height="66" fill="url(#${id}f)"/>
  <rect y="232" width="400" height="3" fill="#000" opacity=".3"/>
  <rect width="400" height="300" fill="url(#${id}g)"/>
  <line x1="${L}" y1="0" x2="${L}" y2="80" stroke="#0b0907" stroke-width="2"/>
  <path d="M${L - 48} 114 Q${L - 42} 78 ${L} 78 Q${L + 42} 78 ${L + 48} 114 Z" fill="#2c241d"/>
  <path d="M${L - 30} 88 Q${L} 80 ${L + 30} 88" stroke="#4a3d31" stroke-width="2" fill="none"/>
  <ellipse cx="${L}" cy="114" rx="48" ry="5" fill="#fde9c4"/>
  <ellipse cx="${L}" cy="122" rx="80" ry="12" fill="${glow}" opacity=".16"/>
  ${plant ? `<g><path d="M48 238h40l-5-36H53z" fill="#2b231c"/><g fill="#3b4232"><ellipse cx="60" cy="182" rx="7" ry="26" transform="rotate(-24 60 182)"/><ellipse cx="78" cy="176" rx="7" ry="28" transform="rotate(20 78 176)"/><ellipse cx="68" cy="166" rx="6" ry="30"/></g><g fill="#2c3226"><ellipse cx="52" cy="196" rx="6" ry="20" transform="rotate(-48 52 196)"/><ellipse cx="86" cy="194" rx="6" ry="20" transform="rotate(46 86 194)"/></g></g>` : ''}
  ${table ? `<ellipse cx="160" cy="242" rx="34" ry="4" fill="#000" opacity=".4"/><rect x="157" y="206" width="6" height="34" fill="#2c231b"/><ellipse cx="160" cy="205" rx="30" ry="6" fill="#4a3c2f"/><rect x="152" y="192" width="12" height="12" rx="2" fill="#d9c4a3" opacity=".85"/><path d="M164 195q6 0 6 4t-6 4" stroke="#d9c4a3" stroke-width="2" fill="none" opacity=".85"/>` : ''}
  ${chair ? `<g><ellipse cx="272" cy="244" rx="74" ry="6" fill="#000" opacity=".4"/><rect x="226" y="146" width="96" height="84" rx="24" fill="url(#${id}c)"/><rect x="234" y="150" width="80" height="10" rx="5" fill="#fff" opacity=".07"/><rect x="216" y="198" width="116" height="36" rx="13" fill="#56463a"/><rect x="216" y="198" width="116" height="8" rx="4" fill="#fff" opacity=".06"/><rect x="208" y="176" width="26" height="58" rx="12" fill="#62503f"/><rect x="314" y="176" width="26" height="58" rx="12" fill="#62503f"/><rect x="222" y="232" width="6" height="10" rx="2" fill="#17110c"/><rect x="320" y="232" width="6" height="10" rx="2" fill="#17110c"/></g>` : ''}
</svg>`;
}
