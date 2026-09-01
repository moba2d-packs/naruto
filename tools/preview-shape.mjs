/**
 * Draw a spell's geometry to an SVG so you can *look* at it.
 *
 * ## Why this exists
 *
 * Kurama Arms shipped twice looking nothing like an arm, and both times the
 * code typechecked, the tests passed, and nobody could tell until it was in a
 * match. A shape is not something you can review by reading it — "does this
 * read as a hand" is answered by eyes and by nothing else.
 *
 * So the geometry gets copied here, rendered, and looked at, and only then
 * ported into the spell. Three rounds of that turned a tapering noodle with a
 * spiky ball into a limb with an elbow and a hand, and each round cost
 * seconds instead of a reload and a match.
 *
 * ## How to use it
 *
 *   node tools/preview-shape.mjs && magick tools/preview-shape.svg out.png
 *
 * Copy the *geometry* from the spell, not the colours — what is being judged
 * is the shape. Two things this harness cannot do that p5 can, both learned
 * the hard way: ImageMagick ignores the three-argument `rotate(angle cx cy)`
 * and flings the element across the canvas, and it needs a font for `<text>`
 * or it refuses the whole file. Avoid both.
 *
 * What this file currently holds is Kurama Arms, in its reaching and its
 * closed-fist states. Replace it with whatever you are drawing next.
 */
import fs from 'node:fs';
// Ba thay đổi so với bản đầu: có KHUỶU, thon vừa phải, và BÀN TAY to hẳn.
const SEG = 20;
const W_SHOULDER = 52, W_ELBOW = 42, W_WRIST = 28;
const BEND = 0.13;          // khuỷu lệch khỏi đường thẳng
const ELBOW_AT = 0.45;      // khuỷu nằm ở 45% chiều dài

function path(root, tip, slack) {
  const dx = tip.x - root.x, dy = tip.y - root.y;
  const L = Math.hypot(dx, dy) || 1;
  const px = -dy / L, py = dx / L;
  const elbow = {
    x: root.x + dx * ELBOW_AT + px * L * BEND * slack,
    y: root.y + dy * ELBOW_AT + py * L * BEND * slack,
  };
  const pts = [];
  for (let s = 0; s <= SEG; s++) {
    const t = s / SEG;
    // hai đoạn nối tại khuỷu -> có góc gãy thật, không phải cung trơn
    if (t <= ELBOW_AT) {
      const u = t / ELBOW_AT;
      // cong nhẹ cả bắp tay, để khuỷu là một chỗ uốn chứ không phải góc gãy
      const cx = root.x + (elbow.x - root.x) * 0.5 + px * L * 0.03 * slack;
      const cy = root.y + (elbow.y - root.y) * 0.5 + py * L * 0.03 * slack;
      const inv = 1 - u;
      pts.push({ x: inv*inv*root.x + 2*inv*u*cx + u*u*elbow.x,
                 y: inv*inv*root.y + 2*inv*u*cy + u*u*elbow.y, t });
    } else {
      const u = (t - ELBOW_AT) / (1 - ELBOW_AT);
      // cẳng tay cong nhẹ về phía trước
      const cx = elbow.x + (tip.x - elbow.x) * 0.5 - px * L * 0.05 * slack;
      const cy = elbow.y + (tip.y - elbow.y) * 0.5 - py * L * 0.05 * slack;
      const inv = 1 - u;
      pts.push({ x: inv*inv*elbow.x + 2*inv*u*cx + u*u*tip.x,
                 y: inv*inv*elbow.y + 2*inv*u*cy + u*u*tip.y, t });
    }
  }
  return pts;
}
const widthAt = (t) => t <= ELBOW_AT
  ? W_SHOULDER + (W_ELBOW - W_SHOULDER) * (t / ELBOW_AT)
  : W_ELBOW + (W_WRIST - W_ELBOW) * ((t - ELBOW_AT) / (1 - ELBOW_AT));

function ribbon(pts, scale) {
  const nrm = (s) => { const a = pts[Math.max(s-1,0)], b = pts[Math.min(s+1,SEG)];
    const nx = -(b.y-a.y), ny = b.x-a.x, l = Math.hypot(nx,ny)||1; return {nx:nx/l, ny:ny/l}; };
  const A = [], B = [];
  for (let s = 0; s <= SEG; s++) { const n = nrm(s), h = widthAt(pts[s].t)/2*scale;
    A.push(`${pts[s].x+n.nx*h},${pts[s].y+n.ny*h}`); B.unshift(`${pts[s].x-n.nx*h},${pts[s].y-n.ny*h}`); }
  return A.concat(B).join(' ');
}

