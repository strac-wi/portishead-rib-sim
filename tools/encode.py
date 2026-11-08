import sys,json,math,base64,struct,random; sys.path.insert(0,'.')
from geo import *
import numpy as np
random.seed(11)
out={}
# ---------- seabed / land grids: one byte a cell (below +15 m: quarter metres from -25 m; above: whole metres)
def enc_grid(z):
    z=np.asarray(z)
    q=np.where(z<15,np.clip(np.round((z+25)*4),0,160),np.clip(160+np.round(z-15),161,255)).astype(np.uint8)
    return base64.b64encode(q.tobytes()).decode()
for name,fz,fm in (('grid','G_z.npy','G_meta.json'),('fine','F_z.npy','F_meta.json')):
    m=json.load(open(fm)); z=np.load(fz)
    out[name]=dict(m,z=enc_grid(z))
# ---------- marina
F=json.load(open('marina_f.json')); B=json.load(open('boats.json'))
R2=lambda v:round(v,2)
out['basin']=[[R2(x),R2(y)] for x,y in F['basin']]
out['pont']=[[[R2(x),R2(y)] for x,y in P] for k,P in F['polys'].items()]
# start: alongside finger 3's south-east side, bow to the A walkway
fing=F['fingers'][3]; a=np.array(fing['b']); b=np.array(fing['a'])   # a: the root by the walkway (north-east end)
u=(b-a)/np.linalg.norm(b-a); n=np.array([u[1],-u[0]])   # n: to the right looking out along the finger
pin=np.array(B['pin']); side=1 if np.dot(pin-(a+b)/2,n)>0 else -1
c=a+u*2.75+n*side*(0.5+0.45+1.08)
psi=math.atan2(-u[0],-u[1])
out['start']={'x':R2(c[0]),'y':R2(c[1]),'psi':round(psi,4),'finger':[[R2(a[0]),R2(a[1])],[R2(b[0]),R2(b[1])]],'side':side}
print('start',out['start'],'pin',B['pin'])
boats=[]
def btype(L,Bm):
    if L>15 and Bm>3.5: return 3      # houseboat / barge
    if L<6.2: return 2                # small motorboat / dory
    return 0 if random.random()<(0.65 if L>8.5 else 0.4) else 1   # 0 yacht, 1 motor cruiser
for c in B['berths']:
    if not c['occ']: continue
    if math.hypot(c['x']-out['start']['x'],c['y']-out['start']['y'])<3.5: continue
    boats.append([R2(c['x']),R2(c['y']),round(c['hdg'],1),round(c['L'],1),round(min(c['B'],3.8),2),btype(c['L'],c['B'])])
for c in B['extra']:
    if math.hypot(c['x']-out['start']['x'],c['y']-out['start']['y'])<4: continue
    L=min(c['L'],22); Bm=min(c['B'],4.6)
    if L>8 and Bm<2.6: Bm=max(Bm,L*0.3)
    boats.append([R2(c['x']),R2(c['y']),round(c['hdg'],1),round(L,1),round(Bm,2),btype(L,Bm)])
out['boats']=boats; print('boats',len(boats))
# hammerheads: empty unless the satellite clearly shows a boat lying there (B's houseboat among them)
HH=[]
for h in B['hammer']:
    occ=h['fr']>=0.45
    HH.append({'arm':h['arm'],'c':h['c'],'L':h['L'],'out':h['out'],'berth':h['berth'],'hdg':h['hdg'],'occ':occ})
    if occ:   # a boat alongside the hammerhead's face
        L=min(14,h['L']-2); bx=h['berth'][0]+h['out'][0]*0.9; by=h['berth'][1]+h['out'][1]*0.9
        if h['arm']!='B': boats.append([R2(bx),R2(by),h['hdg'],round(L,1),3.6,0 if random.random()<0.6 else 1])
out['hammer']=HH; print('hammerheads empty:',[h['arm'] for h in HH if not h['occ']])
# ---------- coast (for the chart) and the pier
els={e['id']:e for e in load()}
chain=[386064191,105780130,318953096,105780157,1545223767,386187887,386187888,105780067,3303900]
coast=[]
for i in chain:
    P=pts(els[i]); coast+= P if not coast else P[1:]
def dp(P,eps):
    if len(P)<3: return P
    a,b=np.array(P[0]),np.array(P[-1]); ab=b-a; L=np.linalg.norm(ab) or 1
    d=[abs(ab[0]*(p[1]-a[1])-ab[1]*(p[0]-a[0]))/L for p in P]; i=int(np.argmax(d))
    if d[i]>eps: return dp(P[:i+1],eps)[:-1]+dp(P[i:],eps)
    return [P[0],P[-1]]
coastS=[p for p in dp(coast,0.8) if -3000<p[0]<3500 and -2500<p[1]<3000]
out['coast']=[[round(x,1),round(y,1)] for x,y in coastS]
out['pier']=[[R2(x),R2(y)] for x,y in pts(els[386187887])]
out['approachW']=[[R2(x),R2(y)] for x,y in pts(els[105780157])]
print('coast pts',len(out['coast']))
# ---------- buildings, roads and ground cover from OpenStreetMap
def poly_area(P):
    return 0.5*abs(sum(P[i][0]*P[i-1][1]-P[i-1][0]*P[i][1] for i in range(len(P))))
