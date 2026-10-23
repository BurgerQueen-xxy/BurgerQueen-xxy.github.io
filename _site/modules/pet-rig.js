// The official front-facing drawing has one continuous head/neck/body outline.
// Deform its original control points, keeping the lower body completely still.
export const PET_ART = { width:156, height:306, eyeX:102, eyeY:42 };
const clamp = value => Math.max(-1, Math.min(1, value));
const smoothstep = value => value * value * (3 - 2 * value);

function compilePath(element) {
  const original = element.getAttribute('d');
  const tokens = original.match(/[MLCZ]|[-+]?(?:\d*\.?\d+)(?:e[-+]?\d+)?/gi);
  const pairs = [];
  for (let i=0; i<tokens.length; i++) {
    if (/^[MLCZ]$/i.test(tokens[i])) continue;
    pairs.push({index:i,x:Number(tokens[i]),y:Number(tokens[i+1])});
    i++;
  }
  return {element,original,tokens,pairs,kind:element.dataset.petRig};
}

export function createBrachioRig(svg) {
  const paths = [...svg.querySelectorAll('[data-pet-rig]')].map(compilePath);
  if (paths.length !== 7 || !paths.some(path=>path.kind==='body')) throw new Error('Incomplete Brachio drawing');

  function lookAt(x, y, eyeX=x, eyeY=y) {
    const turn=-clamp(x), pitch=clamp(y); // Artwork is mirrored; screen-right is local-left.
    if (!x && !y && !eyeX && !eyeY) {
      paths.forEach(path=>path.element.setAttribute('d',path.original));
      return;
    }
    // Yaw comes from the face moving around the head, rather than sideways roll.
    const radians=-pitch*10*Math.PI/180, cos=Math.cos(radians), sin=Math.sin(radians);
    const headWidth=1-Math.abs(turn)*.06, faceWidth=1-Math.abs(turn)*.18;
    paths.forEach(path=>{
      const tokens=[...path.tokens], face=path.kind!=='body', eye=path.kind.startsWith('eye-');
      path.pairs.forEach(({index,x:px,y:py})=>{
        // Full head movement above the chin; zero movement at the shoulders.
        const blend=1-smoothstep(Math.max(0,Math.min(1,(py-76)/80)));
        if (!blend) return;
        let sx=px, sy=py;
        if (face) {
          sx=112+(px-112)*faceWidth+turn*10;
          sy+=pitch*2;
          if (eye) {sx-=clamp(eyeX)*2.4;sy+=clamp(eyeY)*1.6;}
        }
        const hx=(sx-126)*headWidth, hy=sy-94;
        const tx=126+hx*cos-hy*sin+turn*14, ty=94+hx*sin+hy*cos+pitch*4;
        tokens[index]=(px+(tx-px)*blend).toFixed(3);
        tokens[index+1]=(py+(ty-py)*blend).toFixed(3);
      });
      path.element.setAttribute('d',tokens.join(' '));
    });
  }
  return {lookAt};
}
