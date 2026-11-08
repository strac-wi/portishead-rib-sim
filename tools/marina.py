import sys,json,math; sys.path.insert(0,'.')
from geo import *
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage
from skimage.morphology import skeletonize, disk, binary_opening
import cv2
C=json.load(open('ne_corr.json'))
U=(-0.618,-0.786)
def corr(x,y):
    s=x*U[0]+y*U[1]; w=min(1,max(0,(150-s)/80))
    ca,sa=math.cos(C['rot']*w),math.sin(C['rot']*w); cx,cy=C['cx'],C['cy']
    x2=cx+(x-cx)*ca-(y-cy)*sa+C['dx']*w; y2=cy+(x-cx)*sa+(y-cy)*ca+C['dy']*w
    return (x2,y2)
els={e['id']:e for e in load()}
POLYS={}
for i in (153656493,154353460,636594087,636594083,153834628,153834927):
    POLYS[i]=[corr(*p) for p in pts(els[i])]
# basin outline (no correction)
BASIN=pts(els[26730520])
X0,Y0,X1,Y1,R=-340,-400,60,60,0.2
W=int((X1-X0)/R); H=int((Y1-Y0)/R)
def rast(polys):
    m=Image.new('L',(W,H),0); d=ImageDraw.Draw(m)
    for P in polys: d.polygon([((x-X0)/R,(Y1-y)/R) for x,y in P],fill=1)
    return np.asarray(m).astype(bool)
mask=rast([POLYS[i] for i in (153656493,154353460)])
opened=ndimage.binary_opening(mask,structure=disk(int(sys.argv[1]) if len(sys.argv)>1 else 5))   # radius 1.0 m
fingers=mask & ~ndimage.binary_dilation(opened,iterations=2)
lab,n=ndimage.label(fingers)
F=[]
for k in range(1,n+1):
    yy,xx=np.nonzero(lab==k)
    if len(xx)<40: continue
    px=X0+xx*R; py=Y1-yy*R
    c=np.array([px.mean(),py.mean()]); A=np.vstack([px-c[0],py-c[1]])
    w,v=np.linalg.eigh(A@A.T); d=v[:,1]
    proj=(A.T@d); L=proj.max()-proj.min()
    wid=(A.T@v[:,0]).std()*math.sqrt(12)
    if L<3 or L>16 or wid>1.6: continue
    a=c+d*proj.min(); b=c+d*proj.max()
    F.append({'a':[round(a[0],2),round(a[1],2)],'b':[round(b[0],2),round(b[1],2)],'w':round(max(0.5,min(1.0,wid)),2),'L':round(L,2)})
print('fingers',len(F))
# walkway skeleton segments
sk=skeletonize(opened).astype(np.uint8)*255
lines=cv2.HoughLinesP(sk,1,np.pi/360,20,minLineLength=int(4/R),maxLineGap=int(1.2/R))
S=[]
for l in np.asarray(lines).reshape(-1,4):
    x1,y1,x2,y2=l
    S.append([X0+x1*R,Y1-y1*R,X0+x2*R,Y1-y2*R])
print('segments',len(S))
json.dump({'polys':{str(k):[[round(x,2),round(y,2)] for x,y in v] for k,v in POLYS.items()},'fingers':F,'segs':S,'basin':[[round(x,2),round(y,2)] for x,y in BASIN]},open('marina.json','w'))
# debug image
im=Image.new('RGB',(W,H),(30,70,80)); d=ImageDraw.Draw(im)
d.polygon([((x-X0)/R,(Y1-y)/R) for x,y in BASIN],outline=(200,200,200))
arr=np.asarray(im).copy(); arr[opened]=[160,160,160]; arr[fingers]=[255,200,0]
im=Image.fromarray(arr); d=ImageDraw.Draw(im)
for s in S: d.line([((s[0]-X0)/R,(Y1-s[1])/R),((s[2]-X0)/R,(Y1-s[3])/R)],fill=(255,0,0),width=2)
for f in F: d.line([((f['a'][0]-X0)/R,(Y1-f['a'][1])/R),((f['b'][0]-X0)/R,(Y1-f['b'][1])/R)],fill=(0,255,0),width=2)
im.save('marina_dbg.png'); print(im.size)
