// Run with: npx tsx src/utils/resolveAvailableEquipment.verify.ts
import { resolveAvailableEquipment } from './resolveAvailableEquipment';

console.log('New-style profile, barbell + dumbbells only:');
console.log(' ', resolveAvailableEquipment({ customEquipment: ['barbell', 'dumbbells'] }).sort());

console.log('\nNew-style profile, calisthenics only:');
console.log(' ', resolveAvailableEquipment({ customEquipment: ['calisthenics'] }).sort());

console.log('\nLegacy profile, no customEquipment, equipment=bodyweight:');
console.log(' ', resolveAvailableEquipment({ equipment: 'bodyweight', customEquipment: [] }).sort());

console.log('\nLegacy profile, no customEquipment, equipment=full_gym:');
console.log(' ', resolveAvailableEquipment({ equipment: 'full_gym', customEquipment: [] }).length, 'items (full list)');

console.log('\nNo profile at all:');
console.log(' ', resolveAvailableEquipment(undefined).length, 'items (full list fallback)');
