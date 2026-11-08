import sys,json,math,random; sys.path.insert(0,'.')
from resamp import *
from reg import *
import numpy as np
from PIL import Image, ImageDraw
random.seed(7)
F=json.load(open('marina_f.json'))
fingers=F['fingers']; polys=F['polys']
AX=np.array([0.618,0.786])
s9=json.load(open('r9.json')); s1=json.load(open('r1c.json'))
pin=fwd(s1,617,995); print('pin local',pin)
# satellite brightness in local frame
X0,Y0,X1,Y1,R=-340,-400,60,60,0.2
rgb9,v9=resample('sat9.png',s9,X0,Y0,X1,Y1,R)
rgb1,v1=resample('sat1.png',s1,X0,Y0,X1,Y1,R)
v1&=(rgb1.mean(2)>5)
# ignore the UI parts of sat1 (top status, bottom panel, buttons): approx px y<300 or y>2250 or right buttons
def boatmask(rgb):
    lum=rgb.mean(2); sat=rgb.max(2)-rgb.min(2)
    return (lum>150)&(sat<55)
B9=boatmask(rgb9); B1=boatmask(rgb1)
# pontoon raster to exclude
H,W=B9.shape
pm=Image.new('L',(W,H),0); d=ImageDraw.Draw(pm)
for k,v in polys.items(): d.polygon([((x-X0)/R,(Y1-y)/R) for x,y in v],fill=1)
PM=np.asarray(pm).astype(bool)
from scipy import ndimage
PMd=ndimage.binary_dilation(PM,iterations=2)
def frac(cx,cy,hx,hy,ux,uy,use1=False):
    # rectangle centre, half-lengths along u and perp
    xs=np.linspace(-hx,hx,9); ys=np.linspace(-hy,hy,5); n=0; b=0
    for a in xs:
        for c in ys:
            x=cx+ux*a-uy*c; y=cy+uy*a+ux*c
            i=int((Y1-y)/R); j=int((x-X0)/R)
            if 0<=i<H and 0<=j<W and not PMd[i,j]:
                n+=1
                if use1 and v1[i,j]: b+=B1[i,j]
                else: b+=B9[i,j]
    return b/max(1,n)
# group fingers: for each finger find its root (end nearer a walkway = nearer the polygon's thicker part); use direction
FG=[]
for f in fingers:
    a=np.array(f['a']); b=np.array(f['b']); u=(b-a)/np.linalg.norm(b-a)
    FG.append({'a':a,'b':b,'u':u,'L':f['L'],'w':f['w'],'c':(a+b)/2})
# root: test which end touches the opened walkway: approximate by more pontoon pixels around the end
def pon(x,y,r=1.6):
    n=0
    for dx in np.linspace(-r,r,7):
        for dy in np.linspace(-r,r,7):
            i=int((Y1-(y+dy))/R); j=int((x+dx-X0)/R)
            if 0<=i<H and 0<=j<W: n+=PM[i,j]
    return n
for g in FG:
    if pon(*g['b'])>pon(*g['a']): g['a'],g['b']=g['b'],g['a']; g['u']=-g['u']
# spacing to neighbours on each side
boats=[]; cand=[]
for i,g in enumerate(FG):
    n=np.array([-g['u'][1],g['u'][0]])
    for side in (1,-1):
        best=9.0
        for j,h in enumerate(FG):
            if i==j or abs(np.dot(g['u'],h['u']))<0.9: continue
            dvec=h['c']-g['c']; along=abs(np.dot(dvec,g['u'])); perp=np.dot(dvec,n)*side
            if along<4 and 0.5<perp<best: best=perp
        gap=best-g['w']/2-0.5
        beam=float(np.clip((gap-0.5)/2 if gap>5.6 else gap-0.6,2.0,3.9))
        Lb=float(np.clip(g['L']+random.uniform(0.8,2.6),6.5,14.0))
        off=g['w']/2+0.2+beam/2
        root=g['a']+g['u']*0.3
        c=root+g['u']*(Lb/2)+n*side*off
        use1=bool(c[1]>-110)
        fr=frac(c[0],c[1],Lb/2*0.8,beam/2*0.7,g['u'][0],g['u'][1],use1)
        cand.append({'x':float(c[0]),'y':float(c[1]),'hdg':math.degrees(math.atan2(-g['u'][0],-g['u'][1]))%360,'L':round(Lb,1),'B':round(beam,2),'fr':round(float(fr),2),'f':i,'side':side})
