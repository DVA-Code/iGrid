from pathlib import Path
import re,html,math,sys
root=Path(__file__).resolve().parents[1];out=root/'docs/assets'
C={'ink':'#223c47','green':'#247567','blue':'#2d7f9a','bg':'#f6f8f4','line':'#cbdad4','muted':'#587078'}
def text(x,y,s,size=20,color=None,anchor='start'):
 return f'<text x="{x}" y="{y}" font-family="Segoe UI,Arial,sans-serif" font-size="{size}" fill="{color or C["ink"]}" text-anchor="{anchor}">{html.escape(s)}</text>'
def base(title,sub,w=1200,h=700):
 return [f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}"><rect width="100%" height="100%" fill="{C["bg"]}"/><rect width="100%" height="8" fill="{C["green"]}"/>',text(42,52,'GML  /  RESEARCH FIGURE',15,C['green']),text(42,102,title,32),text(42,136,sub,18,C['muted'])]
def box(a,x,y,w,h,title,sub=''):
 a.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="10" fill="white" stroke="{C["line"]}"/>');a.append(text(x+w/2,y+h/2 if not sub else y+h/2-7,title,19,C['green'],'middle'))
 if sub:a.append(text(x+w/2,y+h/2+22,sub,14,C['muted'],'middle'))
def arrow(a,x1,y1,x2,y2):
 a.append(f'<path d="M{x1} {y1} L{x2} {y2}" stroke="{C["blue"]}" stroke-width="2.5" fill="none"/>')
 angle=math.atan2(y2-y1,x2-x1);pts=[(x2,y2)]+[(x2-10*math.cos(angle+d),y2-10*math.sin(angle+d)) for d in [-.4,.4]]
 a.append('<polygon points="'+' '.join(f'{x},{y}' for x,y in pts)+f'" fill="{C["blue"]}"/>')
def save(name,a):
 a.append(text(42,675,'Documentation illustration. No live measurement or UI capture is implied.',15,C['muted']));a.append('</svg>');(out/(name+'.svg')).write_text(''.join(a),encoding='utf-8')
# Shared stack diagram.
a=base('One telemetry pipeline. Three measured-data workspaces.','The inverter shares the application shell, but uses its own simulation inputs.')
for x,t,s in [(45,'IAMMETER meters','Three-phase measurements'),(335,'MQTT collector','Validate + normalize'),(625,'SQLite history','Private persistent storage'),(915,'GML API','Public building aliases')]:box(a,x,205,240,80,t,s)
for x in [285,575,865]:arrow(a,x,245,x+45,245)
for x,t,s in [(70,'Energy analytics','All seven meter streams'),(360,'Thermal sensitivity','Main transformer stream'),(650,'Grid monitoring','Meter status + study network'),(940,'PV inverter','Independent simulation')]:box(a,x,450,205,105,t,s)
for x in [172,462,752]:
 a.append(f'<path d="M1035 285 V350 H{x} V442" stroke="{C["blue"]}" fill="none" stroke-width="2"/>');arrow(a,x,430,x,447)
a.append(text(940,405,'No live meter input',16,C['muted']));save('architecture',a)
# Energy reference vector chart.
a=base('Energy analytics','Reference-vector calculation: 235 / 238 / 236 V and 200 / 220 / 180 A; phase PF = 0.9.')
for i,(phase,val) in enumerate(zip(['Phase A','Phase B','Phase C'],[200,220,180])):
 x=90+i*190;h=val*1.45;a.append(f'<rect x="{x}" y="{535-h}" width="105" height="{h}" rx="5" fill="{[C["green"],C["blue"],"#af9757"][i]}"/>');a.append(text(x+52,565,phase,18,anchor='middle'));a.append(text(x+52,520-h,f'{val} A',21,anchor='middle'))
