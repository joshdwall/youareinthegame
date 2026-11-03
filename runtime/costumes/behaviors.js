/** Bounded motion wrappers keep behavioral transforms separate from attachment transforms. */
import {ACTION_TYPES,PHASES,resolvePlacement} from './contracts.js';
const motionTypes=ACTION_TYPES.filter(x=>!['fire','textProjectile'].includes(x));
export function runBehaviors({root,elements=[],target='activation',phase='activation',signal}={}){
 const stops=[];if(!root||!PHASES.includes(phase))return {stop(){}};
 const reduced=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
 for(const e of elements){const p=resolvePlacement(e.placement||{});const actions=p.objectActions||e.objectActions||[];
  for(const a of actions){if(!motionTypes.includes(a.type)||(a.phase||'activation')!==phase||!(a.appliesTo||['activation','spore']).includes(target))continue;
   const img=[...root.querySelectorAll('[data-element-id]')].find(x=>x.dataset.elementId===e.id);if(!img)continue;
   if(reduced&&a.type!=='fade')continue;
   const wrapper=document.createElement('div');wrapper.className='costume-motion';wrapper.style.cssText=`position:absolute;inset:0;pointer-events:none;transform-origin:${p.characterAnchor.x*100}% ${p.characterAnchor.y*100}%;z-index:${p.layer==='behind-character'?1:5}`;
   img.parentNode.insertBefore(wrapper,img);wrapper.appendChild(img);
   const amp=a.amplitude??8,duration=reduced?100:(a.durationMs??1000);let animation;const timers=[];const particles=[],particleAnimations=[];
   const frames={sway:[{transform:`rotate(${-amp}deg)`},{transform:`rotate(${amp}deg)`}],bounce:[{transform:'translateY(0)'},{transform:`translateY(${-amp}px)`},{transform:'translateY(0)'}],spin:[{transform:'rotate(0deg)'},{transform:'rotate(360deg)'}],recoil:[{transform:'translateX(0)'},{transform:`translateX(${-amp}px)`},{transform:'translateX(0)'}],fade:[{opacity:0},{opacity:1}]};
   if(frames[a.type]&&wrapper.animate)animation=wrapper.animate(frames[a.type],{duration,iterations:['fade','recoil'].includes(a.type)?1:Infinity,direction:a.type==='sway'?'alternate':'normal',easing:'ease-in-out',fill:a.type==='fade'?'forwards':'none'});
   if(a.type==='particles'){
    const spawn=()=>{for(let i=0;i<Math.min(a.count??4,12);i++){const node=document.createElement('span');node.className='costume-particle';node.style.cssText=`position:absolute;left:${p.characterAnchor.x*100}%;top:${p.characterAnchor.y*100}%;width:4px;height:4px;border-radius:50%;background:currentColor;pointer-events:none`;wrapper.appendChild(node);particles.push(node);const angle=i/Math.max(1,a.count??4)*Math.PI*2;const an=node.animate?.([{transform:'translate(0,0)',opacity:1},{transform:`translate(${Math.cos(angle)*amp*3}px,${Math.sin(angle)*amp*3}px)`,opacity:0}],{duration:Math.min(duration,2000)});if(an)particleAnimations.push(an);an?.addEventListener('finish',()=>node.remove(),{once:true});}};spawn();
   }
   let stopped=false;const stop=()=>{if(stopped)return;stopped=true;animation?.cancel();particleAnimations.forEach(a=>a.cancel());timers.forEach(clearTimeout);particles.forEach(n=>n.remove());if(img.parentNode===wrapper&&wrapper.parentNode){wrapper.parentNode.insertBefore(img,wrapper);wrapper.remove();}};stops.push(stop);
  }
 }
 const stop=()=>{stops.reverse().forEach(fn=>fn());stops.length=0;signal?.removeEventListener('abort',stop);};signal?.addEventListener('abort',stop,{once:true});if(signal?.aborted)stop();return {stop};
}
