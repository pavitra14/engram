import json
INK='#15171A'; SOFT='#5A5F66'; LINE='#D5D8D2'; RULE='#DADDD6'; BG='#F3F4F1'; BLUE='#1F3FBF'
SERIF="font-family: Newsreader, Georgia, serif"
def page(title, body):
    return f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>{title}</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,500&family=Inter:wght@400;500;600&display=swap">
<style>
body{{margin:0}}
</style>
</helmet>
<div style="position: relative; width: 390px; height: 844px; box-sizing: border-box; overflow: hidden; background: {BG}; color: {INK}; font-family: Inter, system-ui, sans-serif">
{body}
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{{"$preview":{{"width":390,"height":844}}}}'>
class Component extends DCLogic {{
renderVals() {{
return {{}};
}}
}}
</script>
</body>
</html>
'''
def svg(paths, size=20, stroke='currentColor', sw=2, extra=''):
    return f'<svg aria-hidden="true" width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="{stroke}" stroke-width="{sw}" stroke-linecap="round" stroke-linejoin="round"{extra}>{paths}</svg>'
P=dict(
 search='<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
 map='<circle cx="6" cy="7" r="2.5"/><circle cx="18" cy="9" r="2.5"/><circle cx="11" cy="18" r="2.5"/><path d="M8.3 7.6l7.3 1M7.2 9.2l2.8 6.6M16.6 11l-4 5.2"/>',
 list='<path d="M5 7h14M5 12h14M5 17h14"/>',
 mic='<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/>',
 back='<path d="M15 5l-7 7 7 7"/>',
 link='<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/>',
 check='<path d="M5 12.5l4.5 4.5L19 7.5"/>',
 x='<path d="M6 6l12 12M18 6L6 18"/>',
 play='<path d="M8 5l11 7-11 7z"/>',
 more='<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
 plus='<path d="M12 5v14M5 12h14"/>',
 note='<circle cx="12" cy="12" r="8"/>',
 diamond='<path d="M12 3l9 9-9 9-9-9z"/>',
 image='<rect x="4" y="4" width="16" height="16" rx="2"/>',
)
KIND=dict(note='note', voice='mic', link='diamond', image='image')
def glyph(kind): return svg(P[KIND[kind]], 14, BLUE, 2.4)
def round_btn(icon, label, solid=False):
    st = f'border: 0; background: {BLUE}; color: #FFFFFF' if solid else f'border: 1px solid {LINE}; background: #FFFFFF; color: {INK}'
    return f'<button aria-label="{label}" style="width: 48px; height: 48px; flex-shrink: 0; border-radius: 24px; {st}; display: flex; align-items: center; justify-content: center; padding: 0">{svg(P[icon])}</button>'
def header(title, sub, buttons, back=None):
    b = ''
    if back:
        b = f'<a href="{back[1]}" style="display: flex; align-items: center; gap: 2px; min-height: 44px; margin-left: -6px; color: {SOFT}; text-decoration: none; font-size: 14px; font-weight: 500">{svg(P["back"],18)}{back[0]}</a>\n'
    top = 44 if back else 56
    return f'''<div style="position: absolute; left: 24px; right: 20px; top: {top}px; display: flex; align-items: flex-start; justify-content: space-between">
<div style="display: flex; flex-direction: column; gap: 2px">
{b}<div style="{SERIF}; font-weight: 500; font-size: 38px; line-height: 42px; letter-spacing: -0.8px">{title}</div>
<div style="font-size: 14px; line-height: 20px; color: {SOFT}">{sub}</div>
</div>
<div style="display: flex; gap: 8px">{''.join(buttons)}</div>
</div>'''
def capture():
    return f'''<div style="position: absolute; left: 0; right: 0; bottom: 0; height: 150px; background: linear-gradient(to bottom, rgba(243,244,241,0), {BG} 45%)"></div>
