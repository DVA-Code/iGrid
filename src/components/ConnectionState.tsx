import {Link} from 'react-router-dom'
import {connectionReason,useStore,METERS,meterStatus,MAIN_SN} from '@/lib/store'
import {SourceBadge} from './ui/ui'
export function ConnectionState({project='thermal'}:{project?:'thermal'|'energy'}){
 const s=useStore(),sn=project==='thermal'?MAIN_SN:s.energyMeter
 return <section className="surface p-6 md:p-8"><div className="flex flex-wrap items-center justify-between gap-3"><div><span className="eyebrow">TELEMETRY STATUS</span><h2 className="mt-2 text-xl font-medium">No verified reading available</h2></div><SourceBadge tag={meterStatus(s,sn)}/></div><p className="mt-3 max-w-2xl text-sm text-ink2">{connectionReason(s,sn)}. Measurements appear after identity, units and freshness checks.</p><div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{METERS.map(m=><div key={m.sn} className="flex items-center justify-between gap-2 rounded border hair p-3"><span className="text-xs">{m.short}</span><SourceBadge tag={meterStatus(s,m.sn)}/></div>)}</div><div className="mt-6 flex flex-wrap gap-3"><Link className="console-button primary" to={project==='thermal'?'/thermal/simulation':'/energy/history'}>{project==='thermal'?'Open simulation':'Open stored history'}</Link><Link className="console-button" to="/map">Open grid map</Link></div></section>
}
