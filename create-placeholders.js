import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// List of all missing assets from flashcardData.ts
const assets = [
  '2ba30e58edf3ccfda41166fc36258ccf3f4f76f1.png',
  'c34c7c96bc03e950464e140ec14e3ac1b3a13714.png',
  '9eeab26df9b6053fe15b3fcf6e6f40f05ad27222.png',
  '1f61eb5038a4993e2442bdbcfdc3e6b43fba97e0.png',
  'e500e6d028446226a1ca5f40b2b0d1db3205632a.png',
  'ffed8e905200916f2592b646890d90bf65222fc1.png',
  '29c5bab39e327da86422f103678424e250ff4c3c.png',
  '4f80d9fca55af6bdb4f6193fb3e3321eef9645c5.png',
  'c2f739072cd19db867b3eb6e0f3b094ee3fac434.png',
  '7a650aba2144b9f8954eff85984291c95a7cc10a.png',
  '2a1d8de142392ff5f1bdf9eb56bf6963c7e673bc.png',
  'e71ddd42da2fcd776094087924e1743a34a63809.png',
  '8049752b65600b9fb880a096268ba27881ca9d1d.png',
  'a9e1128d560c484bdc8f3882f51891d4d59848c9.png',
  '53c04639ad24021b57ffca2fbbd4b35fd5ce4238.png',
  'fd971a773b5bf07c77f68d3bdc84e2a06b814592.png',
  'c8a8c957c5aab49d248727e1db1601f8b2d701e3.png',
  '3593dd82f14f2b69c51f9b0d1fc5fc9a3803d098.png',
  '7b5294cfbc06d7471c6b7650f16294b7f1a4a903.png',
  'ff6fffd0d8825f76b78b5f78e5dc7c18baad87d4.png',
  '079a1c4c9668718e32bee5519fef37e1e05b62c2.png',
  '56b243f46b0a5972c46019f2e9f7af884bfd0107.png',
  '926bcbaceb881774dc890e822f0db4a571f7ba3a.png',
  '334d8be1daa2eb6702b1d3b7bff19ae106853e15.png',
  '349f67ca860df960bde08b1719cc3bead741164a.png',
  '86e816d99cfe874ed0ee04249c4240b97242a226.png'
];

// Create a simple 1x1 PNG placeholder (this is a minimal valid PNG)
const placeholderPNG = Buffer.from([
  0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
  0x00, 0x00, 0x00, 0x0D, // IHDR chunk length
  0x49, 0x48, 0x44, 0x52, // IHDR
  0x00, 0x00, 0x00, 0x01, // width: 1
  0x00, 0x00, 0x00, 0x01, // height: 1
  0x08, 0x02, 0x00, 0x00, 0x00, // bit depth, color type, compression, filter, interlace
  0x90, 0x77, 0x53, 0xDE, // CRC
  0x00, 0x00, 0x00, 0x0C, // IDAT chunk length
  0x49, 0x44, 0x41, 0x54, // IDAT
  0x08, 0x99, 0x01, 0x01, 0x00, 0x00, 0x00, 0xFF, 0xFF, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01, // compressed data
  0x00, 0x00, 0x00, 0x00, // IEND chunk length
  0x49, 0x45, 0x4E, 0x44, // IEND
  0xAE, 0x42, 0x60, 0x82  // CRC
]);

// Create public/assets directory if it doesn't exist
const assetsDir = path.join(__dirname, 'public', 'assets');
if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
}

// Generate placeholder files
assets.forEach(asset => {
  const filePath = path.join(assetsDir, asset);
  fs.writeFileSync(filePath, placeholderPNG);
  console.log(`Created placeholder: ${filePath}`);
});

console.log(`\nCreated ${assets.length} placeholder images in ${assetsDir}`);
