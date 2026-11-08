import json,math,datetime as dt,sys; sys.path.insert(0,'.')
exec(open('tide.py').read().split("json.dump(tab")[0])
NOV="""1 0506 3.0 1111 11.1 1736 3.4 2351 10.4
2 0601 3.8 1224 10.4 1854 4.0
3 0122 10.0 0740 4.1 1401 10.3 2046 3.8
4 0245 10.3 0915 3.6 1512 10.9 2155 3.1
5 0348 11.0 1018 2.8 1611 11.7 2252 2.3
6 0442 11.8 1112 2.1 1703 12.4 2343 1.7
7 0529 12.5 1202 1.5 1749 12.8
8 0029 1.4 0613 12.9 1248 1.3 1831 13.0
9 0114 1.3 0651 13.0 1332 1.3 1910 13.0
10 0155 1.4 0728 12.9 1412 1.5 1945 12.7
11 0230 1.7 0801 12.7 1445 1.9 2018 12.4
12 0257 2.1 0831 12.3 1510 2.2 2048 11.9
13 0316 2.4 0900 11.9 1530 2.5 2116 11.5
14 0334 2.6 0928 11.4 1553 2.8 2144 11.0
15 0359 2.9 0958 11.0 1624 3.0 2218 10.6
16 0432 3.2 1036 10.5 1703 3.4 2302 10.1
17 0515 3.7 1127 10.0 1757 3.9
18 0001 9.7 0615 4.2 1238 9.7 1913 4.1
19 0119 9.6 0740 4.4 1407 9.9 2037 3.9
20 0245 10.0 0909 4.0 1521 10.6 2153 3.4
21 0353 10.8 1025 3.4 1621 11.4 2300 2.8
22 0450 11.6 1128 2.7 1714 12.1 2358 2.2
23 0539 12.4 1223 2.1 1803 12.7
24 0049 1.7 0626 13.0 1313 1.7 1850 13.2
25 0137 1.4 0711 13.4 1401 1.5 1937 13.3
26 0223 1.3 0756 13.5 1447 1.4 2024 13.3
27 0307 1.4 0842 13.3 1531 1.5 2112 13.0
28 0348 1.7 0929 13.0 1614 1.8 2200 12.5
29 0429 2.0 1018 12.5 1658 2.2 2249 11.9
30 0513 2.5 1110 11.8 1746 2.7 2344 11.2"""
DEC="""5 0401 11.1 1029 2.9 1625 11.6 2300 2.7
6 0453 11.5 1124 2.5 1715 11.8 2352 2.3
7 0540 12.1 1213 2.1 1801 12.1
8 0038 2.1 0623 12.3 1259 2.0 1844 12.2
9 0122 1.9 0702 12.4 1341 2.0 1923 12.2
10 0202 2.0 0739 12.3 1420 2.1 2000 12.0
16 0505 3.0 1109 10.9 1738 3.1 2334 10.6
25 0210 1.3 0746 13.5 1440 1.3 2017 13.3
26 0301 1.2 0835 13.6 1530 1.2 2106 13.4"""
def parse(txt,month):
    out=[]
    for line in txt.strip().split('\n'):
        p=line.split(); day=int(p[0])
        for k in range(1,len(p),2):
            hh,mm=int(p[k][:2]),int(p[k][2:]); h=float(p[k+1])
            t=dt.datetime(2026,month,day,hh,mm,tzinfo=dt.timezone.utc).timestamp()*1000
            out.append((t,h,h>6.5))
    return out
OBS=parse(NOV,11); VAL=parse(DEC,12)
def extremes(t0,t1,shift_ms,step=60000):
    out=[]; ts=[]; hs=[]
    t=t0
    while t<=t1: ts.append(t); hs.append(predict(tab,t-shift_ms)); t+=step
    for i in range(1,len(hs)-1):
        if (hs[i]-hs[i-1])*(hs[i+1]-hs[i])<0:
            # parabolic refine
            a,b,c=hs[i-1],hs[i],hs[i+1]; den=a-2*b+c; off=0.5*(a-c)/den if den else 0
            out.append((ts[i]+off*step, b-0.25*(a-c)*off, hs[i]>hs[i-1]))
    return out
def match(obs,shift_ms):
    t0=min(o[0] for o in obs)-4*3600e3; t1=max(o[0] for o in obs)+4*3600e3
    ex=extremes(t0,t1,shift_ms,120000)
    pairs=[]
    for o in obs:
        cand=[e for e in ex if e[2]==o[2]]
        e=min(cand,key=lambda e:abs(e[0]-o[0])); pairs.append((o,e))
    return pairs
import numpy as np
best=None
for sh in range(-30,31,3):
    P=match(OBS,sh*60000)
    dtm=np.array([(o[0]-e[0])/60000 for o,e in P])
    A=np.array([[e[1],1] for o,e in P]); b=np.array([o[1] for o,e in P])
    k,z=np.linalg.lstsq(A,b,rcond=None)[0]; res=b-A@[k,z]
    sc=np.sqrt((res**2).mean())+np.sqrt((dtm**2).mean())/60
    if best is None or sc<best[0]: best=(sc,sh,k,z,np.sqrt((res**2).mean()),dtm.mean(),np.sqrt((dtm**2).mean()))
print('best',best)
sc,sh,k,z,_,_,_=best
# refine shift at 1 min, and separate HW/LW time residuals
for sh2 in range(sh-3,sh+4):
    P=match(OBS,sh2*60000); dtm=np.array([(o[0]-e[0])/60000 for o,e in P]); hw=np.array([o[2] for o,e in P])
    A=np.array([[e[1],1] for o,e in P]); b=np.array([o[1] for o,e in P]); kk,zz=np.linalg.lstsq(A,b,rcond=None)[0]; res=b-A@[kk,zz]
    print(sh2,'k',round(kk,4),'z',round(zz,3),'hRMS',round(float(np.sqrt((res**2).mean())),3),'tHW',round(float(dtm[hw].mean()),1),round(float(dtm[hw].std()),1),'tLW',round(float(dtm[~hw].mean()),1),round(float(dtm[~hw].std()),1),'resHW',round(float(res[hw].mean()),2),'resLW',round(float(res[~hw].mean()),2))
for name,obs in (('NOV',OBS),('DEC',VAL)):
    P=match(obs,0); dtm=np.array([(o[0]-e[0])/60000 for o,e in P]); res=np.array([o[1]-(0.9943*e[1]+6.985) for o,e in P])
    print(name,'n',len(P),'height RMS',round(float(np.sqrt((res**2).mean())),3),'max',round(float(abs(res).max()),2),'time RMS min',round(float(np.sqrt((dtm**2).mean())),1),'max',round(float(abs(dtm).max()),1))