<div style="position: absolute; left: 16px; right: 16px; bottom: 28px; display: flex; align-items: center; gap: 12px">
<label style="flex-grow: 1; height: 64px; box-sizing: border-box; border-radius: 32px; border: 1px solid {LINE}; background: #FFFFFF; display: flex; align-items: center; padding: 0 22px">
<span style="position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%)">New thought</span>
<input type="text" placeholder="Write a thought" style="width: 100%; border: 0; outline-offset: 6px; background: transparent; font-family: inherit; font-size: 16px; color: {INK}">
</label>
<a href="Voice.dc.html" aria-label="Record a voice note" style="width: 64px; height: 64px; flex-shrink: 0; border-radius: 32px; background: {BLUE}; color: #FFFFFF; display: flex; align-items: center; justify-content: center">{svg(P['mic'],26)}</a>
</div>'''
def entry(kind, meta, text, sub, last=False, size=22, href='Thought.dc.html'):
    lh = round(size*1.36)
    border = '' if last else f'; padding-bottom: 18px; border-bottom: 1px solid {RULE}'
    return f'''<a href="{href}" style="display: flex; flex-direction: column; gap: 6px; color: {INK}; text-decoration: none{border}">
<div style="display: flex; align-items: center; gap: 8px; font-size: 13px; line-height: 18px; color: {SOFT}">{glyph(kind)}<span>{meta}</span></div>
<div style="{SERIF}; font-size: {size}px; line-height: {lh}px; letter-spacing: -0.1px">{text}</div>
<div style="font-size: 14px; line-height: 20px; color: {SOFT}">{sub}</div>
</a>'''
def hue(h): return f'background: oklch(0.93 0.04 {h}); border: 1px solid oklch(0.72 0.09 {h})'
def pill(text, h=None, sel=False):
    st = hue(h) if h is not None else (f'background: {INK}; border: 1px solid {INK}; color: #FFFFFF' if sel else f'background: #FFFFFF; border: 1px solid {LINE}')
    col = '' if (h is None and sel) else f'; color: {INK}'
    return f'<button style="height: 48px; flex-shrink: 0; padding: 0 16px; border-radius: 24px; {st}{col}; font-family: inherit; font-size: 14px; font-weight: 500; white-space: nowrap">{text}</button>'
G=dict(engram=285, sourdough=75, reading=185, hampi=20, running=140)

files={}
# ---------- Home ----------
files['Home.dc.html']=page('Home: today and your groups', header('Today','Monday 16 November, 4 thoughts',[round_btn('search','Search your thoughts'), f'<a href="Map.dc.html" aria-label="Open the map of your thoughts" style="width: 48px; height: 48px; border-radius: 24px; border: 1px solid {LINE}; background: #FFFFFF; color: {INK}; display: flex; align-items: center; justify-content: center">{svg(P["map"])}</a>'])+f'''
<div style="position: absolute; left: 24px; right: 0; top: 146px; display: flex; gap: 8px; overflow: hidden">
{pill('Sourdough, 6',G['sourdough'])}{pill('Hampi trip, 5',G['hampi'])}{pill('Engram ideas, 9',G['engram'])}{pill('Reading and habits, 6',G['reading'])}
</div>
<div style="position: absolute; left: 24px; right: 24px; top: 214px; display: flex; flex-direction: column; gap: 18px">
{entry('voice','Voice, 9:42 am','Buy bread flour and rye for the starter this weekend','In Sourdough, linked to 3 thoughts')}
{entry('link','Link from Chrome, 8:15 am','Hampi three day itinerary','In Hampi trip, linked to 4 thoughts')}
{entry('note','Note, 7:30 am','Graph view idea: new thoughts should drift toward the cluster they belong to','In Engram ideas, linked to 2 thoughts')}
{entry('note','Note, 7:10 am','Sleep before 11 on nights before the long run','In Running, linked to 3 thoughts',last=True)}
</div>
'''+capture())

# ---------- Map ----------
def blob(x,y,d,name,count,h,fs,href='Group.dc.html'):
    return f'''<a href="{href}" style="position: absolute; left: {x}px; top: {y}px; width: {d}px; height: {d}px; box-sizing: border-box; border-radius: {d//2}px; {hue(h)}; color: {INK}; text-decoration: none; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; text-align: center">
