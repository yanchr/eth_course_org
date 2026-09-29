import sharp from 'sharp'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const publicDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')

// Full-bleed background so the 512 icon also works as a maskable icon (content in the 80% safe zone).
const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#18181b"/>
  <g transform="translate(136 136)" fill="none" stroke-linejoin="round">
    <rect x="0" y="0" width="240" height="240" rx="36" fill="#27272a" stroke="#3f3f46" stroke-width="6"/>
    <g fill="#fafafa">
      <rect x="32" y="40" width="44" height="44" rx="10"/>
      <rect x="98" y="40" width="44" height="44" rx="10"/>
      <rect x="164" y="40" width="44" height="44" rx="10" fill="#52525b"/>
      <rect x="32" y="98" width="44" height="44" rx="10"/>
      <rect x="98" y="98" width="44" height="44" rx="10" fill="#52525b"/>
      <rect x="164" y="98" width="44" height="44" rx="10" fill="#52525b"/>
      <rect x="32" y="156" width="44" height="44" rx="10" fill="#52525b"/>
      <rect x="98" y="156" width="44" height="44" rx="10" fill="#52525b"/>
      <rect x="164" y="156" width="44" height="44" rx="10" fill="#52525b"/>
    </g>
  </g>
</svg>`

const targets = [
  ['pwa-512.png', 512],
  ['pwa-192.png', 192],
  ['apple-touch-icon.png', 180],
  ['favicon.png', 64],
]

for (const [name, size] of targets) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(join(publicDir, name))
  console.log(`wrote public/${name}`)
}
