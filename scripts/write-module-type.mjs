import {mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';

const [dir, type] = process.argv.slice(2);
const target = join('build', dir);
mkdirSync(target, {recursive: true});
writeFileSync(join(target, 'package.json'), `${JSON.stringify({type}, null, 2)}\n`);