<span style="{SERIF}; font-weight: 500; font-size: {fs}px; line-height: {fs+4}px; letter-spacing: -0.2px">{name}</span>
<span style="font-size: 13px; line-height: 18px; color: #3F444B">{count}</span>
</a>'''
files['Map.dc.html']=page('Map of your groups', f'''<svg aria-hidden="true" width="390" height="844" viewBox="0 0 390 844" style="position: absolute; left: 0; top: 0">
<g stroke="#9EA39B" stroke-width="1.5" fill="none">
<path d="M128 262 L268 330"/><path d="M128 262 L112 452"/><path d="M268 330 L282 520"/><path d="M112 452 L282 520"/><path d="M112 452 L268 330"/><path d="M112 452 L194 592"/><path d="M282 520 L194 592"/>
</g>
</svg>
'''+header('Map','31 thoughts in 5 groups',[round_btn('search','Search your thoughts'), f'<a href="Home.dc.html" aria-label="Back to today" style="width: 48px; height: 48px; border-radius: 24px; border: 1px solid {LINE}; background: #FFFFFF; color: {INK}; display: flex; align-items: center; justify-content: center">{svg(P["list"])}</a>'])+f'''
{blob(48,182,160,'Engram ideas','9 thoughts',G['engram'],22)}
{blob(212,274,112,'Sourdough','6 thoughts',G['sourdough'],18)}
{blob(44,384,136,'Reading<br>and habits','6 thoughts',G['reading'],19)}
{blob(224,462,116,'Hampi trip','5 thoughts',G['hampi'],18)}
{blob(150,548,88,'Running','4',G['running'],16)}
<a href="Thought.dc.html" style="position: absolute; left: 16px; right: 16px; bottom: 112px; box-sizing: border-box; padding: 14px 16px; border-radius: 20px; border: 1px solid {LINE}; background: #FFFFFF; color: {INK}; text-decoration: none; display: flex; flex-direction: column; gap: 2px">
<span style="font-size: 15px; line-height: 21px; font-weight: 500">Buy bread flour and rye for the starter</span>
<span style="font-size: 13px; line-height: 18px; color: {SOFT}">Saved 2 minutes ago and placed in Sourdough</span>
</a>
'''+capture().split('\n',1)[1])

# ---------- Group ----------
files['Group.dc.html']=page('Group: Sourdough', header('Sourdough','6 thoughts, newest today',[round_btn('search','Search this group'), round_btn('more','More actions for this group')],back=('Map','Map.dc.html'))+f'''
<div style="position: absolute; left: 24px; right: 0; top: 166px; display: flex; align-items: center; gap: 8px; overflow: hidden">
<span style="font-size: 13px; color: {SOFT}; flex-shrink: 0">Near</span>
{pill('Reading and habits',G['reading'])}{pill('Engram ideas',G['engram'])}{pill('Hampi trip',G['hampi'])}
</div>
<div style="position: absolute; left: 24px; right: 24px; top: 234px; display: flex; flex-direction: column; gap: 18px">
{entry('voice','Voice, today 9:42 am','Buy bread flour and rye for the starter this weekend','Linked to 3 thoughts here',size=20)}
{entry('note','Note, yesterday','Sourdough: feed the starter at night, bake in the morning','Linked to 4 thoughts here',size=20)}
{entry('note','Note, 2 days ago','Sourdough crumb was too dense, try a longer proof and wetter dough','Linked to 3 thoughts here',size=20)}
{entry('link','Link, 2 days ago','Sourdough hydration chart for beginners','baking.example',size=20,last=True)}
</div>
'''+capture())

# ---------- Voice ----------
bars=[10,18,30,22,40,54,36,24,46,60,42,28,18,34,50,38,22,14,26,44,58,40,24,12]
barhtml=''.join(f'<div style="width: 6px; height: {b}px; border-radius: 3px; background: {BLUE}"></div>' for b in bars)
files['Voice.dc.html']=page('Recording a voice note', f'''<div style="position: absolute; left: 24px; right: 24px; top: 60px; display: flex; align-items: center; justify-content: space-between">
<div style="display: flex; align-items: center; gap: 10px; font-size: 15px; font-weight: 500"><div style="width: 10px; height: 10px; border-radius: 5px; background: {BLUE}"></div>Listening</div>
<div style="font-size: 15px; font-weight: 500; font-variant-numeric: tabular-nums; color: {SOFT}">0:09</div>
</div>
<div style="position: absolute; left: 24px; right: 24px; top: 150px; {SERIF}; font-size: 32px; line-height: 42px; letter-spacing: -0.4px">Buy bread flour and rye for the starter <span style="color: #7A8088">this weekend</span></div>
<div aria-hidden="true" style="position: absolute; left: 24px; right: 24px; bottom: 236px; height: 64px; display: flex; align-items: center; justify-content: space-between">{barhtml}</div>
<div style="position: absolute; left: 24px; right: 24px; bottom: 176px; text-align: center; font-size: 14px; line-height: 20px; color: {SOFT}">Transcribed on this phone. Audio never leaves it.</div>
<div style="position: absolute; left: 24px; right: 24px; bottom: 40px; display: flex; align-items: center; justify-content: space-between">
<a href="Home.dc.html" style="height: 56px; width: 104px; box-sizing: border-box; border-radius: 28px; border: 1px solid {LINE}; background: #FFFFFF; color: {INK}; text-decoration: none; font-size: 15px; font-weight: 500; display: flex; align-items: center; justify-content: center">Discard</a>
<a href="Thought.dc.html" aria-label="Save voice note" style="width: 96px; height: 96px; border-radius: 48px; background: {BLUE}; color: #FFFFFF; display: flex; align-items: center; justify-content: center">{svg(P['check'],36,sw=2.4)}</a>
<button style="height: 56px; width: 104px; box-sizing: border-box; border-radius: 28px; border: 1px solid {LINE}; background: #FFFFFF; color: {INK}; font-family: inherit; font-size: 15px; font-weight: 500">Pause</button>
</div>''')

# ---------- Share ----------
files['Share.dc.html']=page('Saved from the share sheet', f'''<div style="position: absolute; left: 0; top: 0; width: 390px; height: 844px; background: #C9CCC6; display: flex; align-items: flex-start; justify-content: center">
<div style="margin-top: 150px; font-size: 14px; color: #3F444B">The app you shared from</div>
</div>
<div style="position: absolute; left: 0; top: 0; width: 390px; height: 844px; background: rgba(21,23,26,0.45)"></div>
<div style="position: absolute; left: 0; right: 0; bottom: 0; box-sizing: border-box; padding: 12px 24px 36px; border-radius: 28px 28px 0 0; border-top: 1px solid {LINE}; background: {BG}; display: flex; flex-direction: column; gap: 18px">
<div aria-hidden="true" style="align-self: center; width: 40px; height: 4px; border-radius: 2px; background: #B9BDB5"></div>
<div style="display: flex; align-items: center; gap: 14px">
<div style="width: 44px; height: 44px; flex-shrink: 0; border-radius: 22px; background: {BLUE}; color: #FFFFFF; display: flex; align-items: center; justify-content: center">{svg(P['check'],22,sw=2.4)}</div>
<div style="{SERIF}; font-weight: 500; font-size: 28px; line-height: 34px; letter-spacing: -0.4px">Saved to Engram</div>
</div>
<div style="padding: 16px; border-radius: 20px; border: 1px solid {LINE}; background: #FFFFFF; display: flex; flex-direction: column; gap: 6px">
<div style="display: flex; align-items: center; gap: 8px; font-size: 13px; line-height: 18px; color: {SOFT}">{glyph('link')}<span>Link, travel.example</span></div>
<div style="{SERIF}; font-size: 22px; line-height: 30px">Hampi three day itinerary</div>
<div style="font-size: 14px; line-height: 20px; color: {SOFT}">Placed in Hampi trip, linked to 4 thoughts</div>
</div>
<div style="display: flex; gap: 12px">
<button style="flex: 1 1 0; height: 56px; border-radius: 28px; border: 1px solid {LINE}; background: #FFFFFF; color: {INK}; font-family: inherit; font-size: 15px; font-weight: 500">Add a note</button>
<button style="flex: 1 1 0; height: 56px; border-radius: 28px; border: 0; background: {BLUE}; color: #FFFFFF; font-family: inherit; font-size: 15px; font-weight: 600">Done</button>
</div>
<div style="text-align: center; font-size: 13px; line-height: 18px; color: {SOFT}">This closes on its own if you do nothing.</div>
</div>''')

# ---------- Thought ----------
def linked(kind,text,why):
    return f'''<a href="Thought.dc.html" style="display: flex; flex-direction: column; gap: 4px; padding: 12px 0; border-top: 1px solid {RULE}; color: {INK}; text-decoration: none">
