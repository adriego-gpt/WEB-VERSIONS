import fs from 'node:fs/promises';
import { readStore, updateStore, bumpRealtimeMeta } from '../api/_lib/store.js';

const backup = JSON.parse(await fs.readFile('artifacts/recovery/catalog-v5684-public-backup.json', 'utf8')).data;
if (backup.catalogVersion !== 5684 || backup.products.length !== 7) throw new Error('Unexpected recovery source');
const current = await readStore();
console.log(JSON.stringify({ version: current.meta.realtime.catalogVersion, products: current.products.map(p => ({ id:p.id, name:p.name, public:p.isPublic })), users:current.users.length, orders:current.orders.length, coupons:current.coupons.length }));
if (process.argv.includes('--apply')) {
  if (current.meta.realtime.catalogVersion !== 5685) throw new Error('Production changed; review before restoring');
  await fs.writeFile('artifacts/recovery/store-before-restoration.json', JSON.stringify(current), {flag:'wx'});
  const restored = await updateStore(draft => {
    if (draft.meta.realtime.catalogVersion !== 5685) throw new Error('Concurrent change; restoration aborted');
    draft.products = backup.products;
    draft.contactSettings = backup.contactSettings;
    draft.storeSettings = backup.storeSettings;
    draft.productTypes = backup.productTypeRecords;
    draft.filterTags = backup.filterTagRecords;
    bumpRealtimeMeta(draft, ['catalog']);
    return draft;
  });
  console.log(JSON.stringify({restored:true,version:restored.meta.realtime.catalogVersion,products:restored.products.length,orders:restored.orders.length,users:restored.users.length}));
}
