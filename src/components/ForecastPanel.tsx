import {useForecast} from '@/lib/forecast'
import {Card,CardHead,SourceBadge,Stat} from './ui/ui'
import {baseOption,EChart,useChartTheme} from './charts/EChart'
export function ForecastPanel({sn}:{sn:string}){
 const r=useForecast(sn),t=useChartTheme()
 return <Card><CardHead title="Demand prediction" sub="Database-backed experimental model" right={<SourceBadge tag="CALCULATED"/>}/>{r?.points.length?<EChart height={220} ariaLabel="Stored forecast" option={{...baseOption(t),xAxis:{type:'time'},yAxis:{type:'value',name:'kW'},series:[{type:'line',showSymbol:false,data:r.points.map(p=>[p.t,p.p]),lineStyle:{color:t.teal,type:'dashed'}}]}}/>:<p className="py-7 text-sm text-ink3">{r?.basis??'Connect the telemetry backend to inspect prediction coverage.'}</p>}<div className="mt-3 flex flex-wrap items-center justify-between gap-5 border-t hair pt-4"><p className="max-w-xl text-xs text-ink3">Predictions use recorded local-hour demand profiles and the latest valid reading. They are estimates. Generated forecasts are preserved for later comparison.</p><Stat label="Saved forecasts" v={r?.savedForecasts??null} digits={0}/></div></Card>
}
