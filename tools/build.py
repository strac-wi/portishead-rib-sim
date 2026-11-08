#!/usr/bin/env python3
# Builds portishead/index.html from src/: the page shell, three.js r128 from cdnjs, the data block and the code.
import os
H=os.path.dirname(os.path.abspath(__file__)); S=os.path.join(H,'..','src')
read=lambda f: open(os.path.join(S,f),encoding='utf-8').read()
js=''.join(read(f) for f in ['pdata.js','sim1.js','sim2.js','sim2b.js','sim3a.js','sim3b.js','sim3c.js','sim4.js'])
out=read('head.html')+'\n<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>\n<script>\n'+js+'\n</script>\n</body>\n</html>\n'
open(os.path.join(H,'..','index.html'),'w',encoding='utf-8').write(out)
print('index.html', len(out))
