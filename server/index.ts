import { readFileSync } from 'node:fs';
import { createStore } from './core.ts';
import { createApp } from './app.ts';
const store = createStore(process.env.DB_PATH || 'data/funnel.sqlite');
if (!store.active()) store.publish(JSON.parse(readFileSync('configs/workstyle-v1.json', 'utf8')));
const app = createApp(store);
app.listen(Number(process.env.PORT || 3001), '0.0.0.0', () =>
  console.log('Funnel Runtime on port ' + (process.env.PORT || 3001)),
);
