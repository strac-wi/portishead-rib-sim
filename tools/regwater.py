import sys,json,math; sys.path.insert(0,'.')
from reg import *
import numpy as np
from PIL import Image,ImageDraw
img=sys.argv[1]; guess=json.loads(sys.argv[2]); out=sys.argv[3]
im=np.asarray(Image.open(img).convert('RGB')).astype(float)
r,g,b=im[...,0],im[...,1],im[...,2]
# teal water: g>r, b>r, darkish, low saturation-ish
water=(g>r+12)&(b>r+8)&(g<150)&(r<90)
H,W=water.shape
Image.fromarray((water*255).astype(np.uint8)).save(out+'_mask.png')
# OSM basin polygon in local metres
e=[e for e in load() if e['id']==26730520][0]; P=pts(e)
def score(s):
    # rasterize polygon into image space
    m=Image.new('L',(W,H),0); d=ImageDraw.Draw(m)
    q=[tuple(inv(s,x,y)) for x,y in P]; d.polygon(q,fill=1)
    m=np.asarray(m).astype(bool)
    inter=(m&water).sum(); uni=(m|water)[200:2300].sum()
    return inter/ max(1,(m.sum()+ (water&m).sum()*0 + 1)) - 0.5*((m&~water).sum()/max(1,m.sum())), m
pairs=[((u,v),(x,y)) for (u,v,x,y) in guess]
s=np.array(fit(pairs))
best=score(s)[0]; print('init',best)
steps=[0.004*abs(s[0]),0.004*abs(s[0]),3,3]
for it in range(6):
  for k in range(4):
    for sgn in (1,-1):
      while True:
        t=s.copy(); t[k]+=sgn*steps[k]; sc=score(t)[0]
        if sc>best: best,s=sc,t
        else: break
  steps=[x*0.5 for x in steps]
print('final',best,list(s),'m/px',math.hypot(s[0],s[1]),'rot',math.degrees(math.atan2(s[1],s[0])))
json.dump(list(s),open(out+'.json','w'))
overlay(img,s,out+'_ov.png')
