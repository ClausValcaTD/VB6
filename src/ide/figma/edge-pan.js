/** Edge navigation arms only while the pointer is held on the same edge. Merely
 * crossing the canvas boundary on the way from Assets must not move the target
 * under the pointer. Time and speed are bounded; leaving the edge disarms it. */
export function assetEdgePan(previous,x,y,time){
  if(!Number.isFinite(time)||!Number.isFinite(x)||!Number.isFinite(y)||!x&&!y)return null;
  x=Math.max(-1,Math.min(1,x));y=Math.max(-1,Math.min(1,y));
  const direction=Math.sign(x)+','+Math.sign(y);
  if(!previous||previous.direction!==direction||time<previous.last)
    return {direction,since:time,last:time,dx:0,dy:0};
  const elapsed=Math.min(32,time-previous.last),armed=time-previous.since>=150;
  return {direction,since:previous.since,last:time,dx:armed?x*elapsed*.45:0,dy:armed?y*elapsed*.45:0};
}