print('candidates',len(cand))
# resolve overlaps: keep higher fr
cand.sort(key=lambda c:-c['fr'])
kept=[]
for c in cand:
    ok=True
    for k in kept:
        if math.hypot(c['x']-k['x'],c['y']-k['y'])<(c['B']+k['B'])/2+0.2 and abs(((c['hdg']-k['hdg']+180)%360)-180)<30: ok=False;break
    if ok: kept.append(c)
for c in kept: c['occ']=bool(c['fr']>0.33); c['fr']=float(c['fr'])
# the pin slot is the RIB's
for c in kept:
    if math.hypot(c['x']-pin[0],c['y']-pin[1])<2.5: print('pin slot',c); c['occ']=False; c['rib']=True
print('kept',len(kept),'occupied',sum(c['occ'] for c in kept))
json.dump({'pin':[float(v) for v in pin],'berths':kept},open('boats.json','w'))
# overlay on sat9-local
ov=rgb9.astype(np.uint8).copy(); im=Image.fromarray(ov); d=ImageDraw.Draw(im)
P=lambda x,y:((x-X0)/R,(Y1-y)/R)
for k,v in polys.items(): d.polygon([P(*p) for p in v],outline=(255,255,0))
for c in kept:
    h=math.radians(c['hdg']); u=(math.sin(h),math.cos(h)); n=(u[1],-u[0]); L,B=c['L']/2,c['B']/2
    q=[P(c['x']+u[0]*a+n[0]*b,c['y']+u[1]*a+n[1]*b) for a,b in ((L,B),(L,-B),(-L,-B),(-L,B))]
    d.polygon(q,outline=(0,255,0) if c['occ'] else (255,0,0))
d.ellipse([P(*pin)[0]-4,P(*pin)[1]-4,P(*pin)[0]+4,P(*pin)[1]+4],fill=(255,0,255))
im.save('boats_ov.png'); print(im.size)
# ---------- hammerheads at the arm ends
ARMS={'B':((-27.6,7.0),(-6.2,-10.2)),'C':((-50.2,-19.2),(-27.2,-37.8)),'F':((-84.8,-43.0),(-52.6,-68.6)),'G':((-113.0,-77.2),(-80.5,-103.0)),
 'H':((-142.5,-114.3),(-110.3,-139.8)),'J':((-169.4,-148.0),(-137.0,-173.4)),'K':((-203.2,-192.0),(-175,-214.5)),'L':((-228.0,-223.4),(-195.4,-248.8)),
 'M':((-260.2,-264.2),(-227.4,-289.8)),'N':((-287.6,-299.0),(-255,-324.5)),'P':((-314.9,-333.5),(-282,-359))}
def inpm(x,y):
    i=int((Y1-y)/R); j=int((x-X0)/R); return 0<=i<H and 0<=j<W and PM[i,j]