for y,t,s in [(200,'127.656 kW','Calculated fallback active power'),(315,'141.84 kVA','Sum of per-phase V x I'),(430,'10% CUF','Max deviation from average current')]:box(a,720,y,410,85,t,s)
a.append(text(80,615,'Example values are reproducible model inputs, not current campus demand.',17,C['muted']));save('energy-example',a)
# Thermal features chart.
a=base('Thermal sensitivity pipeline','An electrical regression response and normalized score; not a measured temperature field.')
for x,t,s in [(55,'V / I per phase','Main transformer'),(350,'Feature extraction','Ieq2, Iimb, Vdev'),(645,'Regression response','Weighted contributions'),(940,'TSI','Research category')]:box(a,x,210,205,95,t,s)
for x in [260,555,850]:arrow(a,x,257,x+80,257)
box(a,80,405,460,150,'Theta = 0.954744','Reference-vector model response')
box(a,655,405,460,150,'TSI = 0.491801','High research band; not a trip setting')
save('thermal-model',a)
# Inverter waveform using analytic model values.
a=base('PV inverter simulation','Illustrative normalized sine and triangle carrier; no connection to a physical inverter.')
for x in [70,380,690,1000]:a.append(f'<line x1="{x}" y1="210" x2="{x}" y2="490" stroke="#d9e2de"/>')
a.append('<line x1="70" y1="350" x2="1130" y2="350" stroke="#b2c7bd"/>')
for typ,col in [('sine',C['green']),('triangle','#9baea8')]:
 pts=[]
 for i in range(600):
  t=i/599;v=.86*math.sin(2*math.pi*t) if typ=='sine' else (4*((t*12)%1)-1 if (t*12)%1<.5 else 3-4*((t*12)%1))
  pts.append(f'{70+1060*t},{350-130*v}')
 a.append(f'<polyline points="{" ".join(pts)}" fill="none" stroke="{col}" stroke-width="{3 if typ=="sine" else 1.3}"/>')
for x,t in [(55,'SPWM'),(340,'H-bridge'),(625,'LC filter'),(910,'FFT / SOC')]:box(a,x,535,235,70,t)
for x in [290,575,860]:arrow(a,x,570,x+45,570)
save('inverter-waveform',a)
# Project's actual study graph, no external basemap or live claims.
s=(root/'src/lib/grid.ts').read_text(encoding='utf-8');buses={int(i):(name,float(lat),float(lon)) for i,name,lat,lon in re.findall(r"\[(\d+), '([^']+)', ([\d.]+), ([\d.]+)\]",s)}
lines=[(int(f),int(t)) for f,t in re.findall(r'L\((\d+), (\d+),',s)]
a=base('Grid monitoring: campus network preview','Actual study geometry from src/lib/grid.ts. Meter placements require field verification.')
latmin=min(x[1] for x in buses.values());latmax=max(x[1] for x in buses.values());lonmin=min(x[2] for x in buses.values());lonmax=max(x[2] for x in buses.values())
def xy(bus):
 _,la,lo=buses[bus];return 80+(lo-lonmin)/(lonmax-lonmin)*610,595-(la-latmin)/(latmax-latmin)*395
for f,t in lines:
 if f in buses and t in buses:
  x1,y1=xy(f);x2,y2=xy(t);a.append(f'<path d="M{x1} {y1} L{x2} {y2}" stroke="{C["green"]}" stroke-width="2"/>')
for b in buses:
 x,y=xy(b);a.append(f'<circle cx="{x}" cy="{y}" r="3.2" fill="{C["green"]}"/>')
labels={1:'1. Main transformer',19:'2. Bio-Tech',16:'3. Physics',6:'4. Civil',5:'5. Management',49:'6. Electrical',38:'7. Boys Hostel'}
for i,(b,label) in enumerate(labels.items()):
 x,y=xy(b);a.append(f'<circle cx="{x}" cy="{y}" r="12" fill="white" stroke="{C["blue"]}" stroke-width="2"/>');a.append(text(x,y+4,str(i+1),12,C['blue'],'middle'));a.append(text(790,235+i*40,label,19))
a.append(text(790,555,'Status: not evaluated in this figure',15,C['muted']));a.append(text(790,582,'Open the application for current data',15,C['muted']));save('grid-map-preview',a)
print('Created five labelled SVG figures from source and example calculations')
