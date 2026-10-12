/** AOT helper calls and control flow -> native ARM64; C++ is a test-only oracle. */
import {ARM64} from '../../../src/native/arm64.js';
import {AOT_HELPERS} from './aot-abi.js';
export class AOTFunction {
  constructor(id) {this.id=id;this.ops=[];this.nextSlot=1;this.slots=1;this.sequence=0;}
  label(name) {this.ops.push({op:'label',name});}
  unique(prefix='local') {return prefix+'_'+this.sequence++;}
  reset() {this.nextSlot=1;this.call('clear');}
  call(name,...args) {
    if(!AOT_HELPERS.includes(name)||args.length>7)throw new Error('Invalid native helper call: '+name);
    const out={slot:this.nextSlot++};this.slots=Math.max(this.slots,this.nextSlot);
    if(this.slots>4094)throw new Error('Native expression exceeds AOT stack-frame limit');
    this.ops.push({op:'call',name,args,out,checked:name!=='exception'});return out;
  }
  jump(name) {this.ops.push({op:'jump',name});}
  branch(value,name,zero=false) {this.ops.push({op:'branch',value,name,zero});}
  select(value,pairs,fallback) {this.ops.push({op:'select',value,pairs,fallback});}
  dispatch(value) {this.ops.push({op:'move',value,out:{slot:0}});this.jump('dispatch');}
  end() {this.jump('exit');}
  emit(assembler) {
    const a=assembler,prefix='aot_'+this.id+'_',name=s=>prefix+s,frame=Math.ceil(this.slots*8/16)*16;
    const load=(rd,value)=>value&&typeof value==='object'?a.ldr(rd,31,value.slot*8):a.movImm(rd,value??0);
    let sequence=0;
    const conditional=(condition,target)=>{const inverse={eq:'ne',ne:'eq',lt:'ge',ge:'lt',lo:'hs',hs:'lo'}[condition];if(!inverse)throw new Error('Invalid native condition');const skip=name('skip'+sequence++);a.branch(inverse,skip).b(target).label(skip);};
    a.s.align(16);a.label('aot_entry_'+this.id).enter(frame);
    for(const op of this.ops) {
      if(op.op==='label')a.label(name(op.name));
      else if(op.op==='jump')a.b(name(op.name));
      else if(op.op==='move'){load(0,op.value);a.str(0,31,op.out.slot*8);}
      else if(op.op==='branch'){load(0,op.value);a.cmp(0,0);conditional(op.zero?'eq':'ne',name(op.name));}
      else if(op.op==='call'){
        a.mov(0,19);for(let i=0;i<7;++i)load(i+1,op.args[i]);a.bl('_vb6_aot_'+op.name).str(0,31,op.out.slot*8);
        if(op.checked){a.cmn(0,1);conditional('eq',name('failure'));}
      } else if(op.op==='select'){
        load(0,op.value);
        // Error/resume/On GoTo use a bounded binary decision tree, never an opcode interpreter.
        const tree=pairs=>{if(!pairs.length){a.b(name(op.fallback));return;}const middle=pairs.length>>1,[key,target]=pairs[middle];a.movImm(9,key).cmpReg(0,9);conditional('eq',name(target));
          if(pairs.length===1){a.b(name(op.fallback));return;}const left=name('switch'+sequence++);conditional('lo',left);tree(pairs.slice(middle+1));a.label(left);tree(pairs.slice(0,middle));};
        tree([...op.pairs].sort((a,b)=>a[0]-b[0]));
      } else throw new Error('Unknown AOT assembly operation');
    }
    a.label(name('exit')).leave(frame);
  }
  cpp() {
    const value=v=>v&&typeof v==='object'?'t['+v.slot+']':String(v??0)+'ULL';
    const used=new Set(this.ops.flatMap(op=>op.op==='jump'||op.op==='branch'?[op.name]:op.op==='select'?[op.fallback,...op.pairs.map(p=>p[1])]:op.op==='call'&&op.checked?['failure']:[]));
    const lines=['static void aot_'+this.id+'(vb6::aot::Scope*s){','using vb6::aot::Word; Word t['+this.slots+']{};'];
    for(const op of this.ops){
      if(op.op==='label'){if(used.has(op.name))lines.push(op.name+':;');}
      else if(op.op==='jump')lines.push('goto '+op.name+';');
      else if(op.op==='move')lines.push(value(op.out)+'='+value(op.value)+';');
      else if(op.op==='branch')lines.push('if('+value(op.value)+(op.zero?'==':'!=')+'0)goto '+op.name+';');
      else if(op.op==='call')lines.push(value(op.out)+'=vb6_aot_'+op.name+'(s,'+Array.from({length:7},(_,i)=>value(op.args[i])).join(',')+');'+(op.checked?'if('+value(op.out)+'==vb6::aot::failed)goto failure;':''));
      else if(op.op==='select')lines.push('switch('+value(op.value)+'){'+op.pairs.map(([v,l])=>'case '+v+':goto '+l+';').join('')+'default:goto '+op.fallback+';}');
    }
    lines.push('exit:; return;','}');return lines.join('\n');
  }
}
export function emitAOTFunctions(functions){const a=new ARM64();for(const f of functions)f.emit(a);return a.s;}
