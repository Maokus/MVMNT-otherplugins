import {definePluginElement,group,prop,tab} from '@mvmnt-app/plugin-sdk';
import {Line} from '@mvmnt-app/plugin-sdk/render';
import {spellPitch,buildChord,placeOnPath,pathPosition,NotationRenderer,type ScoreEvent,type Clef,type PathOptions} from './notation';
import {select,when,inspectionProperties,frame,label} from './controls';
export default definePluginElement({
 type:'commonnotation-layout-study',metadata:{name:'Notation · Layout Study',description:'Layer 3: the same notation follows a line, wave or circular path.',category:'us.maok.commonnotation'},
 schema:{tabs:[tab.content([group('phrase','Phrase',[
  select('phrase','Pattern','scale',['scale','chromatic','chords']),prop.number('rootPitch','Starting MIDI pitch',60,{min:24,max:84,step:1}),
  prop.number('count','Number of events',8,{min:2,max:16,step:1}),select('clef','Clef','treble',['treble','bass']),
 ])]),tab.appearance([group('placement','Placement',[
  select('layout','Path','wave',['line','wave','circle']),
  prop.number('spacing','Event spacing (staff spaces)',4,{min:2,max:8,step:.1,visibleWhen:[{key:'layout',notEquals:'circle'}]}),
  prop.number('radius','Circle radius (staff spaces)',10,{min:4,max:24,step:.1,visibleWhen:when('layout','circle')}),
  prop.number('amplitude','Wave height (staff spaces)',3,{min:0,max:10,step:.1,visibleWhen:when('layout','wave')}),
  prop.number('cycles','Wave cycles',1,{min:.1,max:4,step:.1,visibleWhen:when('layout','wave')}),
  prop.number('phase','Path phase (degrees)',0,{min:-180,max:180,visibleWhen:[{key:'layout',notEquals:'line'}]}),
  prop.boolean('followTangent','Rotate with path',false,{visibleWhen:[{key:'layout',notEquals:'line'}]}),
  prop.number('staffSize','Staff-space size (px)',20,{min:6,max:36}),
  prop.boolean('showGuide','Show placement path',true),prop.boolean('showLabels','Show event labels',true),
  prop.colorAlpha('color','Note color','#E2E8F0FF'),prop.colorAlpha('guideColor','Path color','#38BDF880',{visibleWhen:when('showGuide')}),
  prop.colorAlpha('background','Background','#111827FF'),...inspectionProperties(),
 ])])]},
 render({props}){
  const count=Math.max(2,Math.round(props.count)),s=props.staffSize;
  const options:PathOptions={mode:props.layout as PathOptions['mode'],spacing:props.spacing,radius:props.radius,amplitude:props.amplitude,cycles:props.cycles,phase:props.phase*Math.PI/180,rotateToPath:props.followTangent&&props.layout!=='line'};
  const nodes=Array.from({length:count},(_,i)=>{
   const step=props.phrase==='chromatic'?i:[0,2,4,5,7,9,11][i%7]+12*Math.floor(i/7);
   const pitches=props.phrase==='chords'?[0,4,7]:[0];
   const event:ScoreEvent={id:`event:${i}`,beat:i,duration:{denominator:8,dotted:false,beats:.5},notes:pitches.map((offset,j)=>{const pitch=spellPitch(Math.round(props.rootPitch)+step+offset);return {id:`note:${i}:${j}`,sourceId:`note:${i}:${j}`,pitch,startSeconds:i,endSeconds:i+1,tieIn:false,tieOut:false,accidental:pitch.accidental||undefined};})};
   return buildChord(event,props.clef as Clef);
  });
  const placed=placeOnPath(nodes,options);
  // Reserve the full rotated glyph envelope, not just the notehead anchor.
  const extent=Math.max(...nodes.map(n=>Math.hypot(Math.max(Math.abs(n.bounds.x),Math.abs(n.bounds.x+n.bounds.width)),Math.max(Math.abs(n.bounds.y),Math.abs(n.bounds.y+n.bounds.height)))))+2;
  const halfW=(props.layout==='circle'?props.radius:(count-1)*props.spacing/2)+extent;
  const halfH=(props.layout==='wave'?props.amplitude:props.layout==='circle'?props.radius:0)+extent;
  const width=halfW*s*2+40,height=halfH*s*2+70,cx=width/2,cy=height/2+15;
  const objects=[frame(width,height,props.background)],renderer=new NotationRenderer();
  if(props.showGuide){
   const steps=160;let previous=pathPosition(0,count,options);
   for(let i=1;i<=steps;i++){const next=pathPosition(i/steps*(props.layout==='circle'?count:count-1),count,options);objects.push(new Line(cx+previous.x*s,cy+previous.y*s,cx+next.x*s,cy+next.y*s,{color:props.guideColor,lineWidth:1.5}).setLayoutParticipation('exclude'));previous=next;}
  }
  placed.forEach((node,i)=>{
   objects.push(renderer.renderNode({...node,x:0,y:0},{time:0,color:props.color,activeColor:props.color,reveal:0,release:0,animate:false,showBounds:props.showBounds,showAnchors:props.showAnchors}).setScale(s).setPosition(cx+node.x*s,cy+node.y*s));
   if(props.showLabels)objects.push(label(cx+node.x*s,cy+node.y*s+6*s,`${i+1}`,props.color,12));
  });
  if(props.showLabels)objects.push(label(20,26,'LAYOUT  /  identical notation, freely placed',props.color));
  return objects;
 },
});