<div style="{SERIF}; font-size: 18px; line-height: 25px">{text}</div>
<div style="display: flex; align-items: center; gap: 8px; font-size: 13px; line-height: 18px; color: {SOFT}">{glyph(kind)}<span>{why}</span></div>
</a>'''
pbars=[8,14,22,16,26,20,12,24,18,10,20,26,14,8,16,22,12]
pb=''.join(f'<div style="width: 4px; height: {b}px; border-radius: 2px; background: {BLUE if i<6 else "#AEB3AA"}"></div>' for i,b in enumerate(pbars))
files['Thought.dc.html']=page('A thought and what it links to', f'''<div style="position: absolute; left: 12px; right: 16px; top: 48px; display: flex; align-items: center; justify-content: space-between">
<a href="Home.dc.html" style="display: flex; align-items: center; gap: 2px; min-height: 48px; padding: 0 12px 0 8px; color: {SOFT}; text-decoration: none; font-size: 14px; font-weight: 500">{svg(P['back'],18)}Today</a>
{round_btn('more','More actions: edit, move, delete')}
</div>
<div style="position: absolute; left: 24px; right: 24px; top: 116px; display: flex; flex-direction: column; gap: 16px">
<div style="display: flex; align-items: center; gap: 8px; font-size: 13px; line-height: 18px; color: {SOFT}">{glyph('voice')}<span>Voice, today 9:42 am</span></div>
<div style="{SERIF}; font-size: 27px; line-height: 36px; letter-spacing: -0.3px">Buy bread flour and rye for the starter this weekend</div>
<div style="display: flex; align-items: center; gap: 14px; padding: 8px 18px 8px 8px; border-radius: 32px; border: 1px solid {LINE}; background: #FFFFFF">
{round_btn('play','Play voice note',solid=True)}
<div aria-hidden="true" style="flex-grow: 1; height: 28px; display: flex; align-items: center; justify-content: space-between">{pb}</div>
<span style="font-size: 13px; color: {SOFT}; font-variant-numeric: tabular-nums">0:03 / 0:09</span>
</div>
<div style="display: flex; flex-wrap: wrap; gap: 8px">
{pill('In Sourdough',G['sourdough'])}{pill('shopping')}{pill('Add a tag')}
</div>
<div style="display: flex; flex-direction: column; margin-top: 6px">
<div style="display: flex; align-items: center; justify-content: space-between; padding-bottom: 6px">
<div style="font-size: 15px; font-weight: 600">Linked thoughts</div>
<button style="height: 44px; padding: 0 4px; border: 0; background: transparent; color: {BLUE}; font-family: inherit; font-size: 14px; font-weight: 600">Link another</button>
</div>
{linked('note','Sourdough: feed the starter at night, bake in the morning','Both mention the starter')}
{linked('note','Sourdough crumb was too dense, try a longer proof','Both are in Sourdough')}
{linked('note','Dinner idea: dal with the sourdough flatbread experiment','Both are in Sourdough')}
</div>
</div>''')

# ---------- Search ----------
def result(kind,meta,text,sub,last=False):
    return entry(kind,meta,text,sub,last=last,size=20)
B=lambda w: f'<span style="background: oklch(0.9 0.07 265); border-radius: 4px; padding: 0 2px">{w}</span>'
files['Search.dc.html']=page('Search results', f'''<div style="position: absolute; left: 16px; right: 16px; top: 52px; display: flex; align-items: center; gap: 8px">
<label style="flex-grow: 1; height: 56px; box-sizing: border-box; border-radius: 28px; border: 2px solid {BLUE}; background: #FFFFFF; display: flex; align-items: center; gap: 10px; padding: 0 8px 0 18px">
{svg(P['search'],18,SOFT)}
<span style="position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%)">Search your thoughts</span>
<input type="text" value="sourdough" style="flex-grow: 1; min-width: 0; border: 0; outline: 0; background: transparent; font-family: inherit; font-size: 16px; color: {INK}">
<button aria-label="Clear search" style="width: 44px; height: 44px; border: 0; border-radius: 22px; background: transparent; color: {SOFT}; display: flex; align-items: center; justify-content: center; padding: 0">{svg(P['x'],18)}</button>
</label>
<a href="Home.dc.html" style="display: flex; align-items: center; min-height: 44px; padding: 0 6px; color: {INK}; text-decoration: none; font-size: 15px; font-weight: 500">Cancel</a>
</div>
<div style="position: absolute; left: 16px; right: 0; top: 124px; display: flex; gap: 8px; overflow: hidden">
{pill('All, 6',sel=True)}{pill('Notes, 4')}{pill('Voice, 1')}{pill('Links, 1')}{pill('Images, 0')}
</div>
<div style="position: absolute; left: 24px; right: 24px; top: 192px; display: flex; flex-direction: column; gap: 18px">
<a href="Group.dc.html" style="display: flex; align-items: center; justify-content: space-between; min-height: 56px; box-sizing: border-box; padding: 0 18px; border-radius: 20px; {hue(G['sourdough'])}; color: {INK}; text-decoration: none">
<span style="{SERIF}; font-weight: 500; font-size: 20px">Sourdough</span>
<span style="font-size: 14px; color: #3F444B">Group, 6 thoughts</span>
</a>
{result('voice','Voice, today 9:42 am',f'Buy bread flour and rye for the starter this weekend','Matches the group Sourdough')}
{result('note','Note, yesterday',f'{B("Sourdough")}: feed the starter at night, bake in the morning','In Sourdough')}
{result('note','Note, 2 days ago',f'{B("Sourdough")} crumb was too dense, try a longer proof and wetter dough','In Sourdough')}
{result('link','Link, 2 days ago',f'{B("Sourdough")} hydration chart for beginners','baking.example',last=True)}
</div>''')


# ---------- Settings ----------
def srow(title, sub, right=''):
    return f"""<div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 64px; padding: 8px 0; border-top: 1px solid {RULE}">
<div style="display: flex; flex-direction: column; gap: 2px"><span style="font-size: 16px; line-height: 22px; font-weight: 500">{title}</span><span style="font-size: 13px; line-height: 18px; color: {SOFT}">{sub}</span></div>
{right}</div>"""
def sbtn(t, danger=False):
    col = '#B3261E' if danger else INK
    return f'<button style="height: 48px; flex-shrink: 0; padding: 0 18px; border-radius: 24px; border: 1px solid {LINE}; background: #FFFFFF; color: {col}; font-family: inherit; font-size: 14px; font-weight: 500">{t}</button>'
def seg(opts, sel):
    cells=''.join(f'<button aria-pressed="{"true" if o==sel else "false"}" style="flex: 1 1 0; height: 48px; border-radius: 24px; border: 0; background: {INK if o==sel else "transparent"}; color: {"#FFFFFF" if o==sel else INK}; font-family: inherit; font-size: 14px; font-weight: 500">{o}</button>' for o in opts)
    return f'<div style="display: flex; gap: 8px; padding: 4px; border-radius: 28px; border: 1px solid {LINE}; background: #FFFFFF">{cells}</div>'
files['Settings.dc.html']=page('Settings', header('Settings','Everything stays on this phone',[],back=('Today','Home.dc.html'))+f"""
<div style="position: absolute; left: 24px; right: 24px; top: 170px; display: flex; flex-direction: column; gap: 14px">
<div style="display: flex; flex-direction: column; gap: 10px">
<div style="font-size: 15px; font-weight: 600">Appearance</div>
{seg(['System','Light','Black'],'SELECTED')}
<div style="font-size: 13px; line-height: 18px; color: {SOFT}">Black uses true black to save power on AMOLED screens.</div>
</div>
<div style="display: flex; flex-direction: column">
{srow('Voice language','English (India)',sbtn('Change'))}
{srow('Offline speech pack','Needed to transcribe on this phone',sbtn('Download'))}
{srow('Back up','One file with thoughts, tags and links',sbtn('Export'))}
{srow('Restore','Add thoughts from a backup file',sbtn('Import'))}
{srow('Delete everything','31 thoughts on this phone',sbtn('Delete',danger=True))}
</div>
</div>""")

import re
def guidelines(src, name):
    # iOS status bar / Dynamic Island and home indicator; Android 48dp targets
    src = re.sub(r'(?<![-\w])top: (\d+)px', lambda m: f'top: {int(m.group(1))+12}px' if int(m.group(1))>=40 else m.group(0), src)
    if name=='Map.dc.html': src = src.replace('viewBox="0 0 390 844" style="position: absolute; left: 0; top: 0"','viewBox="0 0 390 844" style="position: absolute; left: 0; top: 12px"')
    src = src.replace('min-height: 44px','min-height: 48px')
    src = src.replace('height: 44px; padding: 0 4px','height: 48px; padding: 0 4px')
    src = src.replace('width: 44px; height: 44px; border: 0; border-radius: 22px','width: 48px; height: 48px; border: 0; border-radius: 24px')
    src = src.replace('bottom: 28px','bottom: 40px').replace('bottom: 112px','bottom: 124px')
    src = src.replace('height: 150px; background: linear-gradient','height: 162px; background: linear-gradient')
    src = src.replace('padding: 12px 24px 36px','padding: 12px 24px 44px')
    return src
def dark(src):
    src = re.sub(r'oklch\(0\.93 0\.04 (\d+)\)', r'oklch(0.25 0.05 \1)', src)
    src = re.sub(r'oklch\(0\.72 0\.09 (\d+)\)', r'oklch(0.52 0.09 \1)', src)
    for a,b in [('color: #FFFFFF','color: #000000'),('"#FFFFFF" if','"#000000" if'),('background: #FFFFFF','background: #111312'),
                ('rgba(243,244,241,0)','rgba(0,0,0,0)'),('#F3F4F1','#000000'),('#3F444B','#C9CEC6'),('#15171A','#E8EAE4'),('rgba(21,23,26,0.45)','rgba(0,0,0,0.6)'),
                ('#5A5F66','#A3A8A0'),('#D5D8D2','#2A2D2B'),('#DADDD6','#1F2220'),('#1F3FBF','#8FA6FF'),('oklch(0.9 0.07 265)','oklch(0.36 0.1 265)'),
                ('#7A8088','#7E847C'),('#9EA39B','#4A4E4B'),('#AEB3AA','#4A4E4B'),('#B9BDB5','#4A4E4B'),('#C9CCC6','#2A2D2B'),('#B3261E','#F2B8B5')]:
        src = src.replace(a,b)
    src = re.sub(r'href="(\w+)\.dc\.html"', r'href="\1-Dark.dc.html"', src)
    return src.replace('</title>',' (black)</title>',1)

names=[('Home','1. Home: today'),('Map','2. Map of groups'),('Group','3. Inside a group'),('Voice','4. Voice note'),('Share','5. Shared from another app'),('Thought','6. A thought'),('Search','7. Search'),('Settings','8. Settings')]
c=json.load(open('project/canvas.json')) if False else json.load(open('canvas.json'))
out=[]
for i,(n,t) in enumerate(names):
    light = guidelines(files[n+'.dc.html'], n+'.dc.html')
    d = dark(light)
    if n=='Settings':
        d = d.replace('aria-pressed="false" style="flex: 1 1 0; height: 48px; border-radius: 24px; border: 0; background: transparent; color: #E8EAE4; font-family: inherit; font-size: 14px; font-weight: 500">Black','aria-pressed="true" style="flex: 1 1 0; height: 48px; border-radius: 24px; border: 0; background: #E8EAE4; color: #000000; font-family: inherit; font-size: 14px; font-weight: 500">Black')
        light = light.replace('aria-pressed="false" style="flex: 1 1 0; height: 48px; border-radius: 24px; border: 0; background: transparent; color: #15171A; font-family: inherit; font-size: 14px; font-weight: 500">Light','aria-pressed="true" style="flex: 1 1 0; height: 48px; border-radius: 24px; border: 0; background: #15171A; color: #FFFFFF; font-family: inherit; font-size: 14px; font-weight: 500">Light')
    open(n+'.dc.html','w').write(light); open(n+'-Dark.dc.html','w').write(d)
    c['boards'][n+'.dc.html']={"x":i*470,"y":1320,"w":390,"h":844,"title":t,"radius":40,"is_interactive":True}
    c['boards'][n+'-Dark.dc.html']={"x":i*470,"y":2640,"w":390,"h":844,"title":t+' (black)',"radius":40,"is_interactive":True}
    for f in (n+'.dc.html', n+'-Dark.dc.html'):
        if f not in c['order']: c['order'].append(f)
        out.append(f)
c['notes']['chosen']={"x":0,"y":1020,"text":"Chosen direction: Stream look with the Atlas map","kind":"title1","maxW":3680}
c['notes']['black']={"x":0,"y":2340,"text":"True black for AMOLED screens","kind":"title1","maxW":3680}
json.dump(c,open('canvas.json','w'),separators=(',',':'))
print(json.dumps([{"as":"project/"+f,"path":"/home/claude/engram-design/project/"+f} for f in out+['canvas.json']]))
