const spore = {phase:'activation', appliesTo:['spore'], point:{x:.8,y:.25}, direction:-45};
const projectile = {type:'fire', ...spore, spriteWidthPx:42, durationMs:700, distance:75, rate:2, launchWindowMs:450};

export const ACTION_CATALOG = Object.freeze({
  flash: {label:'Flash', defaults:{type:'fire', ...spore}},
  text: {label:'Text or symbol', defaults:{type:'textProjectile', ...spore, text:'!', color:'#ffffff', durationMs:700}},
  sprite: {label:'Straight projectile', defaults:projectile},
  offscreen: {label:'Projectile off screen', defaults:{...projectile, exitViewport:true}},
  ricochet: {label:'Ricochet projectile', defaults:{...projectile, flightPath:'ricochet'}},
  dart: {label:'Darting projectile', defaults:{...projectile, flightPath:'dart'}},
  wind: {label:'Wind-driven projectile', defaults:{...projectile, flightPath:'wind'}},
  detach: {label:'Detach item in two gusts', defaults:{type:'windLaunch', ...spore}},
  slash: {label:'Attack slash', defaults:{type:'textProjectile', ...spore, text:'◜', shape:'slash', color:'#fff0cf', durationMs:380, distance:44}},
  thrust: {label:'Attack thrust', defaults:{type:'textProjectile', ...spore, text:'✷', shape:'thrust', color:'#fff0cf', durationMs:320, distance:58}},
  impact: {label:'Attack impact', defaults:{type:'textProjectile', ...spore, text:'✷', shape:'impact', color:'#fff0cf', durationMs:360, distance:15}},
  ...Object.fromEntries(['sway','bounce','spin','recoil','fade','particles'].map(type=>[type,{
    label:type[0].toUpperCase()+type.slice(1), defaults:{type, ...spore, durationMs:850, amplitude:6}
  }]))
});

export function actionPresetKey(action) {
  if (action.type==='fire') return action.flightPath || (action.exitViewport?'offscreen':action.sprite?'sprite':'flash');
  if (action.type==='textProjectile') return action.shape || 'text';
  return action.type==='windLaunch'?'detach':action.type;
}

export function createAction(key, sprite) {
  const entry=ACTION_CATALOG[key];
  if (!entry) throw Error('Unknown action preset');
  const action=structuredClone(entry.defaults);
  if (['sprite','offscreen','ricochet','dart','wind'].includes(key) && sprite) action.sprite=sprite;
  return action;
}
