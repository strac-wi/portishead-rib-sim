import sys,json,math; sys.path.insert(0,'.')
from reg import *
from soundings import C1,C2
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage
from scipy.interpolate import griddata
import tifffile
c1=json.load(open('c1.json')); c2=json.load(open('c2.json'))
PAL={'land':[(200,184,120),(176,144,56),(192,184,120),(200,176,112),(168,144,56),(168,136,48)],'dry':[(128,176,144),(128,176,152),(136,176,152),(128,168,144)],
     'b05':[(112,176,232),(112,176,240),(120,176,232)],'b510':[(152,192,240),(144,192,240),(152,192,232),(144,192,232)],'deep':[(208,232,232),(208,232,240),(208,224,232)],'dredge':[(184,208,224),(184,208,216)]}
CL=['land','dry','b05','b510','deep','dredge']
def classify(fn):
    a=np.asarray(Image.open(fn).convert('RGB')).astype(np.int32)
    best=np.full(a.shape[:2],1e9); cls=np.full(a.shape[:2],-1)
    for k,name in enumerate(CL):
        for c in PAL[name]:
            d=((a-np.array(c))**2).sum(2)
            m=d<best; best[m]=d[m]; cls[m]=k
    cls[best>18**2]=-1
    # fill unknowns (text, symbols) with the nearest known class
    idx=ndimage.distance_transform_edt(cls<0,return_distances=False,return_indices=True)
    return cls[tuple(idx)]
K1=classify('chart1.webp'); K2=classify('chart2.webp')
# chart 2 UI to ignore: zoom buttons top right, Buy bottom right, terms bottom left
U2=np.zeros(K2.shape,bool); U2[:130,1955:]=True; U2[705:,1860:]=True; U2[720:,:150]=True
def chart_class(x,y):
    u,v=inv(c2,x,y)
    if 0<=u<2000 and 0<=v<753 and not U2[int(v),int(u)]: return K2[int(v),int(u)],2
    u,v=inv(c1,x,y)
    if 0<=u<2000 and 0<=v<838: return K1[int(v),int(u)],1
    return -1,0
# OSM land polygon from the coastline chain
els={e['id']:e for e in load()}
chain=[386064191,105780130,318953096,105780157,1545223767,386187887,386187888,105780067,3303900]
coast=[]
for i in chain:
    P=pts(els[i])
    coast+= P if not coast else P[1:]
def landmask(X0,Y0,NX,NY,R):
    im=Image.new('L',(NX,NY),0); d=ImageDraw.Draw(im)
    P=[(x,y) for x,y in coast]
    # close: from the east end go far east then south, from the west end go far south
    P=[(1862,213)]+P[1:]
    poly=[(9000,213),(9000,-9000)]+[] 
    ring=[(9000,213)]+P+[(-9000,-4736),(-9000,-9000),(9000,-9000)]
    d.polygon([((x-X0)/R,(Y0+NY*R-y)/R) for x,y in ring],fill=1)
    return np.asarray(im)[::-1].astype(bool)   # row 0 = Y0
dem=tifffile.imread('/tmp/claude-0/-home-user-Website-Test/0e328d16-6520-5b4b-be42-d8e07ca0e94d/scratchpad/dl/dem.tif')
def demz(x,y):
    lat,lon=ll(x,y); r=(52-lat)*3600; c=(lon+3)*2400
    r0=int(r); c0=int(c); fr=r-r0; fc=c-c0
    v=dem[r0,c0]*(1-fr)*(1-fc)+dem[r0+1,c0]*fr*(1-fc)+dem[r0,c0+1]*(1-fr)*fc+dem[r0+1,c0+1]*fr*fc
    return v+6.5
# soundings to local
SP=[]
for u,v,d in C2: x,y=fwd(c2,u,v); SP.append((x,y,-d))
for u,v,d in C1:
    x,y=fwd(c1,u,v); a,b=inv(c2,x,y)
    if 0<=a<2000 and 0<=b<753: continue   # chart 2 has its own there
    SP.append((x,y,-d))
