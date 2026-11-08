import json,math,re,datetime as dt
s=open('/home/user/Website-Test/loch-ranza/index.html').read().split('\n')[4464]
i=s.index('tab: ')+5; d=0
for j,ch in enumerate(s[i:]):
    if ch=='[': d+=1
    elif ch==']':
        d-=1
        if d==0: break
PE=json.loads(s[i:i+j+1])
names=[e['n'] for e in PE]
# Avonmouth TICON-4
AV={}
for line in open('/tmp/claude-0/-home-user-Website-Test/0e328d16-6520-5b4b-be42-d8e07ca0e94d/scratchpad/dl/ticon4.csv'):
    p=line.split(',')
    if p[0]=='51.50775' and p[1]=='-2.71275': AV[p[2]]=(float(p[3])/100,float(p[4])%360)
AV['LDA2']=AV.pop('LAMBDA2'); AV['EPS2']=AV.pop('EP2')
tab=[]
for e in PE:
    e=dict(e); n=e['n']
    if n in AV: e['A'],e['g']=round(AV[n][0],5),round(AV[n][1],2)
    else: e['A']=0; print('missing',n)
    tab.append(e)
idx={e['n']:k for k,e in enumerate(tab)}
tab.append({'n':'2MS6','sh':[[idx['M2'],2.0],[idx['S2'],1.0]],'A':round(AV['2MS6'][0],5),'g':round(AV['2MS6'][1],2)})
tab.append({'n':'2SM2','sh':[[idx['S2'],2.0],[idx['M2'],-1.0]],'A':round(AV['2SM2'][0],5),'g':round(AV['2SM2'][1],2)})
tab.append({'n':'M8','sh':[[idx['M2'],4.0]],'A':round(AV['M8'][0],5),'g':round(AV['M8'][1],2)})
tab.append({'n':'MSN6','sh':[[idx['M2'],1.0],[idx['S2'],1.0],[idx['N2'],1.0]],'A':0,'g':0})
print('total amplitude listed',sum(e['A'] for e in tab))
ASTRO=[[270.434164,13.1763965268,-0.0000850,0.000000039],[279.696678,0.9856473354,0.00002267,0],[334.329556,0.1114040803,-0.0007739,-0.00000026],[-259.183275,0.0529539222,-0.0001557,-0.000000050],[281.220844,0.0000470684,0.0000339,0.000000070]]
def predict(tab,ms):
    jd=ms/86400000+719163; d=jd-693595.5; D=d/10000
    a=[((c[0]+c[1]*d+c[2]*D*D+c[3]*D*D*D)/360)%1 for c in ASTRO]
    astro=[(jd%1)+a[1]-a[0],a[0],a[1],a[2],a[3],a[4]]
    F=[0]*len(tab);U=[0]*len(tab);V=[0]*len(tab);h=0
    for i,e in enumerate(tab):
        if 'sh' in e and e['sh']:
            f=1;u=0;v=0
            for j,c in e['sh']: f*=F[j]**abs(c); u+=U[j]*c; v+=V[j]*c
            F[i],U[i],V[i]=f,u,v
        else:
            re_,im=1,0
            for q in e['sat']:
                uu=(q[0]*astro[3]+q[1]*astro[4]+q[2]*astro[5]+q[3])%1
                re_+=q[4]*math.cos(2*math.pi*uu); im+=q[4]*math.sin(2*math.pi*uu)
            F[i]=math.hypot(re_,im); U[i]=math.atan2(im,re_)/(2*math.pi)
            v=e['semi']
            for k in range(6): v+=e['d'][k]*astro[k]
            V[i]=v%1
        if e['A']: h+=F[i]*e['A']*math.cos(2*math.pi*(V[i]+U[i])-e['g']*math.pi/180)
    return h
json.dump(tab,open('avon_tab.json','w'))
