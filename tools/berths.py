import sys,json,math; sys.path.insert(0,'.')
from resamp import *
from reg import *
import numpy as np
from PIL import Image, ImageDraw
F=json.load(open('marina_f.json')); S=json.load(open('marina_s.json'))
fingers=F['fingers']; segs=S['segs']; polys=F['polys']
AX=(0.618,0.786)  # basin axis toward NE
def ang(dx,dy): return math.atan2(dx,dy)
# --- merge collinear Hough segments into walkway lines
L=[]
for x1,y1,x2,y2 in segs:
    dx,dy=x2-x1,y2-y1; l=math.hypot(dx,dy); L.append([x1,y1,x2,y2,dx/l,dy/l,l])
used=[False]*len(L); W=[]
for i,a in enumerate(L):
    if used[i]: continue
    grp=[a]; used[i]=True
    for j,b in enumerate(L):
        if used[j]: continue
        if abs(a[4]*b[4]+a[5]*b[5])<0.985: continue
        # perpendicular distance of b's points to a's line
        nx,ny=-a[5],a[4]
        d1=abs((b[0]-a[0])*nx+(b[1]-a[1])*ny); d2=abs((b[2]-a[0])*nx+(b[3]-a[1])*ny)
        if d1<0.8 and d2<0.8:
            grp.append(b); used[j]=True
    ux,uy=a[4],a[5]; ps=[]
    for g in grp: ps+= [ (g[0]-a[0])*ux+(g[1]-a[1])*uy, (g[2]-a[0])*ux+(g[3]-a[1])*uy ]
    t0,t1=min(ps),max(ps)
    W.append([a[0]+ux*t0,a[1]+uy*t0,a[0]+ux*t1,a[1]+uy*t1])
print('walkway lines',len(W))
# NW quay line: through (-52.1,36.1) along -AX ; distance from it (positive toward SE)
def dq(x,y): return (x+52.1)*0.786-(y-36.1)*0.618
T=[]
for x1,y1,x2,y2 in W:
    dx,dy=x2-x1,y2-y1; l=math.hypot(dx,dy)
    if l<6 or l>22: continue
    if abs(dx/l*AX[0]+dy/l*AX[1])<0.95: continue
    cx,cy=(x1+x2)/2,(y1+y2)/2
    if dq(cx,cy)>45: continue   # spine / E pontoon are further SE
    T.append({'a':[round(x1,2),round(y1,2)],'b':[round(x2,2),round(y2,2)],'c':[round(cx,2),round(cy,2)],'L':round(l,2)})
print('T-bars',len(T))
for t in sorted(T,key=lambda t:-t['c'][1]): print(t)
json.dump({'walk':W,'tbars':T},open('walk.json','w'))
