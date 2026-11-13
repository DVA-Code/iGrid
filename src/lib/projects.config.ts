export interface ProjectDef { id:'thermal'|'energy'|'inverter'|'map';label:string;concept:string;summary:string;route:string;sections:{id:string;label:string}[] }
const sections=(items:string[][])=>items.map(([id,label])=>({id,label}))
export const PROJECTS:ProjectDef[]=[
 {id:'thermal',label:'Transformer thermal',concept:'Transformer thermal',summary:'Live electrical inputs and an explainable thermal sensitivity model.',route:'/thermal',sections:sections([['overview','Overview'],['model','Formulas'],['simulation','Simulation'],['history','History'],['dataflow','Data path']])},
 {id:'energy',label:'Energy analytics',concept:'Building energy analytics',summary:'Demand, power quality and stored energy history across seven meters.',route:'/energy',sections:sections([['live','Live readings'],['quality','Power quality'],['model','Formulas'],['seasons','Seasonal analysis'],['history','History'],['dataflow','Data path']])},
 {id:'inverter',label:'PV inverter',concept:'PV inverter laboratory',summary:'Explore photovoltaic conversion and inverter design in simulation.',route:'/inverter',sections:sections([['design','Design'],['lab','Simulation']])},
 {id:'map',label:'Live grid map',concept:'Live campus grid',summary:'Seven building streams on the campus study network.',route:'/map',sections:[]},
]
export const projectById=(id:string|undefined)=>PROJECTS.find(p=>p.id===id)
