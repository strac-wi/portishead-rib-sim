import sys,json,math; sys.path.insert(0,'.')
from geo import *
import numpy as np
from PIL import Image,ImageDraw
def fit(pairs):
    # pairs: [((u,v) image px, (x,y) local m)] ; image v down. model: x = a*u - b*v + c ; y = -(b*u + a*v) + d  (similarity with y flip)
    A=[];B=[]
    for (u,v),(x,y) in pairs:
        A.append([u,-v,1,0]); B.append(x)
        A.append([-v,-u,0,1]); B.append(y)
    s=np.linalg.lstsq(np.array(A,float),np.array(B,float),rcond=None)[0]
    return s
def fwd(s,u,v):
    a,b,c,d=s; return (a*u-b*v+c, -v*a-u*b+d)
def inv(s,x,y):
    a,b,c,d=s; M=np.array([[a,-b],[-b,-a]]); return np.linalg.solve(M,[x-c,y-d])
def overlay(img,s,out,ids=None,col=(255,0,0)):
    im=Image.open(img).convert('RGB'); dr=ImageDraw.Draw(im)
    for e in load():
        t=e.get('tags',{})
        if t.get('man_made') in('pier',) or t.get('waterway')=='dock' or t.get('natural')=='coastline' or (ids and e['id'] in ids):
            q=[tuple(inv(s,x,y)) for x,y in pts(e)]
            if len(q)>1: dr.line(q,fill=col,width=2)
    im.save(out)