function arm(root, tip, closed, slack) {
  const pts = path(root, tip, slack);
  let g = '';
  g += `<polygon points="${ribbon(pts,1.35)}" fill="rgb(205,105,20)" fill-opacity="0.35"/>`;
  g += `<polygon points="${ribbon(pts,1)}" fill="rgb(255,172,50)"/>`;
  g += `<polygon points="${ribbon(pts,0.38)}" fill="rgb(255,238,190)" fill-opacity="0.85"/>`;

  const wrist = pts[SEG], before = pts[SEG-2];
  const h = Math.atan2(wrist.y-before.y, wrist.x-before.x);
  const ax = Math.cos(h), ay = Math.sin(h);          // dọc theo tay
  const bx = -ay, by = ax;                            // ngang bàn tay
  const P = W_WRIST;

  // Lòng bàn tay: BẸT — rộng ngang hơn dài dọc. Một hình tròn là quả cầu.
  const palmX = wrist.x + ax*P*0.45, palmY = wrist.y + ay*P*0.45;
  const halfW = P*1.2, halfL = P*0.8;
  const quad = (cx, cy, hw, hl) => {
    // Bo góc bằng cách lấy 12 điểm quanh một ellipse dẹt theo trục bàn tay.
    const pts = [];
    for (let i = 0; i < 12; i++) {
      const th = (i/12)*Math.PI*2;
      const u = Math.cos(th)*hw, v = Math.sin(th)*hl;
      pts.push(`${cx + bx*u + ax*v},${cy + by*u + ay*v}`);
    }
    return `<polygon points="${pts.join(' ')}" fill="rgb(255,180,60)"/>`;
  };

  // Ngón mọc từ CẠNH KHỚP (một đường), không toả từ một điểm — đó là khác
  // biệt giữa một bàn tay và một quả chuỳ gai.
  const knuckleX = palmX + ax*halfL, knuckleY = palmY + ay*halfL;
  // Ngón = hộp gần như song song + đầu tròn. Tam giác nhọn luôn đọc thành
  // vuốt, và vuốt là con thú khác.
  const fingerAt = (offset, len, lean, w) => {
    const rx = knuckleX + bx*offset, ry = knuckleY + by*offset;
    const a = h + lean, cx = Math.cos(a), cy = Math.sin(a);
    const px = -cy, py = cx;
    const tipW = w*0.82;                       // thon rất nhẹ, không nhọn
    const tx = rx + cx*len, ty = ry + cy*len;
    return `<polygon points="${rx-px*w},${ry-py*w} ${tx-px*tipW},${ty-py*tipW} ${tx+px*tipW},${ty+py*tipW} ${rx+px*w},${ry+py*w}" fill="rgb(255,200,85)"/>`
         + `<circle cx="${tx}" cy="${ty}" r="${tipW}" fill="rgb(255,200,85)"/>`;
  };
  const curl = 1 - closed*0.65;
  for (let f = 0; f < 4; f++) {
    const offset = (f - 1.5) * P*0.62;
    // hơi xoè ra hai bên khi mở, gần như song song khi nắm
    const lean = (f - 1.5) * 0.16 * curl;
    const len = P*(2.1 - closed*0.95) * (f === 0 || f === 3 ? 0.82 : 1);
    g += fingerAt(offset, len, lean, P*0.27);
  }
  // ngón cái: lệch hẳn sang một bên, ngắn và dày hơn
  g += fingerAt(-P*1.25, P*(1.45 - closed*0.45), -0.85 + closed*0.45, P*0.3);
  g += quad(palmX, palmY, halfW, halfL);
  return g;
}

const W=920,H=340;
let out = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#20242c"/>`;
out += arm({x:70,y:170},{x:410,y:120},0,1) + `<circle cx="70" cy="170" r="22" fill="#4a5568"/>`;
out += arm({x:520,y:170},{x:820,y:190},1,0.3) + `<circle cx="520" cy="170" r="22" fill="#4a5568"/>`;
out += '</svg>';
fs.writeFileSync(new URL('./preview-shape.svg', import.meta.url), out); console.log('ok');
