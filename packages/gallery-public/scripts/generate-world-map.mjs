import { writeFileSync } from 'node:fs';
import { countries } from '../../gallery-core/src/countries.ts';
import { buildCartogram, COLS, STEP } from './cartogram-layout.mjs';

// Continuous monotone axis expansion preserves shared borders and direction while
// giving the crowded Europe/Caucasus region more room for complete Chinese labels.
function axis(value, from, to) {
  for (let i=1;i<from.length;i++) if (value<=from[i])
    return to[i-1]+(value-from[i-1])/(from[i]-from[i-1])*(to[i]-to[i-1]);
  return to.at(-1);
}
const x = value => axis(value,[0,200,700,1000,2000],[0,160,960,1300,2300]);
const y = value => axis(value,[0,200,650,1240],[0,160,880,1470]);
const round = value => Math.round(value*100)/100;
const path = value => value.replace(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g,(_,a,b)=>`${round(x(+a))},${round(y(+b))}`);
const model = buildCartogram(countries);
const shapes = countries.map(c => {
  const g = model.geometries[c.id],b=g.label;
  const w=x(b.x+b.w)-x(b.x)-4,h=y(b.y+b.h)-y(b.y)-4;
  const chars=Array.from(c.zh);
  let label;
  for(let size=24;size>=5;size--) {
    const columns=Math.max(1,Math.floor(w/size));
    const lines=[];
    for(let i=0;i<chars.length;i+=columns) lines.push(chars.slice(i,i+columns).join(''));
    if(lines.length*(size+2)<=h) {label={lines,size,lineHeight:size+2};break;}
  }
  if(!label) throw new Error(`No full-name label fits ${c.id}`);
  return { id:c.id,name:c.zh,en:c.en,region:c.region,path:path(g.path),
    label:[round((x(b.x)+x(b.x+b.w))/2),round((y(b.y)+y(b.y+b.h))/2)],...label };
});
// One common edge per land/water or country/country boundary, never doubled strokes.
const segments=[];
for(const [key,id] of model.owners) {
  const gx=key%COLS,gy=Math.floor(key/COLS);
  const edge=(ax,ay,bx,by)=>segments.push(`M${round(x(ax*STEP))},${round(y(ay*STEP))}L${round(x(bx*STEP))},${round(y(by*STEP))}`);
  if(model.owners.get(key-1)!==id && (!model.owners.has(key-1) || model.owners.get(key-1)>id)) edge(gx,gy,gx,gy+1);
  if(model.owners.get(key+1)!==id && (!model.owners.has(key+1) || model.owners.get(key+1)>id)) edge(gx+1,gy,gx+1,gy+1);
  if(model.owners.get(key-COLS)!==id && (!model.owners.has(key-COLS) || model.owners.get(key-COLS)>id)) edge(gx,gy,gx+1,gy);
  if(model.owners.get(key+COLS)!==id && (!model.owners.has(key+COLS) || model.owners.get(key+COLS)>id)) edge(gx,gy+1,gx+1,gy+1);
}
const waters=model.waters.filter(w=>w.label).map(w=>({name:w.zh,label:[round(x(w.label.x)),round(y(w.label.y))],vertical:w.id==='caspian'||w.id==='red',size:14}));
waters.push(...[
  {name:'北 冰 洋',label:[1140,45],size:21},
  {name:'太 平 洋',label:[1610,645],size:24},
  {name:'大 西 洋',label:[110,700],size:23},
  {name:'印 度 洋',label:[1090,1020],size:23},
  {name:'南 大 洋',label:[1280,1400],size:23},
]);
writeFileSync(new URL('../src/lib/visited/world-map.json',import.meta.url),JSON.stringify({width:2300,height:1470,countries:shapes,borders:segments.join(''),waters})+'\n');
console.log(`Generated original world cartogram with ${shapes.length} complete country names.`);
