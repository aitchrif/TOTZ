from pathlib import Path
import re

p = Path('cloud-dash-v4.js')
s = p.read_text()
marker = '// CUTE CLOUD BARS V1'
if marker in s:
    print('Cute cloud bars patch already installed.')
    raise SystemExit(0)

anchor = "  function drawCloud(x, y, s, a = .7) { ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y, 35 * s, 0, Math.PI * 2); ctx.arc(x + 35 * s, y - 10 * s, 45 * s, 0, Math.PI * 2); ctx.arc(x + 78 * s, y, 34 * s, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }\n"
assert anchor in s, 'drawCloud anchor missing'

helpers = """  // CUTE CLOUD BARS V1 — visual only, gameplay hitboxes stay unchanged.
  function drawCloudPuff(cx, cy, r, c1 = '#ffffff', c2 = '#dff6ff') {
    const rg = ctx.createRadialGradient(cx - r * .28, cy - r * .34, Math.max(2, r * .16), cx, cy, r);
    rg.addColorStop(0, c1); rg.addColorStop(1, c2);
    ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  }
  function drawCloudWall(x, y, w, h, flip = false) {
    if (h <= 0) return;
    ctx.save();
    const grad = ctx.createLinearGradient(x, y, x + w, y + h);
    grad.addColorStop(0, '#ffffff'); grad.addColorStop(.45, '#eefaff'); grad.addColorStop(1, '#d9f2ff');
    ctx.fillStyle = grad;
    ctx.shadowColor = 'rgba(91,170,205,.22)'; ctx.shadowBlur = Math.round(18 * quality().shadow);
    ctx.fillRect(x + 7, y, Math.max(0, w - 14), h);
    ctx.shadowBlur = 0;
    const lipY = flip ? y : y + h;
    const lipDir = flip ? 1 : -1;
    const lipR = Math.min(17, Math.max(12, w * .2));
    for (let px = x + 3; px <= x + w - 3; px += 16) {
      const wobble = Math.sin(px * .13) * 2;
      drawCloudPuff(px, lipY + lipDir * 2 + wobble, lipR + ((Math.floor(px / 16) % 2) ? 2 : 0), '#ffffff', '#d9f2ff');
    }
    for (let py = y + 18; py < y + h - 15; py += 30) {
      drawCloudPuff(x + 6, py, 10, '#ffffff', '#e7f8ff');
      drawCloudPuff(x + w - 6, py + 8, 10, '#ffffff', '#e7f8ff');
    }
    ctx.globalAlpha = .9;
    ctx.fillStyle = '#ffffff';
    for (let py = y + 22; py < y + h - 18; py += 50) {
      ctx.beginPath(); ctx.arc(x + w * .36, py, 3.2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (qualityLevel > 0 && h > 70) {
      const dots = [
        ['#ffdbe9', .28, .24], ['#fff0a8', .68, .4], ['#dcffd9', .42, .67], ['#dfe7ff', .62, .16]
      ];
      for (const [c, px, py] of dots) {
        const yy = y + h * py;
        if (yy > y + 15 && yy < y + h - 15) {
          ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x + w * px, yy, 4, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
    ctx.strokeStyle = 'rgba(104,190,220,.48)'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + 8, y + 2); ctx.lineTo(x + 8, y + h - 2);
    ctx.moveTo(x + w - 8, y + 2); ctx.lineTo(x + w - 8, y + h - 2);
    ctx.stroke();
    ctx.restore();
  }
"""
s = s.replace(anchor, anchor + helpers, 1)

new_gate = """  function drawGate(g) {
    ctx.save();
    const topH = Math.max(0, g.gapY - 8);
    const bottomY = g.gapY + g.gapH + 8;
    const bottomH = Math.max(0, H - bottomY);
    drawCloudWall(g.x, 0, g.w, topH, false);
    drawCloudWall(g.x, bottomY, g.w, bottomH, true);
    if (qualityLevel > 0) {
      const centerY = g.gapY + g.gapH / 2;
      const glow = ctx.createRadialGradient(g.x + g.w / 2, centerY, 4, g.x + g.w / 2, centerY, 72);
      glow.addColorStop(0, 'rgba(255,255,255,.18)'); glow.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = glow; ctx.fillRect(g.x - 35, g.gapY - 35, g.w + 70, g.gapH + 70);
    }
    ctx.restore();
  }
"""
pattern = r"  function drawGate\(g\) \{.*?\n  function drawPickup\(p\) \{"
s2, count = re.subn(pattern, new_gate + "  function drawPickup(p) {", s, count=1, flags=re.S)
assert count == 1, f'drawGate replacement count was {count}'
p.write_text(s2)
print('Patched bytes', len(s2.encode()))
