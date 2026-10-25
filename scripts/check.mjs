import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);}
for(const folder of ['bin','src','scripts','test'])for(const file of walk(path.join(root,folder)).filter(f=>f.endsWith('.mjs')))execFileSync(process.execPath,['--check',file],{stdio:'inherit'});
console.log('Syntax checks passed.');
