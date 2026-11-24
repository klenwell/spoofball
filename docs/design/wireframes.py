"""Generates Spoofball's low-fidelity wireframes as SVG files in docs/design/.

Gray boxes and labels only. Each file is a row of phone frames (300 x 620),
one per state of the screen. Run from the repo root: python3 docs/design/wireframes.py docs/design
"""

import math
import sys
from pathlib import Path
from xml.sax.saxutils import escape

W, H = 300, 620          # phone frame
GAP = 40
TITLE_H = 34
INK = '#3b4048'
MID = '#8a919c'
LIGHT = '#d5d9e0'
FILL = '#eef0f3'
ACCENT = '#2f6fd6'
FONT = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif'


class Frame:
    def __init__(self, title):
        self.title = title
        self.parts = []

    def add(self, s):
        self.parts.append(s)

    # Primitives -----------------------------------------------------------
    def box(self, x, y, w, h, label='', rx=6, fill=FILL, stroke=LIGHT, size=11, color=MID, dash=False):
        d = ' stroke-dasharray="4 3"' if dash else ''
        self.add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}" stroke="{stroke}"{d}/>')
        if label:
            self.text(x + w / 2, y + h / 2 + size * 0.35, label, size=size, color=color, anchor='middle')

    def text(self, x, y, s, size=11, color=INK, anchor='start', weight=400):
        self.add(f'<text x="{x}" y="{y}" font-size="{size}" fill="{color}" text-anchor="{anchor}" '
                 f'font-weight="{weight}">{escape(s)}</text>')

    def circle(self, cx, cy, r, fill=FILL, stroke=LIGHT, width=1, dash=False):
        d = ' stroke-dasharray="3 3"' if dash else ''
        self.add(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{fill}" stroke="{stroke}" stroke-width="{width}"{d}/>')

    def line(self, x1, y1, x2, y2, color=LIGHT, width=1, dash=False):
        d = ' stroke-dasharray="3 3"' if dash else ''
        self.add(f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{color}" stroke-width="{width}"{d}/>')

    def spoof(self, cx, cy, r=8, solid=True):
        """A spoof disc: solid = yours (home kit), hollow = theirs (away kit)."""
        if solid:
            self.circle(cx, cy, r, fill=INK, stroke=INK)
        else:
            self.circle(cx, cy, r, fill='#ffffff', stroke=INK, width=2)

    def button(self, x, y, w, label, primary=True):
        fill, color = (ACCENT, '#ffffff') if primary else ('#ffffff', ACCENT)
        self.add(f'<rect x="{x}" y="{y}" width="{w}" height="36" rx="18" fill="{fill}" stroke="{ACCENT}"/>')
        self.text(x + w / 2, y + 23, label, size=12, color=color, anchor='middle', weight=600)

    def header(self, title, sub=''):
        self.text(16, 36, title, size=18, weight=700)
        if sub:
            self.text(16, 54, sub, size=11, color=MID)

    def tabs(self, active):
        self.add(f'<rect x="0" y="{H - 56}" width="{W}" height="56" fill="#ffffff" stroke="{LIGHT}"/>')
        for i, name in enumerate(['Match', 'Pharm', 'Stats']):
            x = W * (i + 0.5) / 3
            on = name == active
            color = ACCENT if on else MID
            self.circle(x, H - 36, 7, fill=('#ffffff'), stroke=color, width=2)
            if on:
                self.circle(x, H - 36, 3, fill=color, stroke=color)
            self.text(x, H - 14, name, size=10, color=color, anchor='middle', weight=600 if on else 400)

    def note(self, y, s):
        self.text(W / 2, y, s, size=10, color=MID, anchor='middle')

    def arena(self, cx, cy, r, home=(), visitor=(), benches=True):
        """Court (apron, mosh, crush, diagonals) and optional benches, as gray shapes."""
        if benches:
            for sign in (-1, 1):
                a0, a1 = (-math.pi / 2 - 0.6, -math.pi / 2 + 0.6) if sign < 0 else (math.pi / 2 - 0.6, math.pi / 2 + 0.6)
                br = r * 1.27
                x0, y0 = cx + br * math.cos(a0), cy + br * math.sin(a0)
                x1, y1 = cx + br * math.cos(a1), cy + br * math.sin(a1)
                self.add(f'<path d="M{x0:.1f},{y0:.1f} A{br:.1f},{br:.1f} 0 0 1 {x1:.1f},{y1:.1f}" '
                         f'fill="none" stroke="{FILL}" stroke-width="{r * 0.34:.1f}" stroke-linecap="round"/>')
                for i in range(5):
                    a = a0 + (a1 - a0) * i / 4
                    self.circle(cx + br * math.cos(a), cy + br * math.sin(a), r * 0.12, fill='#ffffff', stroke=LIGHT)
        self.circle(cx, cy, r, fill=FILL, stroke=LIGHT)                 # apron
        self.circle(cx, cy, r * 2 / 3, fill='#ffffff', stroke=MID)      # mosh
        k = r * 0.707
        self.line(cx - k, cy - k, cx + k, cy + k, color=LIGHT)
        self.line(cx + k, cy - k, cx - k, cy + k, color=LIGHT)
        self.circle(cx, cy, r / 6, fill=LIGHT, stroke=MID)               # crush
        for (x, y, s) in home:
            self.spoof(cx + x * r, cy + y * r, s, solid=True)
        for (x, y, s) in visitor:
            self.spoof(cx + x * r, cy + y * r, s, solid=False)

    def render(self, ox):
        inner = '\n    '.join(self.parts)
        return (f'<g transform="translate({ox},{TITLE_H})">\n'
                f'  <text x="0" y="-12" font-size="13" font-weight="700" fill="{INK}">{escape(self.title)}</text>\n'
                f'  <rect x="0" y="0" width="{W}" height="{H}" rx="22" fill="#ffffff" stroke="{INK}" stroke-width="2"/>\n'
                f'  <g>\n    {inner}\n  </g>\n</g>')


def sheet(frames, path, caption):
    width = len(frames) * W + (len(frames) - 1) * GAP + 2
    height = H + TITLE_H + 34
    body = '\n'.join(f.render(1 + i * (W + GAP)) for i, f in enumerate(frames))
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" '
           f'viewBox="0 0 {width} {height}" font-family="{FONT}">\n'
           f'<rect width="100%" height="100%" fill="#ffffff"/>\n{body}\n'
           f'<text x="1" y="{height - 8}" font-size="11" fill="{MID}">{escape(caption)}</text>\n</svg>\n')
    Path(path).write_text(svg)


# --- Draft (New Team) --------------------------------------------------------------

def draft():
    a = Frame('1 · Your team')
    a.header('Draft (New Team)', 'A new team joins the league')
    a.text(16, 92, 'Team name', size=11, color=MID)
    a.box(16, 100, W - 32, 40, 'up to 16 characters', fill='#ffffff')
    a.text(16, 168, 'Color', size=11, color=MID)
    for i in range(8):
        a.circle(32 + i * 33, 192, 12, fill=FILL if i else INK, stroke=INK if i == 0 else LIGHT, width=2 if i == 0 else 1)
    a.text(16, 236, 'Logo (emoji)', size=11, color=MID)
    for i in range(10):
        a.circle(36 + (i % 5) * 57, 266 + (i // 5) * 52, 20, fill=FILL, stroke=INK if i == 2 else LIGHT, width=2 if i == 2 else 1)
    a.text(W / 2, 270 + 2 * 52 + 4, 'curated set · 1 picked', size=10, color=MID, anchor='middle')
    a.box(16, 410, W - 32, 70, 'Preview: logo + name in your color', fill=FILL, dash=True)
    a.button(16, 540, W - 32, 'Next: the combine')

    b = Frame('2 · Combine: warm-ups')
    b.header('Combine', 'Watch them move. Pick 5 within budget.')
    b.text(W - 16, 36, '2 / 5', size=16, anchor='end', weight=700)
    cols, rows, r = 3, 4, 26
    for i in range(10):
        cx = 78 + (i % cols) * 72
        cy = 98 + (i // cols) * 66
        picked = i in (2, 9)
        b.circle(cx, cy, r, fill='#ffffff', stroke=ACCENT if picked else LIGHT, width=3 if picked else 1)
        ang = i * 1.7
        sx, sy = cx + 9 * math.cos(ang), cy + 9 * math.sin(ang)
        b.line(sx - 12 * math.cos(ang), sy - 12 * math.sin(ang), sx, sy, color=LIGHT, width=2, dash=True)
        b.spoof(sx, sy, 5 + (i % 4), solid=True)
    b.note(446, 'each cell: one candidate moving on its own, its name and price')
    b.note(461, 'tap a cell to pick · 10 candidates · budget 250')
    for i in range(5):
        b.circle(58 + i * 46, 498, 15, fill=FILL if i > 1 else INK, stroke=LIGHT if i > 1 else INK, dash=i > 1)
    b.button(16, 534, W - 32, 'Done', primary=False)

    c = Frame('3 · Combine: drills')
    c.header('Drills', '< Back to warm-ups')
    for i, name in enumerate(['Sprint', 'Blow', 'Hold']):
        x = 16 + i * 92
        c.box(x, 72, 84, 30, name, rx=15, fill=ACCENT if i == 0 else '#ffffff', stroke=ACCENT,
              color='#ffffff' if i == 0 else ACCENT, size=12)
    c.circle(W / 2, 250, 120, fill=FILL, stroke=LIGHT)
    c.circle(W / 2, 250, 80, fill='#ffffff', stroke=MID)
    c.line(W / 2 - 100, 250, W / 2 + 100, 250, color=ACCENT, width=1, dash=True)
    c.spoof(W / 2 + 70, 250, 12, solid=True)
    c.text(W / 2 + 70, 230, 'dash across and back', size=10, color=MID, anchor='middle')
    c.note(395, 'a few seconds per drill · plays again on tap')
    c.note(410, 'some randomness, like a real combine')
    c.box(16, 432, W - 32, 46, 'Drill court reuses the match simulation', fill=FILL, dash=True, size=10)
    c.button(16, 498, W - 32, 'Draft this spoof')
    c.button(16, 544, W - 32, 'Next candidate', primary=False)
    return [a, b, c]


# --- Match ------------------------------------------------------------------

def scoreboard(f, you, them, period, live=False):
    f.box(12, 14, W - 24, 52, fill='#ffffff', stroke=LIGHT)
    f.circle(32, 40, 9, fill=INK, stroke=INK)
    f.text(48, 36, 'You', size=10, color=MID)
    f.text(48, 54, you, size=16, weight=700)
    f.circle(W - 32, 40, 9, fill='#ffffff', stroke=INK, width=2)
    f.text(W - 48, 36, 'Rival', size=10, color=MID, anchor='end')
    f.text(W - 48, 54, them, size=16, weight=700, anchor='end')
    f.box(W / 2 - 40, 26, 80, 26, period, rx=13, size=11, color=INK)
    if live:
        f.box(12, 70, W - 24, 6, rx=3, fill=LIGHT, stroke=LIGHT)
        f.box(12, 70, (W - 24) * 0.55, 6, rx=3, fill=ACCENT, stroke=ACCENT)


def match():
    a = Frame('1 · Mise: place your spoofs')
    scoreboard(a, '0', '0', 'Scrum 1/3')
    a.arena(W / 2, 290, 92,
            home=[(-0.85, 0.35, 7)],
            visitor=[(0.8, -0.45, 7), (-0.2, 0.3, 8)])
    a.spoof(W / 2 + 40, 404, 9, solid=True)
    a.circle(W / 2 + 40, 404, 13, fill='none', stroke=ACCENT, width=2)
    a.note(468, 'tap a spoof on your bench, then tap the apron')
    a.note(483, 'rule: 2 on the apron, 1 anywhere')
    a.button(16, 500, W - 32, 'Start scrum')
    a.tabs('Match')

    b = Frame('2 · Scrum in play')
    scoreboard(b, '23', '20', 'Scrum 2/3', live=True)
    b.arena(W / 2, 290, 92,
            home=[(-0.3, 0.2, 10), (0.1, -0.05, 8), (-0.6, -0.5, 7)],
            visitor=[(0.4, -0.3, 9), (0.55, 0.5, 8), (-0.75, 0.4, 7)])
    b.note(472, 'spoofs play on their own; you watch')
    b.note(487, 'clock bar under the scoreboard: 8 s a scrum')
    b.button(16, 500, W - 32, 'Pause', primary=False)
    b.tabs('Match')

    c = Frame('3 · Result')
    c.header('Won 47 – 38', 'Spoofs vs Rival · 3 scrums')
    c.box(16, 76, W - 32, 90, fill='#ffffff')
    for i, row in enumerate(['Scrum', '1', '2', '3']):
        y = 96 + i * 20
        c.text(28, y, row, size=11, color=MID if i == 0 else INK)
        c.text(160, y, 'You' if i == 0 else ['', '14', '18', '15'][i], size=11, color=MID if i == 0 else INK, anchor='end')
        c.text(260, y, 'Rival' if i == 0 else ['', '12', '11', '15'][i], size=11, color=MID if i == 0 else INK, anchor='end')
    c.text(16, 192, 'Your spoofs', size=11, color=MID)
    for i in range(5):
        y = 208 + i * 34
        c.spoof(30, y + 10, 9, solid=True)
        c.box(48, y, 150, 22, fill=FILL, stroke=FILL)
        c.text(W - 16, y + 15, f'{[14, 12, 10, 7, 4][i]} pts', size=11, anchor='end')
    c.note(424, 'outcomes only: points, scrums played (never skills)')
    c.button(16, 444, W - 32, 'Play another match')
    c.button(16, 490, W - 32, 'Go to Pharm', primary=False)
    c.tabs('Match')
    return [a, b, c]


# --- Pharm ------------------------------------------------------------------

def pick_dots(f, y):
    """Draft picks left, out of 3: filled dots are picks you have."""
    f.text(W / 2 - 34, y + 4, 'Draft picks', size=11, color=MID, anchor='end')
    for i in range(3):
        have = i < 2
        f.circle(W / 2 - 18 + i * 18, y, 6, fill=ACCENT if have else '#ffffff', stroke=ACCENT, width=2)


def pharm():
    a = Frame('1 · Roster')
    a.circle(36, 40, 20, fill=FILL, stroke=INK, width=2)
    a.text(64, 36, 'Spoofs', size=18, weight=700)
    a.text(64, 54, '3–2–1 · 6 matches', size=11, color=MID)
    for i in range(5):
        y = 84 + i * 56
        a.box(12, y, W - 24, 48, fill='#ffffff')
        a.circle(42, y + 24, 16, fill='#ffffff', stroke=LIGHT)
        a.spoof(42 + (i % 3) - 1, y + 24, 8, solid=True)
        a.box(68, y + 10, 110, 12, fill=FILL, stroke=FILL)
        a.text(68, y + 38, f'6 matches · {[5.8, 5.6, 5.0, 5.0, 3.8][i]} pts/scrum', size=10, color=MID)
        a.text(W - 24, y + 30, '›', size=18, color=MID, anchor='end')
    a.note(376, 'each spoof moves in its cell, as in the combine')
    a.note(391, 're-draft resets the record and stats (with a warning)')
    a.button(16, 406, W - 32, 'Re-draft the team', primary=False)
    a.tabs('Pharm')

    b = Frame('2 · Spoof card')
    b.header('‹ Roster')
    b.circle(W / 2, 140, 62, fill='#ffffff', stroke=LIGHT)
    b.line(W / 2 - 30, 152, W / 2 + 6, 132, color=LIGHT, width=2, dash=True)
    b.spoof(W / 2 + 10, 130, 14, solid=True)
    b.note(222, 'warm-up: it moves; no skill numbers anywhere')
    stats = [('Matches', '6'), ('Scrums', '12'), ('Pts / scrum', '5.8'), ('+/− / scrum', '+1.9')]
    for i, (k, v) in enumerate(stats):
        x = 16 + (i % 2) * 138
        y = 240 + (i // 2) * 58
        b.box(x, y, 130, 50, fill=FILL, stroke=FILL)
        b.text(x + 12, y + 20, k, size=10, color=MID)
        b.text(x + 12, y + 40, v, size=16, weight=700)
    b.button(16, 372, W - 32, 'Scout: run drills')
    b.button(16, 418, W - 32, 'Replace this spoof', primary=False)
    b.tabs('Pharm')

    c = Frame('3 · Replace')
    c.header('Replace', 'Pick 1 of 3 prospects · costs 1 draft pick')
    c.box(12, 72, W - 24, 44, fill=FILL, stroke=FILL)
    c.spoof(36, 94, 9, solid=True)
    c.text(56, 98, 'Replacing this spoof', size=11)
    for i in range(3):
        cx = 58 + i * 92
        cy = 190
        picked = i == 1
        c.circle(cx, cy, 40, fill='#ffffff', stroke=ACCENT if picked else LIGHT, width=3 if picked else 1)
        c.spoof(cx + (i % 2) * 8 - 4, cy + 3, 8 + i * 2, solid=True)
    c.note(262, 'tap a cell for drills, same as the combine')
    c.note(277, 'prospects you pass on stay for next time')
    pick_dots(c, 314)
    c.note(342, 'a loss earns a pick back, up to 3')
    c.button(16, 444, W - 32, 'Swap in the picked spoof')
    c.button(16, 490, W - 32, 'Cancel', primary=False)
    c.tabs('Pharm')
    return [a, b, c]


# --- Stats ------------------------------------------------------------------

def stats():
    a = Frame('1 · Team')
    a.circle(36, 40, 20, fill=FILL, stroke=INK, width=2)
    a.text(64, 36, 'Spoofs', size=18, weight=700)
    a.text(64, 54, 'joined the league · Nov 2026', size=11, color=MID)
    for i, (k, v) in enumerate([('Record', '3–2–1'), ('Matches', '6'), ('Pts / match', '46'), ('Best', '71')]):
        x = 16 + (i % 2) * 138
        y = 76 + (i // 2) * 58
        a.box(x, y, 130, 50, fill=FILL, stroke=FILL)
        a.text(x + 12, y + 20, k, size=10, color=MID)
        a.text(x + 12, y + 40, v, size=16, weight=700)
    a.text(16, 214, 'Match log', size=11, color=MID)
    for i in range(6):
        y = 224 + i * 40
        a.box(12, y, W - 24, 34, fill='#ffffff')
        a.text(24, y + 22, ['W', 'W', 'L', 'W', 'L', 'T'][i], size=12, weight=700)
        a.box(44, y + 11, 110, 12, fill=FILL, stroke=FILL)
        a.text(W - 24, y + 22, ['47–38', '71–52', '33–41', '52–49', '28–60', '44–44'][i], size=11, anchor='end')
    a.tabs('Stats')

    b = Frame('2 · Spoof lines')
    b.header('Spoofs', 'Outcomes only, across all matches')
    cols = ['', 'Mat', 'Scr', 'Pts', 'Pts/scr', '+/−']
    xs = [30, 92, 132, 178, 228, 278]
    for x, h in zip(xs, cols):
        b.text(x, 90, h, size=10, color=MID, anchor='middle')
    # 6 matches × 3 scrums × 3 spoofs = 54 spoof-scrums, about 11 each; the
    # points add up to the team's 275 in the match log.
    rows = [(6, 12, 70, 5.8, '+1.9'), (6, 11, 62, 5.6, '+1.2'), (6, 11, 55, 5.0, '+0.6'),
            (6, 10, 50, 5.0, '+0.1'), (6, 10, 38, 3.8, '−1.0')]
    for i, row in enumerate(rows):
        y = 112 + i * 40
        b.line(12, y - 16, W - 12, y - 16, color=FILL)
        b.spoof(30, y - 2, 9, solid=True)
        for x, v in zip(xs[1:], row):
            b.text(x, y + 2, str(v), size=11, anchor='middle')
    b.note(372, '+/− = team points minus opponent points per scrum')
    b.note(387, 'while that spoof played (from the prototype)')
    b.note(402, 'tap a row for the spoof card in Pharm')
    b.tabs('Stats')
    return [a, b]


def main(out):
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    sheet(draft(), out / 'wireframe-draft.svg',
          'Draft (New Team): create your team, then draft 5 spoofs through the combine. Phone layout. Solid discs are yours.')
    sheet(match(), out / 'wireframe-match.svg',
          'Match: place spoofs (the mise), watch the scrum, see the result. Solid discs are yours, hollow discs the visitor.')
    sheet(pharm(), out / 'wireframe-pharm.svg',
          'Pharm: manage your roster, scout a spoof with drills, replace one, or re-draft. No skill numbers anywhere.')
    sheet(stats(), out / 'wireframe-stats.svg',
          'Stats: team record and match log, then a line per spoof. Outcomes only.')


if __name__ == '__main__':
    main(sys.argv[1])
