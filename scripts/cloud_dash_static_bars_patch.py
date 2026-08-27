from pathlib import Path

p = Path('cloud-dash-v4.js')
s = p.read_text()

old = """    const lipR = Math.min(17, Math.max(12, w * .2));
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
"""

new = """    // Static lip: fixed local geometry, no per-frame wobble or changing decorations.
    const radii = [14, 16, 14, 16, 14, 16];
    for (let i = 0; i < radii.length; i++) {
      const px = x + 4 + (w - 8) * (i / (radii.length - 1));
      drawCloudPuff(px, lipY + lipDir * 2, radii[i], '#ffffff', '#e3f5fc');
    }
"""

if old not in s:
    raise SystemExit('Expected Cloud Dash bar decoration block not found')

s = s.replace(old, new, 1)
s = s.replace("ctx.shadowColor = 'rgba(91,170,205,.22)'; ctx.shadowBlur = Math.round(18 * quality().shadow);", "ctx.shadowColor = 'rgba(91,170,205,.14)'; ctx.shadowBlur = Math.round(9 * quality().shadow);", 1)
s = s.replace("ctx.strokeStyle = 'rgba(104,190,220,.48)'", "ctx.strokeStyle = 'rgba(104,190,220,.30)'", 1)
p.write_text(s)