HH=[]
for name,(e,r) in ARMS.items():
    e=np.array(e); r=np.array(r); dd=(e-r)/np.linalg.norm(e-r)
    # walk outward to the outer face
    p=e.copy()
    for k in range(60):
        q=p+dd*0.2
        if not inpm(*q): break
        p=q
    # extent along AX at 0.6 m inside the face
    base=p-dd*0.6; ext=[]
    for sgn in (1,-1):
        t=0
        while t<15 and inpm(*(base+AX*sgn*(t+0.2))): t+=0.2
        ext.append(t)
    c=base+AX*(ext[0]-ext[1])/2; L=ext[0]+ext[1]
    face=p
    berth=face+dd*(0.25+1.08)+AX*(ext[0]-ext[1])/2
    # occupancy outside the face
    bc=face+dd*(0.3+1.8)+AX*(ext[0]-ext[1])/2
    fr=frac(bc[0],bc[1],max(2,L/2-1),1.4,AX[0],AX[1],bool(bc[1]>-110))
    HH.append({'arm':name,'c':[round(float(c[0]),2),round(float(c[1]),2)],'L':round(L,1),'out':[round(float(dd[0]),3),round(float(dd[1]),3)],
               'berth':[round(float(berth[0]),2),round(float(berth[1]),2)],'hdg':round(math.degrees(math.atan2(AX[0],AX[1])),1),'fr':round(float(fr),2),'occ':bool(fr>0.33)})
for h in HH: print(h)
# ---------- boats seen on the satellite that no finger berth explains (alongside walkways, the quay, the hammerheads)
cover=Image.new('L',(W,H),0); dc=ImageDraw.Draw(cover)
for c in kept:
    if not c['occ']: continue
    hh=math.radians(c['hdg']); u=(math.sin(hh),math.cos(hh)); n=(u[1],-u[0]); L2,B2=c['L']/2+0.8,c['B']/2+0.6
    dc.polygon([((c['x']+u[0]*a+n[0]*b-X0)/R,(Y1-(c['y']+u[1]*a+n[1]*b))/R) for a,b in ((L2,B2),(L2,-B2),(-L2,-B2),(-L2,B2))],fill=1)
COV=np.asarray(cover).astype(bool)
basin=Image.new('L',(W,H),0); ImageDraw.Draw(basin).polygon([((x-X0)/R,(Y1-y)/R) for x,y in F['basin']],fill=1)
BAS=ndimage.binary_erosion(np.asarray(basin).astype(bool),iterations=4)
BM=np.where(v1&(np.arange(H)[:,None]<(Y1+110)/R),B1,B9)&BAS&~PMd&~COV
BM=ndimage.binary_opening(BM,iterations=2)
lab,n=ndimage.label(BM); extra=[]
for k in range(1,n+1):
    yy,xx=np.nonzero(lab==k)
    if len(xx)<250: continue
    px=X0+xx*R; py=Y1-yy*R; cc=np.array([px.mean(),py.mean()]); A=np.vstack([px-cc[0],py-cc[1]])
    w_,v_=np.linalg.eigh(A@A.T/len(xx)); L=math.sqrt(12*w_[1]); Bm=math.sqrt(12*w_[0])
    if L<5 or L>26 or Bm<1.6: continue
    u=v_[:,1]
    extra.append({'x':round(float(cc[0]),2),'y':round(float(cc[1]),2),'hdg':round(math.degrees(math.atan2(u[0],u[1]))%360,1),'L':round(min(L,24),1),'B':round(min(max(Bm,2.0),5.0),2),'occ':True,'blob':True})
print('extra boats',len(extra))
for e in extra: print(e)
json.dump({'pin':[float(v) for v in pin],'berths':kept,'hammer':HH,'extra':extra},open('boats.json','w'))
for c in extra:
    h=math.radians(c['hdg']); u=(math.sin(h),math.cos(h)); n=(u[1],-u[0]); L,B=c['L']/2,c['B']/2
    d.polygon([P(c['x']+u[0]*a+n[0]*b,c['y']+u[1]*a+n[1]*b) for a,b in ((L,B),(L,-B),(-L,-B),(-L,B))],outline=(0,200,255))
for h in HH:
    d.ellipse([P(*h['berth'])[0]-5,P(*h['berth'])[1]-5,P(*h['berth'])[0]+5,P(*h['berth'])[1]+5],outline=(255,128,0) if not h['occ'] else (0,128,255),width=2)
im.save('boats_ov.png')