buf=bytearray(); nb=0
for e in load():
    t=e.get('tags',{})
    if 'building' not in t or e['type']!='way': continue
    if t['building'] in ('garage','garages','shed','roof','carport','hut','greenhouse'): continue
    P=pts(e)
    if len(P)<4: continue
    cx=sum(p[0] for p in P)/len(P); cy=sum(p[1] for p in P)/len(P)
    if not (-1400<cx<1500 and -900<cy<650): continue
    A=poly_area(P)
    if A<25: continue
    if P[0]==P[-1]: P=P[:-1]
    k=max(range(len(P)),key=lambda i:(P[i][0]-P[0][0])**2+(P[i][1]-P[0][1])**2)
    P=dp(P[:k+1],0.35)[:-1]+dp(P[k:]+[P[0]],0.35)[:-1]
    if len(P)<3: continue
    lv=t.get('building:levels'); h=t.get('height')
    try: H=float(h.split()[0]) if h else None
    except: H=None
    if H is None:
        try: H=float(lv)*3.0+1.0 if lv else None
        except: H=None
    if H is None:
        k=t['building']
        if k in ('apartments','residential','yes') and A>600: H=16
        elif k in ('apartments',) : H=13
        elif k in ('retail','commercial','industrial','warehouse','supermarket'): H=8
        elif k in ('house','semidetached_house','detached','terrace'): H=7
        else: H=7 if A<250 else 10
    kind=1 if t['building'] in ('house','semidetached_house','detached','terrace','bungalow') else 0
    buf+=struct.pack('<BBH',int(min(255,H*4)),kind,len(P))
    for x,y in P: buf+=struct.pack('<hh',int(round(x*2)),int(round(y*2)))
    nb+=1
out['bld']=base64.b64encode(bytes(buf)).decode(); print('buildings',nb,'bytes',len(buf))
RCLS={'motorway':0,'trunk':0,'primary':0,'secondary':1,'tertiary':1,'residential':2,'unclassified':2,'living_street':2,'service':3,'pedestrian':4,'footway':4,'path':4,'cycleway':4,'track':4,'steps':4}
LC={'grass':0,'meadow':0,'park':0,'garden':0,'village_green':0,'recreation_ground':0,'pitch':5,'wood':1,'scrub':1,'forest':1,'beach':2,'shingle':2,'sand':2,'parking':3,'water':4,'wetland':6,'cemetery':0,'allotments':0}
gbuf=bytearray(); ng=0
for e in load():
    t=e.get('tags',{}); P=pts(e)
    if len(P)<2: continue
    xs=[p[0] for p in P]; ys=[p[1] for p in P]
    if max(xs)<-1600 or min(xs)>1700 or max(ys)<-1000 or min(ys)>800: continue
    if 'highway' in t and t['highway'] in RCLS:
        c=10+RCLS[t['highway']]
    else:
        k=t.get('landuse') or t.get('leisure') or t.get('natural') or t.get('amenity')
        if k not in LC or k=='water' and e['id']==26730520: continue
        if t.get('natural')=='water' and e['id']==26730520: continue
        c=LC[k]
    if len(P)>3 and P[0]==P[-1]:
        k=max(range(len(P)),key=lambda i:(P[i][0]-P[0][0])**2+(P[i][1]-P[0][1])**2); P=dp(P[:k+1],0.6)[:-1]+dp(P[k:],0.6)
    else: P=dp(P,0.6)
    gbuf+=struct.pack('<BH',c,len(P))
    for x,y in P: gbuf+=struct.pack('<hh',int(round(x*2)),int(round(y*2)))
    ng+=1
out['ground']=base64.b64encode(bytes(gbuf)).decode(); print('ground features',ng,'bytes',len(gbuf))
# ---------- marks and lights, placed off the charts
c1=json.load(open('c1.json')); c2=json.load(open('c2.json'))
import reg
def L1(u,v): x,y=reg.fwd(c1,u,v); return [round(x,1),round(y,1)]
def L2(u,v): x,y=reg.fwd(c2,u,v); return [round(x,1),round(y,1)]
out['marks']=[
 {'n':'Firefly','k':'stbd','lt':'Fl(2) G 5s','p':L1(941,519)},
 {'n':'Outer','k':'stbd','lt':'Fl G 5s','p':L1(1160,497)},
 {'n':'Middle','k':'stbd','lt':'Q G','p':L1(1391,537)},
 {'n':'Inner','k':'stbd','lt':'Fl(3) G 15s','p':L2(1781,92)},
 {'n':'Newcome','k':'port','lt':'Fl(3) R 10s','p':L1(403,490)},
 {'n':'Cockburn','k':'port','lt':'Fl R 2.5s','p':L1(1451,198)},
 {'n':'Denny Shoal','k':'south','lt':'VQ(6)+LFl 10s','p':L1(901,395)},
]
out['lights']=[{'n':'Portishead Point','lt':'Q(3) 10s','p':L2(279,257)},{'n':'Pier head','lt':'Iso G 2s','p':[R2(x) for x in max(out['pier'],key=lambda p:p[0]+p[1])]}]
out['names']=[{'n':'Portishead Pool','p':L2(1240,160)},{'n':'Firefly Rocks','p':L2(930,80)},{'n':'Flatness Rocks','p':L2(1437,22)},{'n':'King Road','p':L1(1277,397)},{'n':'Denny Shoal','p':L1(1530,35)},{'n':'Woodhill Bay','p':L2(200,413)},{'n':'Portishead Point','p':L2(320,265)},{'n':'Royal Portbury Dock','p':L1(1820,640)},{'n':'Chapel Pill','p':L2(1690,370)}]
print(out['marks']); print(out['lights'])
# ---------- tide: Avonmouth harmonic constants (TICON-4), fitted to the marina's 2026 Portishead table
tab=json.load(open('avon_tab.json'))
tab=[{k:v for k,v in e.items()} for e in tab if e['A'] or 'sh' not in e or True]
out['tide']={'tab':tab,'z0':6.985,'k':0.9943,'shift':0}
s=json.dumps(out,separators=(',',':'))
open('pdata.js','w').write('const PD = '+s+';\n')
print('total',len(s))