print('soundings',len(SP))
BOUND={(1,2):0.0,(2,3):-5.0,(3,4):-10.0,(0,1):12.0,(1,5):-1.0,(2,5):-2.5,(3,5):-5.0,(4,5):-8}
def build(X0,Y0,X1,Y1,R):
    NX=int((X1-X0)/R); NY=int((Y1-Y0)/R)
    xs=X0+(np.arange(NX)+0.5)*R; ys=Y0+(np.arange(NY)+0.5)*R
    cls=np.full((NY,NX),-1); src=np.zeros((NY,NX),int)
    for j,y in enumerate(ys):
        for i,x in enumerate(xs): cls[j,i],src[j,i]=chart_class(x,y)
    LM=landmask(X0,Y0,NX,NY,R)
    # off-chart cells: land if OSM land, else drying mud
    cls[(cls<0)&LM]=0; cls[(cls<0)&~LM]=1
    sea=~LM
    # chart says land but OSM says sea: high drying ground (saltmarsh); OSM land is land
    k=cls.copy(); k[LM]=0
    # boundary points
    pts_=list(SP)
    for (dj,di) in ((0,1),(1,0)):
        a=k[:NY-dj,:NX-di]; b=k[dj:,di:]
        m=(a!=b)
        J,I=np.nonzero(m)
        for j,i in zip(J[::2],I[::2]):
            ca,cb=a[j,i],b[j,i]; key=(min(ca,cb),max(ca,cb))
            if key in BOUND:
                pts_.append((xs[i]+di*R/2,ys[j]+dj*R/2,BOUND[key]))
    P=np.array(pts_)
    XX,YY=np.meshgrid(xs,ys)
    z=griddata(P[:,:2],P[:,2],(XX,YY),method='linear')
    zn=griddata(P[:,:2],P[:,2],(XX,YY),method='nearest'); z[np.isnan(z)]=zn[np.isnan(z)]
    z=ndimage.gaussian_filter(z,1.0)
    lo=np.choose(np.clip(k,0,5),[8.0,0.2,-4.9,-9.9,-30,-12]); hi=np.choose(np.clip(k,0,5),[13.0,12.5,-0.1,-5.1,-10.1,1])
    z=np.clip(z,lo,hi)
    # land heights from Copernicus (DSM, EGM2008 ~ ODN; CD = ODN - 6.5 m)
    for j,y in enumerate(ys):
        for i,x in enumerate(xs):
            if LM[j,i]: z[j,i]=max(15.0,min(110,demz(x,y)))
    return dict(x0=X0,y0=Y0,step=R,nx=NX,ny=NY,z=z,cls=k,land=LM)
G=build(-2400,-600,2800,2480,10.0)
Fn=build(-160,-40,440,560,2.5)
np.save('G_z.npy',G['z']); np.save('F_z.npy',Fn['z'])
json.dump({k:G[k] for k in ('x0','y0','step','nx','ny')},open('G_meta.json','w'))
json.dump({k:Fn[k] for k in ('x0','y0','step','nx','ny')},open('F_meta.json','w'))
def render(Gd,fn):
    z=Gd['z']; img=np.zeros(z.shape+(3,),np.uint8)
    img[z>=13]=(200,184,120); m=(z<13)&(z>=0); img[m]=(np.array((128,176,144))*(1-0.4*(z[m,None]/13))).astype(np.uint8)
    m=(z<0)&(z>=-5); img[m]=(112,176,232); m=(z<-5)&(z>=-10); img[m]=(152,192,240); img[z<-10]=(208,232,232)
    # contour-ish shading of depth
    sh=((np.floor(z)%2)==0)&(z<13); img[sh]=(img[sh]*0.93).astype(np.uint8)
    Image.fromarray(img[::-1]).save(fn)
render(G,'seabed_G.png'); render(Fn,'seabed_F.png')
print('done', G['z'].min(), G['z'].max())
