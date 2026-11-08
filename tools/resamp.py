import sys,json,math; sys.path.insert(0,'.')
from reg import *
import numpy as np
from PIL import Image
def resample(img,s,X0,Y0,X1,Y1,res):
    im=np.asarray(Image.open(img).convert('RGB')).astype(np.float32)
    xs=np.arange(X0,X1,res); ys=np.arange(Y1,Y0,-res)
    XX,YY=np.meshgrid(xs,ys)
    a,b,c,d=s; M=np.array([[a,-b],[-b,-a]]); Mi=np.linalg.inv(M)
    U=Mi[0,0]*(XX-c)+Mi[0,1]*(YY-d); V=Mi[1,0]*(XX-c)+Mi[1,1]*(YY-d)
    ui=np.clip(np.round(U).astype(int),0,im.shape[1]-1); vi=np.clip(np.round(V).astype(int),0,im.shape[0]-1)
    out=im[vi,ui]; valid=(U>=0)&(U<im.shape[1])&(V>=0)&(V<im.shape[0])
    return out,valid
