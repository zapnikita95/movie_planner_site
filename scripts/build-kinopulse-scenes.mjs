// Reproducible original cinema artwork. Decorative only, no simulated metrics.
import {readFileSync,writeFileSync} from 'node:fs';
const root=new URL('../',import.meta.url);
const svg=body=>`<svg viewBox="0 0 640 560" fill="none" aria-hidden="true">${body}</svg>`;
const reel=`<g class="scene-rotor"><circle cx="320" cy="280" r="206" fill="#e6ded3"/><circle cx="320" cy="280" r="187" stroke="#171518"/><circle cx="320" cy="280" r="30" fill="#171518"/>${[0,72,144,216,288].map(a=>`<ellipse cx="320" cy="160" rx="44" ry="57" fill="#171518" transform="rotate(${a} 320 280)"/>`).join('')}<circle cx="320" cy="280" r="11" fill="#ad315c"/></g><path d="M320 487h210q55 0 55-55v-84" stroke="#f5a4c1" stroke-width="5"/>`;
const lens=`<g class="scene-rotor"><circle cx="320" cy="280" r="213" stroke="#f5a4c1" stroke-width="2"/><circle cx="320" cy="280" r="190" stroke="#e6ded3" stroke-width="22"/>${[0,60,120,180,240,300].map(a=>`<path d="M320 91 484 185 375 248 265 248Z" fill="#ad315c" stroke="#171518" stroke-width="3" transform="rotate(${a} 320 280)"/>`).join('')}<path d="m320 215 57 32v66l-57 32-57-32v-66z" stroke="#e6ded3" stroke-width="2"/></g>`;
const frames=`${[-1,0,1].map((n,i)=>`<g class="scene-frame scene-frame-${i}"><rect x="${150+n*48}" y="${105+n*22}" width="330" height="350" fill="${i===2?'#e6ded3':'#171518'}" stroke="#f5a4c1" stroke-width="2"/><path d="M${174+n*48} ${124+n*22}v310M${456+n*48} ${124+n*22}v310" stroke="${i===2?'#171518':'#e6ded3'}" stroke-width="9" stroke-dasharray="12 14"/><rect x="${201+n*48}" y="${149+n*22}" width="228" height="215" fill="${i===2?'#ad315c':'#292329'}"/>${i===2?'<circle cx="363" cy="276" r="55" stroke="#e6ded3" stroke-width="2"/><path d="m349 246 43 30-43 30z" fill="#e6ded3"/>':''}</g>`).join('')}`;
const clapper=`<g class="scene-board"><rect x="100" y="204" width="440" height="260" rx="3" fill="#e6ded3"/><path d="M125 310h390M125 380h390M260 310v120M390 310v120" stroke="#171518" stroke-width="2"/><path d="M125 270h195M125 345h88M284 345h76M412 345h76" stroke="#ad315c" stroke-width="9"/><path d="M125 410h82M284 410h76M412 410h76" stroke="#171518" stroke-width="3"/></g><g class="scene-clap"><path d="M100 128h440v76H100z" fill="#171518" stroke="#e6ded3" stroke-width="2"/>${[110,215,320,425].map(x=>`<path d="m${x} 128 65 0-36 76h-65z" fill="#e6ded3"/>`).join('')}</g>`;
const ticket=`<g class="scene-ticket"><path d="M94 155h452v75a48 48 0 0 0 0 96v75H94v-75a48 48 0 0 0 0-96z" fill="#e6ded3"/><path d="M410 160v235" stroke="#171518" stroke-width="2" stroke-dasharray="7 9"/><path d="M149 213h196M149 249h135M149 342h90" stroke="#ad315c" stroke-width="12"/>${[0,1,2,3,4,5,6,7].map(i=>`<path d="M${444+i*8} 205v142" stroke="#171518" stroke-width="${i%3===0?4:2}"/>`).join('')}</g>`;
const projector=`<path class="scene-beam" d="m352 276 252-155v320L352 307z" fill="#e6ded3" opacity=".12"/><g class="scene-projector"><rect x="109" y="229" width="242" height="153" fill="#e6ded3"/><path d="m351 263 48-16v87l-48-16z" fill="#ad315c"/><path d="m155 382-37 84m169-84 37 84" stroke="#e6ded3" stroke-width="12"/><g class="scene-small-reel"><circle cx="150" cy="165" r="62" stroke="#f5a4c1" stroke-width="13"/><path d="M150 115v100m-50-50h100" stroke="#e6ded3" stroke-width="10"/></g><circle cx="287" cy="165" r="62" stroke="#f5a4c1" stroke-width="13"/><path d="M133 267h118m-118 27h118m-118 27h78" stroke="#171518" stroke-width="5"/></g>`;
const artwork={reel,lens,frames,clapper,ticket,projector};
const scene=(type,hero=false)=>`<div class="kp-scene kp-scene-${type}${hero?' kp-scene-hero':''}" data-kp-scene="${type}" aria-hidden="true">${svg(artwork[type])}</div>`;
for(const [path,hero,backgrounds] of [
 ['kinopulse/index.html',null,['lens',null,'ticket',null,'projector','clapper']],
 ['kinopulse/podbor-blogerov/index.html','frames',['lens','reel','projector','ticket','clapper','frames']],
 ['kinopulse/agency/index.html','clapper',['projector','frames','reel','ticket','lens','clapper']]
]){
 let html=readFileSync(new URL(path,root),'utf8');
 // Remove generated illustrations before rebuilding, keeping text untouched.
 html=html.replace(/<div class="kp-scene[^>]*>[\s\S]*?<\/svg><\/div>/g,'');
 if(hero){
  html=html.replace(/<div class="kp-cinema-art[^>]*>[\s\S]*?<\/svg><\/div>/,scene(hero,true));
  if(!html.includes('kp-scene-hero'))html=html.replace('</div></div><section','</div>'+scene(hero,true)+'</div><section');
 }
 let i=0;
 html=html.replace(/<section\b([^>]*)>/g,(match,attrs)=>{
  const type=backgrounds[i++];if(!type)return match;
  attrs=attrs.replace(/ data-kp-backdrop="[^"]*"/g,'');
  return `<section${attrs} data-kp-backdrop="${type}">${scene(type)}`;
 });
 writeFileSync(new URL(path,root),html);
}
