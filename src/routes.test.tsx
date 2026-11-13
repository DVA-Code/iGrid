import {beforeAll,expect,it,vi} from 'vitest'
import {renderToString} from 'react-dom/server'
import {MemoryRouter} from 'react-router-dom'
vi.mock('@/pages/map/GridMap',()=>({GridMap:()=> <div>Campus network map</div>}))
vi.mock('@/components/charts/EChart',()=>({EChart:()=> <div>Chart</div>,baseOption:()=>({}),useChartTheme:()=>({ink:'#222',ink2:'#444',ink3:'#888',s1:'#fff',s2:'#eee',pa:'red',pb:'gold',pc:'blue',teal:'green',steel:'blue',sun:'gold',ember:'orange',alpha:()=> '#8888'})}))
beforeAll(()=>{
 vi.stubGlobal('document',{compatMode:'CSS1Compat',documentElement:{dataset:{},style:{}},createElement:()=>({getContext:()=>null})})
 vi.stubGlobal('window',{matchMedia:()=>({matches:true}),location:{hash:''},addEventListener:()=>{},removeEventListener:()=>{}})
 vi.stubGlobal('location',{hostname:'localhost',protocol:'http:',href:'http://localhost:5173/'})
 vi.stubGlobal('SVGElement',class {})
 vi.spyOn(console,'error').mockImplementation(()=>{}) // React's expected SSR layout-effect warning.
})
it('renders every project section with live, demo and absent telemetry in both themes',async()=>{
 const {Routed}=await import('./App'),{useStore,METERS}=await import('./lib/store'),{PROJECTS}=await import('./lib/projects.config')
 useStore.getInitialState=()=>useStore.getState()
 const now=Date.now(),r={t:now,receivedAt:now,va:230,vb:231,vc:229,ia:90,ib:110,ic:100,pfa:.9,pfb:.88,pfc:.92,pKw:62.1,origin:'MEASURED' as const}
 const paths=['/','/about','/people',...PROJECTS.flatMap(p=>p.sections.length?p.sections.map(s=>`${p.route}/${s.id}`):[p.route])]
 for(const theme of ['light','dark'] as const)for(const source of ['mqtt','demo','empty'] as const){
  useStore.setState({theme,adapter:source==='demo'?'demo':'mqtt',bridge:'open',broker:'LIVE',latest:source==='empty'?{...r,t:0}:r,history:[{...r,t:now-60000},r],meters:source==='empty'?{}:Object.fromEntries(METERS.map(m=>[m.sn,{latest:{...r,sn:m.sn},receivedAt:now,history:[{...r,t:now-60000,sn:m.sn},{...r,sn:m.sn}]}]))})
  for(const path of paths){const html=renderToString(<MemoryRouter initialEntries={[path]}><Routed/></MemoryRouter>);expect(html,`${theme}/${source}/${path}`).toContain('main');expect(html).not.toContain('This view could not be displayed');const at=html.indexOf('NaN');if(at>=0)throw Error(`${theme}/${source}/${path}: ${html.slice(at-90,at+90)}`)}
 }
})
